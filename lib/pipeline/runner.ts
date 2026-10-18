import { SupabaseClient } from "@supabase/supabase-js";
import { parseGitHubUrl, fetchRepositoryArchive, FetchedRepo } from "./fetcher";
import { parseRepository } from "@/lib/parser";
import {
  findOrCreateProject,
  findExistingAnalysis,
  createAnalysis,
  updateAnalysisStage,
  storeParserResult,
  AnalysisRecord,
} from "./storage";
import { createAdminDatabaseClient } from "@/lib/supabase/admin";

export interface PipelineRunOptions {
  repoUrl: string;
  orgId: string;
  orgName?: string;
  supabase: SupabaseClient;
  forceRerun?: boolean;
}

export interface PipelineRunResult {
  analysisId: string;
  projectId: string;
  isExisting: boolean;
  status: string;
}

export const PIPELINE_STAGES = {
  FETCHING: "fetching",
  EXTRACTING: "extracting",
  PARSING: "parsing",
  STORING: "storing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

/**
 * Runs the full ingestion pipeline: fetch -> select -> parse -> store.
 * Top-level catch ensures failures write why and where they failed, preventing stuck rows.
 */

export async function runPipeline({
  repoUrl,
  orgId,
  orgName,
  supabase,
  forceRerun = false,
}: PipelineRunOptions): Promise<PipelineRunResult> {
  // Use admin client if available (avoids JWT expiry during large batch operations), fallback to user client
  const dbClient = createAdminDatabaseClient() || supabase;

  // 1. Parse repository URL
  const parsedUrl = parseGitHubUrl(repoUrl);

  // 2. Find or create project row
  const project = await findOrCreateProject(
    dbClient,
    orgId,
    parsedUrl.projectName,
    parsedUrl.normalizedUrl,
    "main",
    orgName
  );

  // 3. Check for existing analysis (One analysis per repository rule)
  if (!forceRerun) {
    const existing = await findExistingAnalysis(dbClient, project.id);
    if (existing && existing.status === "completed") {
      return {
        analysisId: existing.id,
        projectId: project.id,
        isExisting: true,
        status: existing.status,
      };
    }
  }

  // 4. Create new analysis in fetching stage
  let currentStage: string = PIPELINE_STAGES.FETCHING;
  const analysis = await createAnalysis(dbClient, orgId, project.id, currentStage);

  let fetched: FetchedRepo | null = null;

  try {
    // Stage 1: Fetch archive from GitHub
    currentStage = PIPELINE_STAGES.FETCHING;
    await updateAnalysisStage(dbClient, analysis.id, currentStage, "fetching");

    fetched = await fetchRepositoryArchive(parsedUrl.owner, parsedUrl.repo, parsedUrl.ref);

    // Stage 2: Extracting files
    currentStage = PIPELINE_STAGES.EXTRACTING;
    await updateAnalysisStage(
      dbClient,
      analysis.id,
      currentStage,
      "fetching",
      null,
      fetched.commitHash
    );

    // Stage 3: Parse repository syntax and structure
    currentStage = PIPELINE_STAGES.PARSING;
    await updateAnalysisStage(
      dbClient,
      analysis.id,
      currentStage,
      "parsing",
      null,
      fetched.commitHash
    );

    // Standalone parser run: path in, data out
    const parserResult = parseRepository(fetched.extractedPath);

    // Stage 4: Store results in database
    currentStage = PIPELINE_STAGES.STORING;
    await updateAnalysisStage(
      dbClient,
      analysis.id,
      currentStage,
      "storing",
      null,
      fetched.commitHash
    );

    await storeParserResult(
      dbClient,
      orgId,
      analysis.id,
      parserResult,
      fetched.commitHash
    );

    // Stage 5: Completed (handled in storeParserResult)
    currentStage = PIPELINE_STAGES.COMPLETED;

    return {
      analysisId: analysis.id,
      projectId: project.id,
      isExisting: false,
      status: "completed",
    };
  } catch (err: unknown) {
    // Top-level catch: guarantees failed state is written, never leaving row stuck mid-parse
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline Error] Failed during stage '${currentStage}':`, errorMessage);

    await updateAnalysisStage(
      dbClient,
      analysis.id,
      currentStage,
      "failed",
      errorMessage,
      fetched?.commitHash
    );

    throw new Error(`Pipeline failed at stage '${currentStage}': ${errorMessage}`);
  } finally {
    // Guaranteed cleanup of temp extracted directory
    if (fetched) {
      fetched.cleanUp();
    }
  }
}