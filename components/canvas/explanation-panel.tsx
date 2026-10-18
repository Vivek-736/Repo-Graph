"use client";

import { useState } from "react";
import { explainTarget, ExplanationResponse } from "@/lib/actions/explain";
import { ExplanationContent } from "./explanation-content";

interface ExplanationPanelProps {
  analysisId?: string;
  selectedFilePath: string | null;
  selectedNodeId: string | null;
  allFilePaths: string[];
  onSelectFile?: (filePath: string) => void;
  cache: Record<string, ExplanationResponse>;
  onCacheUpdate: (key: string, res: ExplanationResponse) => void;
}

export function ExplanationPanel({
  analysisId,
  selectedFilePath,
  selectedNodeId,
  allFilePaths,
  onSelectFile,
  cache,
  onCacheUpdate,
}: ExplanationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetType = selectedFilePath ? "file" : selectedNodeId ? "folder" : null;
  const targetPath = selectedFilePath || selectedNodeId;
  const cacheKey = targetType && targetPath ? `${targetType}:${targetPath}` : null;

  const currentExplanation = cacheKey ? cache[cacheKey] : null;

  const handleExplain = async (forceRefresh: boolean = false) => {
    if (!analysisId || !targetType || !targetPath || !cacheKey) return;

    setLoading(true);
    setError(null);

    try {
      const res = await explainTarget({
        analysisId,
        targetType,
        path: targetPath,
        forceRefresh,
      });

      if (res.success && res.content) {
        onCacheUpdate(cacheKey, res);
      } else {
        setError(res.error || "Failed to generate explanation.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Case 0: Nothing selected
  if (!targetType || !targetPath) {
    return (
      <div className="rounded border border-border/70 bg-surface-raised/40 p-4 text-center space-y-2">
        <div className="text-xs font-semibold text-foreground">Select a File or Folder</div>
        <p className="text-[11px] text-muted leading-relaxed">
          Click any file node or folded folder on the canvas to explain what it does in the context of its actual neighbours.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 font-mono">
      {/* Target summary bar */}
      <div className="rounded border border-border bg-surface-raised/50 p-2.5 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted uppercase font-semibold tracking-wider">
          <span>Target {targetType === "file" ? "File" : "Folder"}</span>
          <span className="text-foreground/80 font-normal normal-case">
            {targetType === "file" ? "Neighbour Analysis" : "Module Explanation"}
          </span>
        </div>
        <div className="text-xs font-bold text-foreground truncate" title={targetPath}>
          {targetPath}
        </div>
      </div>

      {/* Staleness banner */}
      {currentExplanation?.isStale && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
            <span>Explanation is stale (file or commit updated).</span>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleExplain(true)}
            className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer border border-amber-500/30"
          >
            Re-analyse
          </button>
        </div>
      )}

      {/* Tracing / Model status pill */}
      {currentExplanation && (
        <div className="flex items-center justify-between text-[10px] text-muted px-1">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{currentExplanation.model || "Gemini 3 Flash"}</span>
          </div>

          <div className="flex items-center gap-2">
            {currentExplanation.cached ? (
              <span className="rounded bg-accent/15 px-1.5 py-0.2 text-[9px] font-semibold text-accent border border-accent/30">
                ⚡ Cached (0 tokens)
              </span>
            ) : (
              <span className="text-[9px] text-muted">Fresh run</span>
            )}

            {currentExplanation.isTracingConfigured ? (
              <span className="text-[9px] text-emerald-400" title="Traced into LangSmith">
                Traced
              </span>
            ) : (
              <span className="text-[9px] text-amber-400/90" title="Set LANGSMITH_API_KEY to trace">
                Tracing unconfigured
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action / Output state */}
      {!currentExplanation && !loading && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => handleExplain(false)}
            disabled={loading}
            className="w-full rounded border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/25 hover:border-accent cursor-pointer transition-colors"
          >
            Explain {targetType === "file" ? "File" : "Folder"}
          </button>
          <p className="text-[10px] text-muted mt-2">
            Uses Gemini 3 Flash to describe this {targetType} from its real dependency neighbours.
          </p>
        </div>
      )}

      {loading && (
        <div className="rounded border border-border bg-surface-raised/30 p-5 text-center space-y-2">
          <div className="text-xs text-foreground font-semibold flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
            Explaining with Gemini 3 Flash...
          </div>
          <p className="text-[10px] text-muted leading-relaxed">
            Reading real imports, callers, and recording LangSmith trace.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-1.5">
          <div className="font-bold">Explanation Failed</div>
          <p className="text-[11px] leading-relaxed wrap-break-word">{error}</p>
          <button
            type="button"
            onClick={() => handleExplain(false)}
            className="mt-1 rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200 hover:bg-rose-500/30 cursor-pointer border border-rose-500/30"
          >
            Retry
          </button>
        </div>
      )}

      {currentExplanation && !loading && (
        <div className="rounded border border-border/80 bg-surface-raised/30 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <span className="text-[10px] uppercase font-semibold text-muted tracking-wider">
              Explanation
            </span>
            <button
              type="button"
              onClick={() => handleExplain(true)}
              className="text-[10px] text-muted hover:text-foreground hover:underline cursor-pointer"
              title="Force re-generation (bypass cache)"
            >
              Re-run
            </button>
          </div>

          <ExplanationContent
            content={currentExplanation.content || ""}
            allFilePaths={allFilePaths}
            onSelectFile={onSelectFile}
          />
        </div>
      )}
    </div>
  );
}