import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServerDatabaseClient } from "@/lib/supabase/server";
import { runPipeline } from "@/lib/pipeline/runner";

export async function POST(req: NextRequest) {
  const { orgId, orgSlug } = await auth();

  if (!orgId) {
    return NextResponse.json(
      { error: "Unauthorized: No active organization" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const repoUrl = body?.repoUrl;
  const forceRerun = Boolean(body?.forceRerun);

  if (!repoUrl || typeof repoUrl !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid 'repoUrl' parameter" },
      { status: 400 }
    );
  }

  const supabase = await createServerDatabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database configuration unavailable" },
      { status: 500 }
    );
  }

  try {
    const result = await runPipeline({
      repoUrl,
      orgId,
      orgName: orgSlug || "Team Workspace",
      supabase,
      forceRerun,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}