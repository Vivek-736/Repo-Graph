import { createAdminDatabaseClient } from "@/lib/supabase/admin";
import { transitiveWalk, WalkDirection } from "@/lib/parser/graph";
import { ParsedEdge, EdgeKind } from "@/lib/parser/types";

/**
 * Tool 1: Summary of the whole analysis
 */
export async function getAnalysisSummary(analysisId: string, orgId: string) {
  const db = createAdminDatabaseClient();
  if (!db) throw new Error("Database unavailable");

  const { data: analysis } = await db
    .from("analyses")
    .select("id, status, commit_hash, files_count, edges_count, coverage_percentage, summary")
    .eq("id", analysisId)
    .eq("organization_id", orgId)
    .single();

  if (!analysis) throw new Error("Analysis not found or access denied");

  const { data: files } = await db
    .from("files")
    .select("path, lines_count, fan_in, fan_out")
    .eq("analysis_id", analysisId)
    .order("fan_in", { ascending: false })
    .limit(5);

  return {
    analysisId,
    commitHash: analysis.commit_hash,
    totalFiles: analysis.files_count,
    totalEdges: analysis.edges_count,
    coverage: analysis.coverage_percentage,
    mostDependedOn: files || [],
  };
}

/**
 * Tool 2: Searching files by part of a path
 */
export async function searchFilesByPath(analysisId: string, orgId: string, query: string) {
  const db = createAdminDatabaseClient();
  if (!db) throw new Error("Database unavailable");

  const { data: files } = await db
    .from("files")
    .select("path, lines_count, fan_in, fan_out")
    .eq("analysis_id", analysisId)
    .ilike("path", `%${query}%`)
    .limit(25);

  return {
    query,
    count: files?.length || 0,
    files: files || [],
  };
}

/**
 * Tool 3: Listing files by role
 */
export async function listFilesByRole(analysisId: string, orgId: string, role: string) {
  const db = createAdminDatabaseClient();
  if (!db) throw new Error("Database unavailable");

  const { data: roleRecords } = await db
    .from("file_roles")
    .select("role, confidence, source, files:file_id(path, lines_count)")
    .eq("analysis_id", analysisId)
    .ilike("role", `%${role}%`)
    .limit(30);

  const results = (roleRecords || []).map((r) => {
    const f = r.files as unknown as { path: string; lines_count: number } | null;
    return {
      path: f?.path || "unknown",
      role: r.role,
      confidence: r.confidence,
      linesCount: f?.lines_count || 0,
    };
  });

  return {
    role,
    count: results.length,
    files: results,
  };
}

/**
 * Tool 4: Direct neighbours of a file (what it imports, what imports it)
 */
export async function getFileNeighbours(analysisId: string, orgId: string, filePath: string) {
  const db = createAdminDatabaseClient();
  if (!db) throw new Error("Database unavailable");

  const { data: targetFile } = await db
    .from("files")
    .select("id, path, lines_count")
    .eq("analysis_id", analysisId)
    .eq("path", filePath)
    .single();

  if (!targetFile) throw new Error(`File '${filePath}' not found in analysis`);

  // Outgoing dependencies: targetFile -> other files
  const { data: outgoing } = await db
    .from("edges")
    .select("raw_specifier, target_file_id, files:target_file_id(path)")
    .eq("analysis_id", analysisId)
    .eq("source_file_id", targetFile.id);

  // Incoming dependents: other files -> targetFile
  const { data: incoming } = await db
    .from("edges")
    .select("raw_specifier, source_file_id, files:source_file_id(path)")
    .eq("analysis_id", analysisId)
    .eq("target_file_id", targetFile.id);

  const dependencies: string[] = [];
  if (outgoing) {
    for (const e of outgoing) {
      const p = (e.files as unknown as { path: string })?.path || e.raw_specifier;
      if (p && !dependencies.includes(p)) dependencies.push(p);
    }
  }

  const dependents: string[] = [];
  if (incoming) {
    for (const e of incoming) {
      const p = (e.files as unknown as { path: string })?.path;
      if (p && !dependents.includes(p)) dependents.push(p);
    }
  }

  return {
    filePath,
    dependenciesCount: dependencies.length,
    dependencies,
    dependentsCount: dependents.length,
    dependents,
  };
}

/**
 * Tool 5: Transitive walk in either direction (upstream: blast radius, downstream: dependency chain)
 * Uses the exact same transitiveWalk pure function that powers the canvas.
 */
export async function performTransitiveWalk(
  analysisId: string,
  orgId: string,
  filePath: string,
  direction: "upstream" | "downstream",
  depth: number = 2
) {
  const db = createAdminDatabaseClient();
  if (!db) throw new Error("Database unavailable");

  // Fetch all internal resolved edges for this analysis
  const { data: allFiles } = await db
    .from("files")
    .select("id, path")
    .eq("analysis_id", analysisId);

  const fileIdToPath = new Map((allFiles || []).map((f) => [f.id, f.path]));

  const { data: allEdges } = await db
    .from("edges")
    .select("id, source_file_id, target_file_id, kind, raw_specifier, resolved")
    .eq("analysis_id", analysisId)
    .eq("resolved", true);

  const parsedEdges: ParsedEdge[] = (allEdges || [])
    .filter((e) => e.target_file_id !== null)
    .map((e) => ({
      id: e.id,
      source: fileIdToPath.get(e.source_file_id) || "unknown",
      target: e.target_file_id ? fileIdToPath.get(e.target_file_id) || null : null,
      kind: e.kind as EdgeKind,
      specifier: e.raw_specifier,
      resolved: e.resolved,
    }));

  const steps = transitiveWalk(filePath, parsedEdges, direction as WalkDirection, Math.min(depth, 4));

  return {
    startPath: filePath,
    direction,
    depth,
    affectedFilesCount: steps.length,
    steps,
  };
}

/**
 * Tool 6: The route table
 */
export async function getRouteTable(analysisId: string, orgId: string, filter?: string) {
  const db = createAdminDatabaseClient();
  if (!db) throw new Error("Database unavailable");

  let query = db
    .from("routes")
    .select("method, path, files:file_id(path)")
    .eq("analysis_id", analysisId);

  if (filter) {
    query = query.or(`path.ilike.%${filter}%,method.ilike.%${filter}%`);
  }

  const { data: routes } = await query.limit(50);

  const formatted = (routes || []).map((r) => {
    const f = r.files as unknown as { path: string } | null;
    return {
      method: r.method,
      path: r.path,
      file: f?.path || "unknown",
    };
  });

  return {
    totalRoutes: formatted.length,
    routes: formatted,
  };
}