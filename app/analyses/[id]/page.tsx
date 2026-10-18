import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createServerDatabaseClient } from "@/lib/supabase/server";
import { createAdminDatabaseClient } from "@/lib/supabase/admin";
import { CanvasShell } from "@/components/canvas/canvas-shell";
import { CoverageBanner } from "@/components/canvas/coverage-banner";
import { AnalysisProgress } from "@/components/analysis/analysis-progress";
import { ParserResult, ParsedFile, ParsedEdge } from "@/lib/parser/types";
import { extractDistinctFolders } from "@/lib/parser/graph";
import { detectFrameworkFromPaths, classifyPathRoleFallback, FrameworkId } from "@/lib/taxonomy";
import Link from "next/link";

export const instant = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

async function AnalysisContent({ analysisId }: { analysisId: string }) {
  // Use admin client when available (bypasses RLS mismatch), fallback to user client
  const supabase = createAdminDatabaseClient() || (await createServerDatabaseClient());
  if (!supabase) {
    notFound();
  }

  // 1. Fetch analysis details
  const { data: analysis, error: analysisErr } = await supabase
    .from("analyses")
    .select("id, organization_id, project_id, commit_hash, status, stage, failure_reason, files_count, edges_count, coverage_percentage, summary, created_at")
    .eq("id", analysisId)
    .maybeSingle();

  if (analysisErr || !analysis) {
    console.warn(`[AnalysisPage] Analysis not found for id ${analysisId}:`, analysisErr);
    notFound();
  }

  // 2. Fetch project details
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, repo_url, default_branch")
    .eq("id", analysis.project_id)
    .maybeSingle();

  const projectName = project?.name || "Repository Analysis";
  const repoUrl = project?.repo_url || "";

  // 2. If analysis is not completed (pending, fetching, parsing, storing, or failed), show live progress
  if (analysis.status !== "completed") {
    return (
      <AnalysisProgress
        analysisId={analysis.id}
        initialStatus={analysis.status}
        initialStage={analysis.stage}
        initialFailureReason={analysis.failure_reason}
        projectName={projectName}
        repoUrl={repoUrl}
        commitHash={analysis.commit_hash}
      />
    );
  }

  // 3. Analysis is completed: load real stored files, edges, routes, and roles from database
  const [{ data: rawFiles }, { data: rawEdges }, { data: rawRoutes }, { data: rawRoles }] =
    await Promise.all([
      supabase
        .from("files")
        .select("id, path, folder, extension, lines_count, content_hash, fan_in, fan_out")
        .eq("analysis_id", analysis.id),
      supabase
        .from("edges")
        .select("id, source_file_id, target_file_id, kind, raw_specifier, resolved, unresolved_reason")
        .eq("analysis_id", analysis.id),
      supabase
        .from("routes")
        .select("id, file_id, method, path")
        .eq("analysis_id", analysis.id),
      supabase
        .from("file_roles")
        .select("id, file_id, role, confidence, source")
        .eq("analysis_id", analysis.id),
    ]);

  const fileIdToPath = new Map<string, string>();
  const files: ParsedFile[] = (rawFiles || []).map((f) => {
    fileIdToPath.set(f.id, f.path);
    return {
      id: f.id,
      path: f.path,
      folder: f.folder,
      extension: f.extension || "",
      linesCount: f.lines_count || 0,
      contentHash: f.content_hash || "",
      fanIn: f.fan_in || 0,
      fanOut: f.fan_out || 0,
    };
  });

  const edges: ParsedEdge[] = (rawEdges || []).map((e) => ({
    id: e.id,
    source: fileIdToPath.get(e.source_file_id) || "unknown",
    target: e.target_file_id ? (fileIdToPath.get(e.target_file_id) ?? null) : null,
    kind: e.kind as import("@/lib/parser/types").EdgeKind,
    specifier: e.raw_specifier,
    resolved: Boolean(e.resolved),
    unresolvedReason: e.unresolved_reason || undefined,
  }));

  const routes: import("@/lib/parser/types").ExtractedRoute[] = (rawRoutes || []).map((r) => ({
    file: fileIdToPath.get(r.file_id) || "unknown",
    method: r.method,
    path: r.path,
  }));

  // Detect framework from stored roles or file paths
  const hasNestRoles = (rawRoles || []).some((r) =>
    ["controller", "service", "module", "entity"].includes(r.role)
  );
  const hasNextRoles = (rawRoles || []).some((r) =>
    ["page_route", "api_endpoint", "server_action"].includes(r.role)
  );
  const hasExpressRoles = (rawRoles || []).some((r) =>
    ["route", "middleware"].includes(r.role)
  );

  let frameworkId: FrameworkId = "generic";
  if (hasNestRoles) {
    frameworkId = "nestjs";
  } else if (hasNextRoles) {
    frameworkId = "nextjs";
  } else if (hasExpressRoles) {
    frameworkId = "express";
  } else {
    frameworkId = detectFrameworkFromPaths(files.map((f) => f.path));
  }

  // Populate roles from database or fallback classifier
  const roles: import("@/lib/parser/types").ExtractedRole[] =
    rawRoles && rawRoles.length > 0
      ? rawRoles.map((r) => ({
          file: fileIdToPath.get(r.file_id) || "unknown",
          role: r.role,
          confidence: Number(r.confidence || 1.0),
          source: r.source || "database",
        }))
      : files.map((f) => ({
          file: f.path,
          role: classifyPathRoleFallback(f.path, frameworkId),
          confidence: 0.8,
          source: "fallback",
        }));

  const folders = extractDistinctFolders(files);
  const totalLines = files.reduce((acc, f) => acc + f.linesCount, 0);
  const coveragePercent = analysis.coverage_percentage !== null
    ? Number(analysis.coverage_percentage)
    : 100;

  const parserResult: ParserResult = {
    rootPath: repoUrl,
    framework: frameworkId,
    frameworkName:
      frameworkId === "nextjs"
        ? "Next.js"
        : frameworkId === "nestjs"
        ? "NestJS"
        : frameworkId === "express"
        ? "Express"
        : "Plain Library",
    stats: {
      filesFound: files.length,
      filesParsed: files.length,
      filesSkipped: 0,
      totalLines,
      distinctFolders: folders.length,
      reexportsFound: edges.filter((e) => e.kind === "reexport").length,
      reexportsResolved: edges.filter((e) => e.kind === "reexport" && e.resolved).length,
    },
    files,
    edges,
    roles,
    routes,
    skippedFiles: [],
    coverage: {
      totalImports: edges.length,
      resolvedInternal: edges.filter((e) => e.resolved && e.target).length,
      externalDependencies: 0,
      builtins: 0,
      deliberatelyExcluded: 0,
      unresolved: edges.filter((e) => !e.resolved).length,
      failures: [],
    },
    folders,
    timestamp: analysis.created_at,
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background font-mono">
      {/* Top Header Bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-surface px-4 text-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/workspace"
            className="flex items-center gap-1 text-muted hover:text-foreground transition-colors"
          >
            <span>←</span>
            <span>Dashboard</span>
          </Link>
          <span className="text-border">/</span>
          <span className="font-bold text-foreground">{projectName}</span>
          {analysis.commit_hash && (
            <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] text-muted border border-border">
              {analysis.commit_hash.slice(0, 7)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted">
          <span>Files: <strong className="text-foreground">{files.length}</strong></span>
          <span>Edges: <strong className="text-foreground">{edges.length}</strong></span>
          <span>
            Coverage:{" "}
            <strong className={coveragePercent < 95 ? "text-outgoing" : "text-foreground"}>
              {coveragePercent.toFixed(1)}%
            </strong>
          </span>
        </div>
      </header>

      {/* Explorer Map with Coverage Banner */}
      <main className="relative flex-1 overflow-hidden">
        <CoverageBanner
          coveragePercentage={coveragePercent}
          totalImports={edges.length}
          unresolvedCount={edges.filter((e) => !e.resolved).length}
        />
        <CanvasShell data={parserResult} />
      </main>
    </div>
  );
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id: analysisId } = await params;
  await auth.protect();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-background font-mono text-xs text-muted">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent mr-2" />
          Loading analysis...
        </div>
      }
    >
      <AnalysisContent analysisId={analysisId} />
    </Suspense>
  );
}