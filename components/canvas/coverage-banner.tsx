"use client";

import { useState } from "react";

interface CoverageBannerProps {
  coveragePercentage: number;
  totalImports?: number;
  unresolvedCount?: number;
}

export function CoverageBanner({
  coveragePercentage,
  totalImports,
  unresolvedCount,
}: CoverageBannerProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Per spec: only display when coverage is under 95%
  if (coveragePercentage >= 95) {
    return null;
  }

  const formatted = coveragePercentage.toFixed(1);

  if (collapsed) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded border border-outgoing/40 bg-surface/95 px-3 py-1 text-xs text-outgoing shadow-md backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-outgoing animate-pulse" />
        <span className="font-semibold">Partial graph ({formatted}% coverage)</span>
        <button
          onClick={() => setCollapsed(false)}
          className="ml-2 text-[10px] text-muted hover:text-foreground underline"
        >
          Details
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[90%] rounded border border-outgoing/40 bg-surface/95 p-3 text-xs text-foreground shadow-lg backdrop-blur">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-outgoing" />
          <span className="font-bold text-outgoing">Partial Graph ({formatted}% coverage)</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[11px] text-muted hover:text-foreground px-1"
          title="Collapse banner"
        >
          ✕
        </button>
      </div>

      <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
        This repository has imports that could not be fully resolved to local files (such as complex path aliases, nested subprojects, or non-standard module configurations).
      </p>

      {(totalImports !== undefined || unresolvedCount !== undefined) && (
        <div className="mt-2 flex items-center gap-4 text-[11px] text-muted border-t border-border/50 pt-1.5">
          {totalImports !== undefined && (
            <span>Total imports: <strong className="text-foreground">{totalImports}</strong></span>
          )}
          {unresolvedCount !== undefined && (
            <span>Unresolved: <strong className="text-outgoing">{unresolvedCount}</strong></span>
          )}
        </div>
      )}
    </div>
  );
}