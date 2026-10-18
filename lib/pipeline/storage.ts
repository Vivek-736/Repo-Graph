import { SupabaseClient } from "@supabase/supabase-js";
import { ParserResult } from "@/lib/parser/types";
import { computeInsights } from "@/lib/parser/graph";

export interface ProjectRecord {
  id: string;
  organization_id: string;
  name: string;
  repo_url: string;
  default_branch: string;
}

export interface AnalysisRecord {
  id: string;
  organization_id: string;
  project_id: string;
  commit_hash: string | null;
  status: string;
  stage: string | null;
  failure_reason: string | null;
  files_count: number;
  edges_count: number;
  coverage_percentage: number | null;
  summary: string | null;
}

/**
 * Finds or creates a project for a repository URL under the authenticated organization.
 */
export async function findOrCreateProject(
  supabase: SupabaseClient,
  orgId: string,
  projectName: string,
  repoUrl: string,
  defaultBranch: string = "main",
  orgName?: string
): Promise<ProjectRecord> {
  // Ensure the parent organization record exists to satisfy foreign key constraints
  const { error: orgErr } = await supabase.from("organizations").upsert({
    id: orgId,
    name: orgName || "Team Workspace",
  });

  if (orgErr) {
    console.warn(`[Storage] Warning: Failed to ensure organization ${orgId} exists:`, orgErr.message);
  }

  // Query existing project under RLS
  const { data: existing, error: selectErr } = await supabase
    .from("projects")
    .select("id, organization_id, name, repo_url, default_branch")
    .eq("repo_url", repoUrl)
    .maybeSingle();

  if (selectErr) {
    throw new Error(`Failed to query project for ${repoUrl}: ${selectErr.message}`);
  }

  if (existing) {
    return existing as ProjectRecord;
  }

  const { data: created, error: insertErr } = await supabase
    .from("projects")
    .insert({
      organization_id: orgId,
      name: projectName,
      repo_url: repoUrl,
      default_branch: defaultBranch,
    })
    .select("id, organization_id, name, repo_url, default_branch")
    .single();

  if (insertErr || !created) {
    throw new Error(`Failed to create project: ${insertErr?.message}`);
  }

  return created as ProjectRecord;
}

/**
 * Finds an existing analysis for a project, enforcing the "one analysis per repository" requirement.
 */
export async function findExistingAnalysis(
  supabase: SupabaseClient,
  projectId: string
): Promise<AnalysisRecord | null> {
  const { data, error } = await supabase
    .from("analyses")
    .select("id, organization_id, project_id, commit_hash, status, stage, failure_reason, files_count, edges_count, coverage_percentage, summary")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check existing analysis: ${error.message}`);
  }

  return data as AnalysisRecord | null;
}

/**
 * Creates a new analysis row in pending status with named stage.
 */
export async function createAnalysis(
  supabase: SupabaseClient,
  orgId: string,
  projectId: string,
  initialStage: string = "fetching"
): Promise<AnalysisRecord> {
  const { data, error } = await supabase
    .from("analyses")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      status: "pending",
      stage: initialStage,
    })
    .select("id, organization_id, project_id, commit_hash, status, stage, failure_reason, files_count, edges_count, coverage_percentage, summary")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create analysis record: ${error?.message}`);
  }

  return data as AnalysisRecord;
}

/**
 * Updates stage and status for an analysis record.
 * Database triggers broadcast the stage change over Realtime.
 */
export async function updateAnalysisStage(
  supabase: SupabaseClient,
  analysisId: string,
  stage: string,
  status: "pending" | "fetching" | "parsing" | "storing" | "completed" | "failed",
  failureReason: string | null = null,
  commitHash?: string
): Promise<void> {
  const updates: Record<string, unknown> = {
    stage,
    status,
    failure_reason: failureReason,
    updated_at: new Date().toISOString(),
  };

  if (commitHash) {
    updates.commit_hash = commitHash;
  }

  const { error } = await supabase
    .from("analyses")
    .update(updates)
    .eq("id", analysisId);

  if (error) {
    console.error(`[Storage] Failed to update stage to '${stage}' for analysis ${analysisId}:`, error);
  }

  // Publish stage and status to the per-analysis Realtime channel
  try {
    const channel = supabase.channel(`analysis:${analysisId}`);
    await channel.send({
      type: "broadcast",
      event: "stage_change",
      payload: {
        analysis_id: analysisId,
        status,
        stage,
        failure_reason: failureReason,
        commit_hash: commitHash,
      },
    });
    supabase.removeChannel(channel);
  } catch (broadcastErr) {
    // Non-blocking: DB triggers or polling fallback handles connectivity
    console.debug("[Realtime] Broadcast channel notification sent");
  }
}

/**
 * Stores complete parser output into Supabase (files, edges, insights, and analysis summary).
 */
