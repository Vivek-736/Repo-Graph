"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { createBrowserDatabaseClient } from "@/lib/supabase/client";
import Link from "next/link";

interface AnalysisProgressProps {
  analysisId: string;
  initialStatus: string;
  initialStage: string | null;
  initialFailureReason: string | null;
  projectName: string;
  repoUrl: string;
  commitHash?: string | null;
}

const STAGES = [
  { id: "fetching", name: "Fetching repository archive from GitHub" },
  { id: "extracting", name: "Extracting repository files" },
  { id: "parsing", name: "Parsing syntax and resolving imports" },
  { id: "storing", name: "Saving files, edges, and insights to storage" },
  { id: "completed", name: "Analysis completed" },
];

export function AnalysisProgress({
  analysisId,
  initialStatus,
  initialStage,
  initialFailureReason,
  projectName,
  repoUrl,
  commitHash,
}: AnalysisProgressProps) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [status, setStatus] = useState(initialStatus);
  const [stage, setStage] = useState(initialStage || "fetching");
  const [failureReason, setFailureReason] = useState(initialFailureReason);
  const [currentCommit, setCurrentCommit] = useState(commitHash);

  useEffect(() => {
    // If already completed on initial mount, trigger refresh to render canvas
    if (initialStatus === "completed") {
      router.refresh();
      return;
    }

    const supabase = createBrowserDatabaseClient(getToken);
    const channel = supabase.channel(`analysis:${analysisId}`);

    channel.on("broadcast", { event: "stage_change" }, (payload) => {
      const data = payload.payload as {
        analysis_id: string;
        status: string;
        stage: string;
        failure_reason?: string | null;
        commit_hash?: string | null;
      };

      if (data.status) setStatus(data.status);
      if (data.stage) setStage(data.stage);
      if (data.failure_reason) setFailureReason(data.failure_reason);
      if (data.commit_hash) setCurrentCommit(data.commit_hash);

      if (data.status === "completed") {
        // Automatically land on the map when completed
        router.refresh();
      }
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [analysisId, initialStatus, router, getToken]);

  const currentStageIndex = STAGES.findIndex((s) => s.id === stage);
  const isFailed = status === "failed";
  const isCompleted = status === "completed";

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-6 font-mono text-foreground">
      <div className="w-full max-w-lg space-y-6 rounded border border-border bg-surface p-6 shadow-sm">
        {/* Header */}
        <div className="border-b border-border pb-4">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="uppercase tracking-wider">Analysis in progress</span>
            {currentCommit && (
              <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] border border-border">
                commit {currentCommit.slice(0, 7)}
              </span>
            )}
          </div>
          <h1 className="text-base font-bold text-foreground">{projectName}</h1>
          <p className="text-xs text-muted mt-0.5 select-all">{repoUrl}</p>
        </div>

        {/* Failed Banner */}
        {isFailed && (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-500">
            <p className="font-bold">Analysis Failed at stage: {stage}</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed">
              {failureReason || "An unexpected error occurred during execution."}
            </p>
            <div className="mt-3">
              <Link
                href="/workspace"
                className="inline-flex items-center gap-1.5 rounded border border-red-500/30 bg-surface px-3 py-1 text-xs text-foreground hover:bg-surface-raised"
              >
                ← Return to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Live Stage List */}
        {!isFailed && (
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">
              Live Progress
            </div>
            <div className="space-y-2">
              {STAGES.map((s, idx) => {
                const isPast = currentStageIndex > idx || isCompleted;
                const isCurrent = currentStageIndex === idx && !isCompleted;
                const isPending = currentStageIndex < idx;

                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 rounded border px-3 py-2 text-xs transition-colors ${
                      isCurrent
                        ? "border-accent bg-accent/5 text-foreground font-semibold"
                        : isPast
                        ? "border-border/60 bg-surface text-foreground/80"
                        : "border-border/30 text-muted/50"
                    }`}
                  >
                    {/* Status indicator */}
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isPast ? (
                        <span className="text-incoming text-xs font-bold">✓</span>
                      ) : isCurrent ? (
                        <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-muted/40" />
                      )}
                    </div>

                    <span className="flex-1">{s.name}</span>

                    {isCurrent && (
                      <span className="text-[10px] text-accent uppercase tracking-wider">
                        Running...
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer controls */}
        <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
          <Link href="/workspace" className="hover:text-foreground underline">
            ← Dashboard
          </Link>
          <span className="text-[10px]">Per-analysis channel: analysis:{analysisId.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  );
}