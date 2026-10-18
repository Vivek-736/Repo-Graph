"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerDatabaseClient } from "@/lib/supabase/server";
import { createAdminDatabaseClient } from "@/lib/supabase/admin";
import { withAiTrace, PINNED_MODEL, DISPLAY_MODEL_NAME } from "@/lib/ai/client";
import {
  explainFileWithGemini,
  explainFolderWithGemini,
  AIExplanationResult,
} from "@/lib/ai/explainer";

export interface ExplanationResponse {
  success: boolean;
  content?: string;
  cached?: boolean;
  isStale?: boolean;
  model?: string;
  isTracingConfigured?: boolean;
  error?: string;
}

export interface ExplainTargetParams {
  analysisId: string;
  targetType: "file" | "folder";
  path: string;
  forceRefresh?: boolean;
}

/**
 * Server action to explain a file or folded folder.
 * Uses Gemini (pinned to Gemini 3 Flash) and traces every call through LangSmith.
 * Cache read happens INSIDE the traced call.
 */
export async function explainTarget({
  analysisId,
  targetType,
  path,
  forceRefresh = false,
}: ExplainTargetParams): Promise<ExplanationResponse> {
  const { orgId } = await auth.protect();
  if (!orgId) {
    return { success: false, error: "Authentication required." };
  }

  // Use user client for RLS, fallback to admin client for database ops if user token is pending
  const userClient = await createServerDatabaseClient();
  const dbClient = userClient || createAdminDatabaseClient();

  if (!dbClient) {
    return { success: false, error: "Database client is unavailable." };
  }

  try {
    const traceName = targetType === "file" ? `explain-file:${path}` : `explain-folder:${path}`;

    const traced = await withAiTrace<AIExplanationResult & { isStale: boolean }>(
      traceName,
      {
        analysisId,
        targetType,
        path,
        forceRefresh,
      },
      async (traceCtx) => {
        // =========================================================================
        // STEP 1: FETCH ANALYSIS & TARGET METADATA (needed for content_hash & staleness)
        // =========================================================================
        const { data: analysis } = await dbClient
          .from("analyses")
          .select("id, commit_hash")
          .eq("id", analysisId)
          .single();

        let targetFileId: string | null = null;
        let currentContentHash: string | null = null;
        let fileLinesCount = 0;

        if (targetType === "file") {
          const { data: fileRow } = await dbClient
            .from("files")
            .select("id, path, lines_count, content_hash")
            .eq("analysis_id", analysisId)
            .eq("path", path)
            .single();

          if (!fileRow) {
            throw new Error(`File '${path}' not found in this analysis.`);
          }
          targetFileId = fileRow.id;
          currentContentHash = fileRow.content_hash;
          fileLinesCount = fileRow.lines_count || 0;
        }

        // =========================================================================
        // STEP 2: CACHE READ INSIDE THE TRACED CALL
        // =========================================================================
        if (!forceRefresh) {
          let cacheQuery = dbClient
            .from("explanations")
            .select("id, content, model, prompt_tokens, completion_tokens, content_hash, created_at")
            .eq("analysis_id", analysisId)
            .eq("target_type", targetType)
            .eq("model", PINNED_MODEL);

          if (targetType === "file") {
            if (currentContentHash) {
              cacheQuery = cacheQuery.eq("content_hash", currentContentHash);
            } else if (targetFileId) {
              cacheQuery = cacheQuery.eq("file_id", targetFileId);
            }
          } else {
            cacheQuery = cacheQuery.eq("folder_path", path);
          }

          const { data: cachedRow } = await cacheQuery
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (cachedRow) {
            // Check staleness: if content_hash differs from current file
            const isStale =
              targetType === "file" &&
              Boolean(currentContentHash && cachedRow.content_hash && cachedRow.content_hash !== currentContentHash);

            return {
              result: {
                content: cachedRow.content,
                model: cachedRow.model,
                promptTokens: cachedRow.prompt_tokens || 0,
                completionTokens: cachedRow.completion_tokens || 0,
                isStale,
              },
              cached: true,
              promptTokens: 0,
              completionTokens: 0,
            };
          }
        }

        // =========================================================================
        // STEP 3: CACHE MISS — FETCH NEIGHBOURS & CALL GEMINI
        // =========================================================================
        let aiResult: AIExplanationResult;

        if (targetType === "file") {
          // Fetch real neighbours
          // 1. Files this file imports (outgoing edges)
          const { data: outgoingEdges } = await dbClient
            .from("edges")
            .select("target_file_id, raw_specifier, files:target_file_id (path)")
            .eq("analysis_id", analysisId)
            .eq("source_file_id", targetFileId!);

          // 2. Files that import this file (incoming edges)
          const { data: incomingEdges } = await dbClient
            .from("edges")
            .select("source_file_id, raw_specifier, files:source_file_id (path)")
            .eq("analysis_id", analysisId)
            .eq("target_file_id", targetFileId!);

          const imports: string[] = [];
          if (outgoingEdges) {
            for (const edge of outgoingEdges) {
              const target = (edge.files as unknown as { path: string })?.path || edge.raw_specifier;
              if (target && !imports.includes(target)) {
                imports.push(target);
              }
            }
          }

          const importedBy: string[] = [];
          if (incomingEdges) {
            for (const edge of incomingEdges) {
              const caller = (edge.files as unknown as { path: string })?.path;
              if (caller && !importedBy.includes(caller)) {
                importedBy.push(caller);
              }
            }
          }

          aiResult = await explainFileWithGemini({
            path,
            linesCount: fileLinesCount,
            imports,
            importedBy,
          });
        } else {
          // Folded folder explanation
          const { data: folderFiles } = await dbClient
            .from("files")
            .select("id, path, folder")
            .eq("analysis_id", analysisId);

          const filesInThisFolder = (folderFiles || []).filter((f) => {
            const fFolder = f.folder || ".";
            return fFolder === path || fFolder.startsWith(path + "/");
          });

          const folderFileIdSet = new Set(filesInThisFolder.map((f) => f.id));
          const fileIdToPath = new Map((folderFiles || []).map((f) => [f.id, f.path]));

          // Inbound edges: source outside folder, target inside folder
          const { data: allEdges } = await dbClient
            .from("edges")
            .select("source_file_id, target_file_id")
            .eq("analysis_id", analysisId);

          const externalInbound: Array<{ caller: string; target: string }> = [];
          const externalOutbound: Array<{ source: string; dependency: string }> = [];

          if (allEdges) {
            for (const edge of allEdges) {
              const isSourceIn = folderFileIdSet.has(edge.source_file_id);
              const isTargetIn = edge.target_file_id ? folderFileIdSet.has(edge.target_file_id) : false;

              if (!isSourceIn && isTargetIn && edge.target_file_id) {
                const caller = fileIdToPath.get(edge.source_file_id) || "unknown";
                const target = fileIdToPath.get(edge.target_file_id) || "unknown";
                externalInbound.push({ caller, target });
              } else if (isSourceIn && !isTargetIn && edge.target_file_id) {
                const source = fileIdToPath.get(edge.source_file_id) || "unknown";
                const dep = fileIdToPath.get(edge.target_file_id) || "unknown";
                externalOutbound.push({ source, dependency: dep });
              }
            }
          }

          aiResult = await explainFolderWithGemini({
            folderPath: path,
            files: filesInThisFolder.map((f) => ({ path: f.path })),
            externalInbound,
            externalOutbound,
          });
        }

        // Record child model call in LangSmith
        await traceCtx.recordModelCall({
          name: `gemini-${PINNED_MODEL}`,
          model: PINNED_MODEL,
          prompt: targetType === "file" ? `Explain file: ${path}` : `Explain folder: ${path}`,
          response: aiResult.content,
          promptTokens: aiResult.promptTokens,
          completionTokens: aiResult.completionTokens,
        });

        // Store into public.explanations cache
        const insertPayload = {
          organization_id: orgId,
          analysis_id: analysisId,
          file_id: targetFileId,
          target_type: targetType,
          folder_path: targetType === "folder" ? path : null,
          content_hash: targetType === "file" ? currentContentHash : null,
          content: aiResult.content,
          model: PINNED_MODEL,
          prompt_tokens: aiResult.promptTokens,
          completion_tokens: aiResult.completionTokens,
          cached: false,
        };

        const { error: insertErr } = await dbClient
          .from("explanations")
          .insert(insertPayload);

        if (insertErr) {
          console.warn("[Explanations] Failed to persist explanation cache:", insertErr.message);
        }

        return {
          result: {
            ...aiResult,
            isStale: false,
          },
          cached: false,
          promptTokens: aiResult.promptTokens,
          completionTokens: aiResult.completionTokens,
        };
      }
    );

    return {
      success: true,
      content: traced.result.content,
      cached: traced.isCached,
      isStale: traced.result.isStale,
      model: DISPLAY_MODEL_NAME,
      isTracingConfigured: traced.isTracingConfigured,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ExplainAction] Error explaining ${path}:`, err);
    return {
      success: false,
      error: message,
    };
  }
}