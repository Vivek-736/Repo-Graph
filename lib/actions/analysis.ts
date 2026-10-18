"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerDatabaseClient } from "@/lib/supabase/server";
import { runPipeline, PipelineRunResult } from "@/lib/pipeline/runner";

export interface StartAnalysisResponse {
  success: boolean;
  data?: PipelineRunResult;
  error?: string;
}

/**
 * Server action to initiate an analysis run for a repository URL.
 * Enforces organization authentication via Clerk and RLS in Supabase.
 * Returns existing analysis if already analysed for this organization.
 */
export async function startAnalysis(
  repoUrl: string,
  forceRerun: boolean = false
): Promise<StartAnalysisResponse> {
  const { orgId, orgSlug } = await auth.protect();

  if (!orgId) {
    return {
      success: false,
      error: "No active organization selected. Please select a team first.",
    };
  }

  const supabase = await createServerDatabaseClient();
  if (!supabase) {
    return {
      success: false,
      error: "Database client is not available. Please check Supabase configuration.",
    };
  }

  try {
    const result = await runPipeline({
      repoUrl,
      orgId,
      orgName: orgSlug || "Team Workspace",
      supabase,
      forceRerun,
    });

    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}