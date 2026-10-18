"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { createBrowserDatabaseClient } from "@/lib/supabase/client";

export interface ProjectRelation {
  id: string;
  name: string;
  repo_url: string;
}

export interface AnalysisRow {
  id: string;
  commit_hash: string | null;
  status: string;
  stage: string | null;
  failure_reason: string | null;
  files_count: number;
  edges_count: number;
  routes_count: number;
  coverage_percentage: number | null;
  summary: string | null;
  created_at: string;
  updated_at?: string;
  projects: ProjectRelation | ProjectRelation[] | null;
}

interface AnalysisListProps {
  initialAnalyses: AnalysisRow[];
}

type FilterTab = "all" | "done" | "running" | "failed";

export function AnalysisList({ initialAnalyses }: AnalysisListProps) {
  const [analyses, setAnalyses] = useState<AnalysisRow[]>(initialAnalyses);
  const [filter, setFilter] = useState<FilterTab>("all");
  const { getToken } = useAuth();

  // Sync state if initialAnalyses props change
  useEffect(() => {
    setAnalyses(initialAnalyses);
  }, [initialAnalyses]);

  // Subscribe to live updates across Realtime
  useEffect(() => {
    const supabase = createBrowserDatabaseClient(getToken);

    // Channel 1: Listen to broadcast stage changes for any active analyses
    const channels = analyses.map((a) => {
      const channel = supabase.channel(`analysis:${a.id}`);
      channel.on("broadcast", { event: "stage_change" }, (payload) => {
        const data = payload.payload as {
          analysis_id: string;
          status: string;
          stage: string;
          failure_reason?: string | null;
          commit_hash?: string | null;
          files_count?: number;
          edges_count?: number;
          coverage_percentage?: number | null;
        };

        setAnalyses((prev) =>
          prev.map((item) => {
            if (item.id === data.analysis_id) {
              return {
                ...item,
                status: data.status,
                stage: data.stage,
                failure_reason: data.failure_reason || item.failure_reason,
                commit_hash: data.commit_hash || item.commit_hash,
                files_count: data.files_count ?? item.files_count,
                edges_count: data.edges_count ?? item.edges_count,
                coverage_percentage: data.coverage_percentage ?? item.coverage_percentage,
                updated_at: new Date().toISOString(),
              };
            }
            return item;
          })
        );
      });
      channel.subscribe();
      return channel;
    });

    // Channel 2: Listen for new analyses or row updates
    const dbChannel = supabase
      .channel("analyses-db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analyses" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as AnalysisRow;
            setAnalyses((prev) =>
              prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
            );
          } else if (payload.eventType === "INSERT") {
            const inserted = payload.new as AnalysisRow;
            setAnalyses((prev) => {
              if (prev.some((x) => x.id === inserted.id)) return prev;
              return [inserted, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
      supabase.removeChannel(dbChannel);
    };
  }, [analyses, getToken]);

  const counts = useMemo(() => {
    let done = 0;
    let running = 0;
    let failed = 0;

    for (const a of analyses) {
      if (a.status === "completed") {
        done++;
      } else if (a.status === "failed") {
        failed++;
      } else {
        running++;
      }
    }

    return { all: analyses.length, done, running, failed };
  }, [analyses]);

  const filteredAnalyses = useMemo(() => {
    if (filter === "done") {
      return analyses.filter((a) => a.status === "completed");
    }
    if (filter === "running") {
      return analyses.filter((a) => a.status !== "completed" && a.status !== "failed");
    }
    if (filter === "failed") {
      return analyses.filter((a) => a.status === "failed");
    }
    return analyses;
  }, [analyses, filter]);

  if (analyses.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-surface/50 p-10 text-center">
        <div className="mx-auto h-8 w-8 rounded-full bg-surface-raised flex items-center justify-center border border-border mb-2.5">
          <span className="text-sm text-muted font-mono">∅</span>
        </div>
        <h2 className="text-xs font-semibold text-foreground">No analyses in this workspace yet</h2>
        <p className="mt-1 text-[11px] text-muted max-w-sm mx-auto leading-relaxed">
          Submit a public GitHub repository URL above to analyze its dependencies and draw its map.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header and filter tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Analysis History
          </span>
          <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] text-muted border border-border">
            {analyses.length} total
          </span>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`rounded px-2.5 py-1 transition-colors ${
              filter === "all"
                ? "bg-accent text-white font-medium"
                : "text-muted hover:text-foreground hover:bg-surface-raised"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => setFilter("done")}
            className={`rounded px-2.5 py-1 transition-colors ${
              filter === "done"
                ? "bg-incoming text-white font-medium"
                : "text-muted hover:text-foreground hover:bg-surface-raised"
            }`}
          >
            Done ({counts.done})
          </button>
          <button
            onClick={() => setFilter("running")}
            className={`rounded px-2.5 py-1 transition-colors ${
              filter === "running"
                ? "bg-outgoing text-black font-medium"
                : "text-muted hover:text-foreground hover:bg-surface-raised"
            }`}
          >
            Running ({counts.running})
          </button>
          <button
            onClick={() => setFilter("failed")}
            className={`rounded px-2.5 py-1 transition-colors ${
              filter === "failed"
                ? "bg-red-500 text-white font-medium"
                : "text-muted hover:text-foreground hover:bg-surface-raised"
            }`}
          >
            Failed ({counts.failed})
          </button>
        </div>
      </div>

      {/* Analyses Cards List */}
      <div className="grid gap-3">
        {filteredAnalyses.map((analysis) => {
          const project = Array.isArray(analysis.projects)
            ? analysis.projects[0]
            : analysis.projects;

          const isCompleted = analysis.status === "completed";
          const isFailed = analysis.status === "failed";
          const isOngoing = !isCompleted && !isFailed;

          const lastActivityTime = new Date(
            analysis.updated_at || analysis.created_at
          ).getTime();
          const isStale = isOngoing && Date.now() - lastActivityTime > 3 * 60 * 1000;

          return (
            <div
              key={analysis.id}
              className={`rounded border bg-surface p-4 transition-all ${
                isCompleted
                  ? "border-border hover:border-accent/60"
                  : isFailed
                  ? "border-red-500/30 bg-red-500/2"
                  : "border-outgoing/40 bg-outgoing/2"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/analyses/${analysis.id}`}
                      className="text-sm font-bold text-foreground hover:text-accent transition-colors"
                    >
                      {project?.name || "Unknown Repository"}
                    </Link>

                    {analysis.commit_hash && (
                      <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted border border-border">
                        {analysis.commit_hash.slice(0, 7)}
                      </span>
                    )}

                    {/* Status Pill */}
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 rounded bg-incoming/10 px-2 py-0.5 text-[11px] font-semibold text-incoming border border-incoming/30">
                        <span>✓</span>
                        <span>Done</span>
                      </span>
                    )}

                    {isOngoing && !isStale && (
                      <span className="inline-flex items-center gap-1.5 rounded bg-outgoing/10 px-2 py-0.5 text-[11px] font-semibold text-outgoing border border-outgoing/30">
                        <span className="h-1.5 w-1.5 rounded-full bg-outgoing animate-pulse" />
                        <span>Stage: {analysis.stage || "processing"}</span>
                      </span>
                    )}

                    {isStale && (
                      <span className="inline-flex items-center gap-1 rounded bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted border border-border">
                        <span>⚠</span>
                        <span>Stale (abandoned)</span>
                      </span>
                    )}

                    {isFailed && (
                      <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500 border border-red-500/30">
                        <span>✕</span>
                        <span>Failed at {analysis.stage || "parse"}</span>
                      </span>
                    )}
                  </div>

                  {project?.repo_url && (
                    <p className="text-xs text-muted select-all">
                      {project.repo_url}
                    </p>
                  )}
                </div>

                {/* Primary Action Button */}
                <div className="shrink-0">
                  <Link
                    href={`/analyses/${analysis.id}`}
                    className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isCompleted
                        ? "bg-accent text-white hover:opacity-90"
                        : isFailed
                        ? "border border-red-500/40 text-red-500 hover:bg-red-500/10"
                        : "border border-outgoing/40 text-outgoing hover:bg-outgoing/10"
                    }`}
                  >
                    <span>{isCompleted ? "Open Dependency Map" : isFailed ? "Inspect Failure" : "Track Progress"}</span>
                    <span className="text-[10px]">→</span>
                  </Link>
                </div>
              </div>

              {/* Failure Error Message */}
              {analysis.failure_reason && (
                <div className="mt-3 rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  <strong className="text-red-500 font-semibold">Error:</strong> {analysis.failure_reason}
                </div>
              )}

              {/* Summary Description */}
              {!analysis.failure_reason && analysis.summary && (
                <p className="mt-2.5 text-xs text-foreground/80 leading-relaxed border-t border-border/40 pt-2.5">
                  {analysis.summary}
                </p>
              )}

              {/* Metrics Row */}
              <div className="mt-3 flex items-center gap-5 pt-2.5 border-t border-border/40 text-xs text-muted flex-wrap">
                <div>
                  Files: <strong className="text-foreground">{analysis.files_count}</strong>
                </div>
                <div>
                  Edges: <strong className="text-foreground">{analysis.edges_count}</strong>
                </div>
                {analysis.coverage_percentage !== null && (
                  <div>
                    Coverage:{" "}
                    <strong
                      className={
                        Number(analysis.coverage_percentage) < 95
                          ? "text-outgoing"
                          : "text-foreground"
                      }
                    >
                      {Number(analysis.coverage_percentage).toFixed(1)}%
                    </strong>
                    {Number(analysis.coverage_percentage) < 95 && (
                      <span className="ml-1 text-[10px] text-outgoing">(partial)</span>
                    )}
                  </div>
                )}
                <div className="ml-auto text-[11px] text-muted">
                  {new Date(analysis.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}