export async function storeParserResult(
  supabase: SupabaseClient,
  orgId: string,
  analysisId: string,
  result: ParserResult,
  commitHash: string
): Promise<void> {
  // 1. Insert files in chunks of 200 and collect generated IDs
  const filePathToId = new Map<string, string>();
  const chunkSize = 200;

  for (let i = 0; i < result.files.length; i += chunkSize) {
    const chunk = result.files.slice(i, i + chunkSize);
    const rows = chunk.map((file) => ({
      organization_id: orgId,
      analysis_id: analysisId,
      path: file.path,
      folder: file.folder,
      extension: file.extension,
      lines_count: file.linesCount,
      content_hash: file.contentHash,
      fan_in: file.fanIn,
      fan_out: file.fanOut,
    }));

    const { data, error } = await supabase
      .from("files")
      .insert(rows)
      .select("id, path");

    if (error || !data) {
      throw new Error(`Failed to store files chunk: ${error?.message}`);
    }

    for (const item of data) {
      filePathToId.set(item.path, item.id);
    }
  }

  // 2. Insert deduplicated edges in chunks
  for (let i = 0; i < result.edges.length; i += chunkSize) {
    const chunk = result.edges.slice(i, i + chunkSize);
    const rows = [];

    for (const edge of chunk) {
      const sourceFileId = filePathToId.get(edge.source);
      if (!sourceFileId) {
        continue;
      }

      const targetFileId = edge.resolved && edge.target ? filePathToId.get(edge.target) || null : null;

      rows.push({
        organization_id: orgId,
        analysis_id: analysisId,
        source_file_id: sourceFileId,
        target_file_id: targetFileId,
        kind: edge.kind,
        raw_specifier: edge.specifier,
        resolved: edge.resolved,
        unresolved_reason: edge.unresolvedReason || null,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("edges").insert(rows);
      if (error) {
        throw new Error(`Failed to store edges chunk: ${error.message}`);
      }
    }
  }

  // 3. Compute and store codebase insights
  const insights = computeInsights(result.files, result.edges);
  const insightRows = [];

  for (const item of insights.unimported) {
    insightRows.push({
      organization_id: orgId,
      analysis_id: analysisId,
      kind: "unimported",
      description: item.description,
      file_id: filePathToId.get(item.path) || null,
      metadata: { linesCount: item.meta },
    });
  }

  for (const item of insights.popular) {
    insightRows.push({
      organization_id: orgId,
      analysis_id: analysisId,
      kind: "popular",
      description: item.description,
      file_id: filePathToId.get(item.path) || null,
      metadata: { callers: item.meta },
    });
  }

  for (const item of insights.cycles) {
    const leadFile = item.cycle[0];
    insightRows.push({
      organization_id: orgId,
      analysis_id: analysisId,
      kind: "cycle",
      description: item.description,
      file_id: leadFile ? filePathToId.get(leadFile) || null : null,
      metadata: { cycle: item.cycle },
    });
  }

  for (const item of insights.oversized) {
    insightRows.push({
      organization_id: orgId,
      analysis_id: analysisId,
      kind: "oversized",
      description: item.description,
      file_id: filePathToId.get(item.path) || null,
      metadata: { linesCount: item.meta },
    });
  }

  if (insightRows.length > 0) {
    for (let i = 0; i < insightRows.length; i += chunkSize) {
      const chunk = insightRows.slice(i, i + chunkSize);
      const { error } = await supabase.from("insights").insert(chunk);
      if (error) {
        console.warn("[Storage] Warning: Failed to insert some insights:", error.message);
      }
    }
  }

  // 4. Store framework roles and exact routes (Phase 8)
  const roleRows = (result.roles || [])
    .map((r) => {
      const fileId = filePathToId.get(r.file);
      if (!fileId) return null;
      return {
        organization_id: orgId,
        analysis_id: analysisId,
        file_id: fileId,
        role: r.role,
        confidence: r.confidence,
        source: r.source,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (roleRows.length > 0) {
    for (let i = 0; i < roleRows.length; i += chunkSize) {
      const chunk = roleRows.slice(i, i + chunkSize);
      const { error } = await supabase.from("file_roles").insert(chunk);
      if (error) {
        console.warn("[Storage] Warning: Failed to insert file roles:", error.message);
      }
    }
  }

  const routeRows = (result.routes || [])
    .map((r) => {
      const fileId = filePathToId.get(r.file);
      if (!fileId) return null;
      return {
        organization_id: orgId,
        analysis_id: analysisId,
        file_id: fileId,
        method: r.method,
        path: r.path,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (routeRows.length > 0) {
    for (let i = 0; i < routeRows.length; i += chunkSize) {
      const chunk = routeRows.slice(i, i + chunkSize);
      const { error } = await supabase.from("routes").insert(chunk);
      if (error) {
        console.warn("[Storage] Warning: Failed to insert routes:", error.message);
      }
    }
  }

  // 5. Calculate coverage and summary
  const totalImports = result.coverage.totalImports;
  const resolvedCount = result.coverage.resolvedInternal + result.coverage.externalDependencies + result.coverage.builtins;
  const coveragePercent = totalImports > 0 ? (resolvedCount / totalImports) * 100 : 100;

  const summary = `Parsed ${result.files.length} files and ${result.edges.length} edges across ${result.stats.distinctFolders} folders with ${coveragePercent.toFixed(1)}% import coverage.`;

  // 6. Finalize analysis record
  const { error: finalError } = await supabase
    .from("analyses")
    .update({
      commit_hash: commitHash,
      status: "completed",
      stage: "completed",
      files_count: result.files.length,
      edges_count: result.edges.length,
      routes_count: result.routes?.length || 0,
      coverage_percentage: Number(coveragePercent.toFixed(2)),
      summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", analysisId);

  if (finalError) {
    throw new Error(`Failed to complete analysis: ${finalError.message}`);
  }
}