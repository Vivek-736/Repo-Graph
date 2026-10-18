"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerDatabaseClient } from "@/lib/supabase/server";
import { createAdminDatabaseClient } from "@/lib/supabase/admin";
import { withAiTrace } from "@/lib/ai/client";
import { classifyRolesWithGemini, ClassifiedRoleResult } from "@/lib/ai/explainer";

export interface ClassifyResponse {
  success: boolean;
  classifiedCount: number;
  roles?: ClassifiedRoleResult[];
  error?: string;
}

/**
 * Server action to classify files that no framework adapter identified.
 * Assigns non-routable roles only (service, repository, model, util, config, component, hook).
 */
export async function classifyUnmatchedFiles(
  analysisId: string
): Promise<ClassifyResponse> {
  const { orgId } = await auth.protect();
  if (!orgId) {
    return { success: false, classifiedCount: 0, error: "Authentication required." };
  }

  const userClient = await createServerDatabaseClient();
  const dbClient = userClient || createAdminDatabaseClient();
  if (!dbClient) {
    return { success: false, classifiedCount: 0, error: "Database client unavailable." };
  }

  try {
    // 1. Get all files for this analysis
    const { data: allFiles } = await dbClient
      .from("files")
      .select("id, path")
      .eq("analysis_id", analysisId);

    if (!allFiles || allFiles.length === 0) {
      return { success: true, classifiedCount: 0 };
    }

    // 2. Get existing role assignments
    const { data: existingRoles } = await dbClient
      .from("file_roles")
      .select("file_id")
      .eq("analysis_id", analysisId);

    const classifiedFileIds = new Set((existingRoles || []).map((r) => r.file_id));
    const unclassifiedFiles = allFiles.filter((f) => !classifiedFileIds.has(f.id));

    if (unclassifiedFiles.length === 0) {
      return { success: true, classifiedCount: 0 };
    }

    // 3. Get edge contexts for these files
    const unclassifiedIds = unclassifiedFiles.map((f) => f.id);
    const fileIdToPath = new Map(allFiles.map((f) => [f.id, f.path]));

    const { data: outgoing } = await dbClient
      .from("edges")
      .select("source_file_id, target_file_id, raw_specifier")
      .eq("analysis_id", analysisId)
      .in("source_file_id", unclassifiedIds);

    const { data: incoming } = await dbClient
      .from("edges")
      .select("source_file_id, target_file_id")
      .eq("analysis_id", analysisId)
      .in("target_file_id", unclassifiedIds);

    const fileMap = new Map<string, { path: string; imports: string[]; importedBy: string[] }>();
    for (const f of unclassifiedFiles) {
      fileMap.set(f.id, { path: f.path, imports: [], importedBy: [] });
    }

    if (outgoing) {
      for (const e of outgoing) {
        const item = fileMap.get(e.source_file_id);
        if (item) {
          const targetPath = e.target_file_id ? fileIdToPath.get(e.target_file_id) : e.raw_specifier;
          if (targetPath) item.imports.push(targetPath);
        }
      }
    }

    if (incoming) {
      for (const e of incoming) {
        const item = fileMap.get(e.target_file_id);
        if (item) {
          const callerPath = fileIdToPath.get(e.source_file_id);
          if (callerPath) item.importedBy.push(callerPath);
        }
      }
    }

    // Batch files in chunks of 25 to stay within prompt limits
    const filesToClassify = Array.from(fileMap.values());
    const chunkSize = 25;
    const classifiedResults: ClassifiedRoleResult[] = [];

    await withAiTrace(
      `classify-roles:${analysisId}`,
      { analysisId, unclassifiedCount: filesToClassify.length },
      async (traceCtx) => {
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        for (let i = 0; i < filesToClassify.length; i += chunkSize) {
          const chunk = filesToClassify.slice(i, i + chunkSize);
          const res = await classifyRolesWithGemini(chunk);
          totalPromptTokens += res.promptTokens;
          totalCompletionTokens += res.completionTokens;

          classifiedResults.push(...res.roles);

          await traceCtx.recordModelCall({
            name: "gemini-role-classification",
            model: res.model,
            prompt: `Classify ${chunk.length} files`,
            response: JSON.stringify(res.roles),
            promptTokens: res.promptTokens,
            completionTokens: res.completionTokens,
          });
        }

        return {
          result: classifiedResults,
          cached: false,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
        };
      }
    );

    // Insert classified roles into public.file_roles
    const pathToId = new Map(allFiles.map((f) => [f.path, f.id]));
    const roleRows = classifiedResults
      .map((r) => {
        const fileId = pathToId.get(r.path);
        if (!fileId) return null;
        return {
          organization_id: orgId,
          analysis_id: analysisId,
          file_id: fileId,
          role: r.role,
          confidence: r.confidence,
          source: "model",
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (roleRows.length > 0) {
      const { error: insertErr } = await dbClient.from("file_roles").insert(roleRows);
      if (insertErr) {
        console.warn("[Classify] Failed to store file roles:", insertErr.message);
      }
    }

    return {
      success: true,
      classifiedCount: roleRows.length,
      roles: classifiedResults,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ClassifyAction] Error:", err);
    return {
      success: false,
      classifiedCount: 0,
      error: message,
    };
  }
}