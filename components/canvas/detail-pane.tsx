"use client";

import { useMemo, useState, useEffect } from "react";
import { ParserResult, ParsedFile, ParsedEdge } from "@/lib/parser/types";
import { categorizeFiles, FileCategory } from "./canvas-shell";
import {
  transitiveWalk,
  computeInsights,
  WalkStep,
  WalkDirection,
  INSIGHT_SENTENCES,
} from "@/lib/parser/graph";
import {
  getTaxonomy,
  classifyPathRoleFallback,
  FrameworkId
} from "@/lib/taxonomy";
import { ExplanationPanel } from "./explanation-panel";
import { ExplanationResponse } from "@/lib/actions/explain";
import { classifyUnmatchedFiles } from "@/lib/actions/classify";

interface DetailPaneProps {
  data: ParserResult;
  selectedNodeId: string | null;
  selectedFilePath: string | null;
  hoveredTarget: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onSelectFile: (filePath: string | null) => void;
  onHoverTarget: (target: string | null) => void;
  onActiveWalkChange?: (walk: { paths: string[]; direction: WalkDirection | null }) => void;
  analysisId?: string;
}

export type DetailTab = "structure" | "routes" | "explanation";

export function getMethodBadge(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    case "POST":
      return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
    case "PUT":
      return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-400 border border-rose-500/30";
    case "PATCH":
      return "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30";
    default:
      return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
  }
}

/**
 * Classifies a file into a framework-defined role label and color.
 */
export function getFileKind(
  filePath: string,
  frameworkId: FrameworkId = "generic",
  roles?: import("@/lib/parser/types").ExtractedRole[]
): { label: string; color: string } {
  const roleRecord = roles?.find((r) => r.file === filePath);
  const roleName = roleRecord?.role || classifyPathRoleFallback(filePath, frameworkId);
  const taxonomy = getTaxonomy(frameworkId);
  const match = taxonomy.categories.find((c) => c.role === roleName);

  if (match) {
    return { label: match.name, color: match.color };
  }
  return { label: roleName, color: "#64748b" };
}

export function DetailPane({
  data,
  selectedNodeId,
  selectedFilePath,
  hoveredTarget,
  onSelectNode,
  onSelectFile,
  onHoverTarget,
  onActiveWalkChange,
  analysisId,
}: DetailPaneProps) {
  const { files, edges, stats, rootPath } = data;

  // Tab state persists across selection changes (Acceptance Check 4)
  const [activeTab, setActiveTab] = useState<DetailTab>("structure");

  // Phase 10: In-memory explanation cache (persists as user switches selections)
  const [explanationsCache, setExplanationsCache] = useState<Record<string, ExplanationResponse>>({});
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationStatus, setClassificationStatus] = useState<string | null>(null);

  // Phase 6: Transitive Walk state (Blast radius & Dependency chain)
  const [activeWalk, setActiveWalk] = useState<WalkDirection | null>(null);

  // Phase 6: Insights panel starts collapsed
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);

  // Compute 4 kinds of insights purely from facts about the edge list
  const insights = useMemo(() => computeInsights(files, edges), [files, edges]);

  // Transitive walk computation (two levels deep by default)
  const walkSteps: WalkStep[] = useMemo(() => {
    if (!selectedFilePath || !activeWalk) return [];
    return transitiveWalk(selectedFilePath, edges, activeWalk, 2);
  }, [selectedFilePath, activeWalk, edges]);

  // Notify canvas of active walk paths
  useEffect(() => {
    if (activeWalk && walkSteps.length > 0) {
      onActiveWalkChange?.({ paths: walkSteps.map((s) => s.path), direction: activeWalk });
    } else {
      onActiveWalkChange?.({ paths: [], direction: null });
    }
  }, [activeWalk, walkSteps, onActiveWalkChange]);

  const repoName = useMemo(() => {
    const parts = rootPath.split("/").filter(Boolean);
    return parts.pop() || "repository";
  }, [rootPath]);

  const frameworkId = (data.framework as FrameworkId) || "generic";
  const frameworkName =
    data.frameworkName ||
    (frameworkId === "nestjs" ? "NestJS" : frameworkId === "nextjs" ? "Next.js" : frameworkId === "express" ? "Express" : "Plain Library");

  const routes = useMemo(() => data.routes || [], [data.routes]);
  const [routeSearch, setRouteSearch] = useState("");

  const filteredRoutes = useMemo(() => {
    if (!routeSearch.trim()) return routes;
    const q = routeSearch.toLowerCase();
    return routes.filter(
      (r) =>
        r.path.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q) ||
        r.file.toLowerCase().includes(q)
    );
  }, [routes, routeSearch]);

  const routeCount = routes.length;

  // Unidentified / unclassified files count
  const unclassifiedCount = useMemo(() => {
    return files.filter((f) => getFileKind(f.path, frameworkId, data.roles).label === "Script / Tooling").length;
  }, [files, frameworkId, data.roles]);

  // Top files the rest of the repository leans on most (fan-in DESC)
  const mostDependedOn = useMemo(() => {
    return [...files]
      .filter((f) => f.fanIn > 0)
      .sort((a, b) => b.fanIn - a.fanIn)
      .slice(0, 7);
  }, [files]);

  // Files nothing imports at all (fanIn === 0), where reading starts
  const readingEntryPoints = useMemo(() => {
    return [...files]
      .filter((f) => f.fanIn === 0)
      .sort((a, b) => {
        const aIsPage = a.path.includes("page.") || a.path.includes("index.");
        const bIsPage = b.path.includes("page.") || b.path.includes("index.");
        if (aIsPage && !bIsPage) return -1;
        if (!aIsPage && bIsPage) return 1;
        return a.path.localeCompare(b.path);
      })
      .slice(0, 7);
  }, [files]);

  // Selected file details
  const selectedFile = useMemo(() => {
    if (!selectedFilePath) return null;
    return files.find((f) => f.path === selectedFilePath) || null;
  }, [files, selectedFilePath]);

  // Dependents (incoming callers) and Dependencies (outgoing imports) for selected file
  const fileNeighbors = useMemo(() => {
    if (!selectedFilePath) return { dependents: [], dependencies: [] };

    // Unique incoming caller files
    const incomingMap = new Map<string, ParsedEdge>();
    for (const e of edges) {
      if (e.target === selectedFilePath && e.resolved) {
        if (!incomingMap.has(e.source)) {
          incomingMap.set(e.source, e);
        }
      }
    }

    // Unique outgoing dependency files
    const outgoingMap = new Map<string, ParsedEdge>();
    for (const e of edges) {
      if (e.source === selectedFilePath && e.resolved && e.target) {
        if (!outgoingMap.has(e.target)) {
          outgoingMap.set(e.target, e);
        }
      }
    }

    return {
      dependents: Array.from(incomingMap.values()),
      dependencies: Array.from(outgoingMap.values()),
    };
  }, [selectedFilePath, edges]);

  // Selected folder details
  const selectedNodeFiles = useMemo(() => {
    if (!selectedNodeId || selectedFilePath) return [];
    return files.filter((f) => {
      const folder = f.folder || ".";
      return folder === selectedNodeId || folder.startsWith(selectedNodeId + "/");
    });
  }, [files, selectedNodeId, selectedFilePath]);

  // Category breakdown for selected folder
  const folderCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of selectedNodeFiles) {
      const kind = getFileKind(f.path).label;
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [selectedNodeFiles]);

  const hasSelection = Boolean(selectedFile || selectedNodeId);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-surface select-none overflow-hidden font-mono text-xs">
      {/* ========================================================================= */}
      {/* PANE TOP BAR: Tabs (when selected) or Resting Header                     */}
      {/* ========================================================================= */}
      <div className="flex h-10 items-center justify-between border-b border-border px-2.5 bg-surface shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("structure")}
            className={`rounded px-2 py-0.5 text-xs font-semibold cursor-pointer transition-colors ${activeTab === "structure"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted hover:text-foreground border border-transparent"
              }`}
          >
            Structure
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("routes")}
            className={`rounded px-2 py-0.5 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${activeTab === "routes"
              ? "bg-surface-raised text-foreground border border-border"
              : "text-muted hover:text-foreground border border-transparent"
              }`}
          >
            <span>Routes</span>
            {routes.length > 0 && (
              <span className="rounded bg-accent/15 px-1 py-0.2 text-[9px] text-accent font-bold border border-accent/30 font-mono">
                {routes.length}
              </span>
            )}
          </button>
          {(() => {
            const currentTargetKey = selectedFilePath ? `file:${selectedFilePath}` : selectedNodeId ? `folder:${selectedNodeId}` : null;
            const isCached = Boolean(currentTargetKey && explanationsCache[currentTargetKey]);
            return (
              <button
                type="button"
                onClick={() => setActiveTab("explanation")}
                className={`rounded px-2 py-0.5 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${activeTab === "explanation"
                  ? "bg-surface-raised text-foreground border border-border"
                  : "text-muted hover:text-foreground border border-transparent"
                  }`}
              >
                <span>AI</span>
                {isCached && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Explanation cached in memory" />
                )}
              </button>
            );
          })()}
        </div>

        {hasSelection && (
          <button
            type="button"
            onClick={() => {
              onSelectNode(null);
              onSelectFile(null);
              setActiveWalk(null);
            }}
            className="text-[11px] text-muted hover:text-foreground cursor-pointer px-1.5 py-0.5 rounded hover:bg-surface-raised transition-colors"
            title="Deselect to return to Repository Overview"
          >
            ✕
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PANE BODY: Resting State vs Selected Item Details                        */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* ------------------------------------------------------------- */}
        {/* CASE 0: ROUTES TAB VIEW                                       */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "routes" && (
          <div className="space-y-3">
            {/* Search and stats bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                  Declared Routes
                </span>
                <span className="text-[10px] text-muted">
                  {filteredRoutes.length} of {routes.length}
                </span>
              </div>
              <input
                type="text"
                placeholder="Filter routes (e.g. GET, /users)..."
                value={routeSearch}
                onChange={(e) => setRouteSearch(e.target.value)}
                className="w-full rounded border border-border bg-surface-raised px-2.5 py-1 text-xs text-foreground focus:outline-hidden"
              />
            </div>

            {/* Route List / Empty State */}
            {routes.length === 0 ? (
              <div className="rounded border border-border/80 bg-surface-raised/40 p-4 text-center space-y-1">
                <div className="text-xs font-semibold text-foreground">No routes detected</div>
                <p className="text-[10px] text-muted leading-relaxed">
                  Either this codebase exposes no HTTP endpoints, or no framework adapter matched.
                </p>
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div className="text-[10px] text-muted italic text-center py-4">
                No routes matching &ldquo;{routeSearch}&rdquo;
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredRoutes.map((rt, idx) => (
                  <div
                    key={`${rt.file}-${rt.method}-${rt.path}-${idx}`}
                    onClick={() => {
                      onSelectFile(rt.file);
                      setActiveTab("structure");
                    }}
                    onMouseEnter={() => onHoverTarget(rt.file)}
                    onMouseLeave={() => onHoverTarget(null)}
                    className="group flex flex-col gap-1 rounded border border-border/70 bg-surface-raised/40 p-2 cursor-pointer hover:border-accent/60 hover:bg-surface-raised transition-all"
                    title={`Click to open ${rt.file}`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider shrink-0 ${getMethodBadge(
                          rt.method
                        )}`}
                      >
                        {rt.method}
                      </span>
                      <span
                        className="font-mono text-foreground font-bold text-xs truncate flex-1"
                        title={rt.path}
                      >
                        {rt.path}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted truncate font-mono group-hover:text-foreground/80">
                      {rt.file}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* CASE 1: RESTING STATE (Nothing selected)                      */}
        {/* ------------------------------------------------------------- */}
        {!hasSelection && activeTab === "structure" && (
          <div className="space-y-4">
            {/* Repo Title & Framework Badge */}
            <div>
              <span className="text-[10px] uppercase text-muted tracking-wider block">Target</span>
              <h3 className="text-sm font-bold text-foreground truncate mt-0.5" title={rootPath}>
                {repoName}
              </h3>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="text-[11px] text-accent font-medium">{frameworkName}</span>
              </div>
            </div>

            {/* High-Level Metric Tiles */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded border border-border bg-surface-raised/40 p-2">
                <span className="text-foreground font-bold text-sm block">{stats.filesParsed}</span>
                <span className="text-[10px] text-muted">Files</span>
              </div>
              <div className="rounded border border-border bg-surface-raised/40 p-2">
                <span className="text-foreground font-bold text-sm block">
                  {stats.totalLines.toLocaleString()}
                </span>
                <span className="text-[10px] text-muted">Lines</span>
              </div>
              <div className="rounded border border-border bg-surface-raised/40 p-2">
                <span className="text-foreground font-bold text-sm block">{routeCount}</span>
                <span className="text-[10px] text-muted">Routes</span>
              </div>
            </div>

            {/* Total Imports & Unclassified Convention Count */}
            <div className="rounded bg-surface-raised/60 p-2.5 text-[11px] space-y-1 border border-border">
              <div className="flex justify-between">
                <span className="text-muted">Total Imports:</span>
                <span className="text-foreground font-medium">{data.coverage.totalImports}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Internal Edges:</span>
                <span className="text-foreground font-medium">{data.coverage.resolvedInternal}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted">Unidentified Files:</span>
                <span className="text-muted font-medium">{unclassifiedCount}</span>
              </div>
              {unclassifiedCount > 0 && analysisId && (
                <div className="pt-1 border-t border-border/40">
                  <button
                    type="button"
                    disabled={isClassifying}
                    onClick={async () => {
                      setIsClassifying(true);
                      setClassificationStatus(null);
                      try {
                        const res = await classifyUnmatchedFiles(analysisId);
                        if (res.success) {
                          setClassificationStatus(`Classified ${res.classifiedCount} files into functional roles.`);
                        } else {
                          setClassificationStatus(`Classification failed: ${res.error}`);
                        }
                      } finally {
                        setIsClassifying(false);
                      }
                    }}
                    className="w-full rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] text-accent hover:bg-accent/20 cursor-pointer font-semibold transition-colors disabled:opacity-50"
                  >
                    {isClassifying ? "Classifying with Gemini 3 Flash..." : `Classify ${unclassifiedCount} Files with Gemini`}
                  </button>
                  {classificationStatus && (
                    <div className="text-[10px] text-accent mt-1 text-center font-sans">
                      {classificationStatus}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Ranked List 1: What the repository leans on most (fan-in DESC) */}
            <div>
              <span className="text-[10px] uppercase text-incoming font-semibold tracking-wider block mb-1">
                Most Depended-On
              </span>
              <p className="text-[10px] text-muted mb-1.5">Modules with the highest incoming callers</p>
              <div className="space-y-1">
                {mostDependedOn.map((file) => {
                  const isHovered = hoveredTarget === file.path;
                  return (
                    <div
                      key={file.path}
                      onClick={() => onSelectFile(file.path)}
                      onMouseEnter={() => onHoverTarget(file.path)}
                      onMouseLeave={() => onHoverTarget(null)}
                      className={`flex items-center justify-between rounded border p-1.5 text-[11px] cursor-pointer transition-colors ${isHovered
                        ? "border-incoming bg-incoming/10 text-foreground"
                        : "border-border/70 bg-surface-raised/40 text-foreground/90 hover:border-incoming/40 hover:bg-surface-raised"
                        }`}
                      title={file.path}
                    >
                      <span className="truncate pr-2 font-medium">
                        {file.path.split("/").pop()}
                      </span>
                      <span className="rounded bg-incoming/10 px-1.5 py-0.2 text-[10px] text-incoming font-bold shrink-0 border border-incoming/30">
                        ↓ {file.fanIn}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ranked List 2: Where reading starts (fan-in === 0) */}
            <div>
              <span className="text-[10px] uppercase text-accent font-semibold tracking-wider block mb-1">
                Where Reading Starts
              </span>
              <p className="text-[10px] text-muted mb-1.5">Entrypoints nothing imports (leaf roots)</p>
              <div className="space-y-1">
                {readingEntryPoints.map((file) => {
                  const isHovered = hoveredTarget === file.path;
                  return (
                    <div
                      key={file.path}
                      onClick={() => onSelectFile(file.path)}
                      onMouseEnter={() => onHoverTarget(file.path)}
                      onMouseLeave={() => onHoverTarget(null)}
                      className={`flex items-center justify-between rounded border p-1.5 text-[11px] cursor-pointer transition-colors ${isHovered
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border/70 bg-surface-raised/40 text-foreground/90 hover:border-accent/40 hover:bg-surface-raised"
                        }`}
                      title={file.path}
                    >
                      <span className="truncate pr-2 font-medium">
                        {file.path.split("/").pop()}
                      </span>
                      <span className="text-[10px] text-muted shrink-0">
                        {file.linesCount}L
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* Phase 6: Collapsible Insights Panel (Starts collapsed)        */}
            {/* ------------------------------------------------------------- */}
            <div className="rounded border border-border bg-surface-raised/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsInsightsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between p-2.5 text-left hover:bg-surface-raised cursor-pointer transition-colors group"
                title="Toggle Codebase Insights"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted group-hover:text-foreground">
                    {isInsightsOpen ? "▼" : "▶"}
                  </span>
                  <span className="text-xs font-semibold text-foreground">Codebase Insights</span>
                </div>
                <span className="rounded bg-surface px-1.5 py-0.2 text-[10px] text-muted border border-border font-medium">
                  {insights.totalCount}
                </span>
              </button>

              {isInsightsOpen && (
                <div className="border-t border-border/60 p-2.5 space-y-4 bg-surface/50">
                  {/* 1. Files nothing imports (LEADS THE LIST per spec) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-semibold text-accent tracking-wider">
                        Files Nothing Imports ({insights.unimported.length})
                      </span>
                    </div>
                    <p className="text-[10px] text-muted mb-2 leading-relaxed">
                      {INSIGHT_SENTENCES.unimported}
                    </p>
                    {insights.unimported.length > 0 ? (
                      <div className="space-y-1">
                        {insights.unimported.map((item) => (
                          <div
                            key={item.path}
                            onClick={() => onSelectFile(item.path)}
                            onMouseEnter={() => onHoverTarget(item.path)}
                            onMouseLeave={() => onHoverTarget(null)}
                            className="flex items-center justify-between rounded border border-border/80 bg-surface-raised/50 p-1.5 text-[11px] cursor-pointer hover:border-accent hover:bg-surface-raised transition-colors"
                            title={item.path}
                          >
                            <span className="truncate pr-2 font-medium">
                              {item.path.split("/").pop()}
                            </span>
                            <span className="text-[10px] text-muted shrink-0">{item.meta}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted italic">No unimported standalone files.</div>
                    )}
                  </div>

                  {/* 2. Files an unusual number of things import (POPULAR / HIGH FAN-IN) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-semibold text-incoming tracking-wider">
                        High Fan-In Files ({insights.popular.length})
                      </span>
                    </div>
                    <p className="text-[10px] text-muted mb-2 leading-relaxed">
                      {INSIGHT_SENTENCES.popular}
                    </p>
                    {insights.popular.length > 0 ? (
                      <div className="space-y-1">
                        {insights.popular.map((item) => (
                          <div
                            key={item.path}
                            onClick={() => onSelectFile(item.path)}
                            onMouseEnter={() => onHoverTarget(item.path)}
                            onMouseLeave={() => onHoverTarget(null)}
                            className="flex items-center justify-between rounded border border-border/80 bg-surface-raised/50 p-1.5 text-[11px] cursor-pointer hover:border-incoming/60 hover:bg-surface-raised transition-colors"
                            title={item.path}
                          >
                            <span className="truncate pr-2 font-medium">
                              {item.path.split("/").pop()}
                            </span>
                            <span className="rounded bg-incoming/10 px-1.5 py-0.2 text-[10px] text-incoming border border-incoming/30 font-bold shrink-0">
                              {item.meta}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted italic">No high fan-in hotspots.</div>
                    )}
                  </div>

                  {/* 3. Circular Dependency Cycles (CYCLES) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-semibold text-outgoing tracking-wider">
                        Circular Dependencies ({insights.cycles.length})
                      </span>
                    </div>
                    <p className="text-[10px] text-muted mb-2 leading-relaxed">
                      {INSIGHT_SENTENCES.cycle}
                    </p>
                    {insights.cycles.length > 0 ? (
                      <div className="space-y-1.5">
                        {insights.cycles.map((item, idx) => (
                          <div
                            key={idx}
                            className="rounded border border-outgoing/40 bg-outgoing/5 p-2 text-[11px] space-y-1"
                          >
                            <div className="text-[10px] font-bold text-outgoing">
                              Cycle #{idx + 1} ({item.cycle.length - 1} hops)
                            </div>
                            <div className="space-y-0.5">
                              {item.cycle.map((p, pIdx) => (
                                <div
                                  key={pIdx}
                                  onClick={() => onSelectFile(p)}
                                  onMouseEnter={() => onHoverTarget(p)}
                                  onMouseLeave={() => onHoverTarget(null)}
                                  className="truncate text-[10px] hover:underline cursor-pointer text-foreground/90 font-mono"
                                  title={`Click to select ${p}`}
                                >
                                  {pIdx > 0 ? "↳ " : ""}
                                  {p.split("/").pop()}{" "}
                                  <span className="text-muted text-[9px]">({p})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted italic">No circular dependencies found.</div>
                    )}
                  </div>

                  {/* 4. Files that are simply too long (OVERSIZED) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                        Oversized Files ({insights.oversized.length})
                      </span>
                    </div>
                    <p className="text-[10px] text-muted mb-2 leading-relaxed">
                      {INSIGHT_SENTENCES.oversized}
                    </p>
                    {insights.oversized.length > 0 ? (
                      <div className="space-y-1">
                        {insights.oversized.map((item) => (
                          <div
                            key={item.path}
                            onClick={() => onSelectFile(item.path)}
                            onMouseEnter={() => onHoverTarget(item.path)}
                            onMouseLeave={() => onHoverTarget(null)}
                            className="flex items-center justify-between rounded border border-border/80 bg-surface-raised/50 p-1.5 text-[11px] cursor-pointer hover:border-muted hover:bg-surface-raised transition-colors"
                            title={item.path}
                          >
                            <span className="truncate pr-2 font-medium">
                              {item.path.split("/").pop()}
                            </span>
                            <span className="text-[10px] text-muted shrink-0">{item.meta}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted italic">No oversized files.</div>
                    )}
                  </div>
                </div>
              )}
              {/* Routes preview in resting view */}
              {routes.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                      Declared Routes ({routes.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("routes")}
                      className="text-[10px] text-accent hover:underline cursor-pointer"
                    >
                      View all in Routes tab →
                    </button>
                  </div>
                  <div className="space-y-1">
                    {routes.slice(0, 5).map((rt, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectFile(rt.file)}
                        onMouseEnter={() => onHoverTarget(rt.file)}
                        onMouseLeave={() => onHoverTarget(null)}
                        className="flex items-center justify-between rounded border border-border/70 bg-surface-raised/40 p-1.5 text-[11px] cursor-pointer hover:border-accent/60 transition-colors"
                        title={rt.file}
                      >
                        <div className="flex items-center gap-1.5 truncate pr-2">
                          <span
                            className={`px-1 py-0.2 rounded text-[9px] font-bold ${getMethodBadge(
                              rt.method
                            )}`}
                          >
                            {rt.method}
                          </span>
                          <span className="font-mono text-foreground font-semibold truncate" title={rt.path}>
                            {rt.path}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted truncate max-w-[80px]">
                          {rt.file.split("/").pop()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* CASE 2: SELECTED FILE                                         */}
        {/* ------------------------------------------------------------- */}
        {selectedFile && activeTab === "structure" && (
          <div className="space-y-4">
            {/* File Path & Role/Kind */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-muted tracking-wider">File</span>
                <span
                  className="rounded px-1.5 py-0.2 text-[10px] font-medium"
                  style={{
                    backgroundColor: `${getFileKind(selectedFile.path, frameworkId, data.roles).color}15`,
                    color: getFileKind(selectedFile.path, frameworkId, data.roles).color,
                    border: `1px solid ${getFileKind(selectedFile.path, frameworkId, data.roles).color}40`,
                  }}
                >
                  {getFileKind(selectedFile.path, frameworkId, data.roles).label}
                </span>
              </div>
              <h4 className="text-xs font-bold text-foreground break-all select-all mt-1">
                {selectedFile.path}
              </h4>
              <p className="text-[11px] text-muted mt-0.5">folder: {selectedFile.folder}</p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("explanation")}
                  className="w-full flex items-center justify-center gap-1.5 rounded border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25 hover:border-accent cursor-pointer transition-colors"
                >
                  <span>Explain File</span>
                  {explanationsCache[`file:${selectedFile.path}`] && (
                    <span className="rounded bg-accent/20 px-1 py-0.2 text-[9px] text-accent">⚡ Cached</span>
                  )}
                </button>
              </div>
            </div>

            {/* Declared Routes in this file */}
            {(() => {
              const fileRoutes = routes.filter((r) => r.file === selectedFile.path);
              if (fileRoutes.length === 0) return null;
              return (
                <div className="rounded border border-border bg-surface-raised/40 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                    <span>Declared Routes</span>
                    <span className="text-[10px] text-muted">
                      {fileRoutes.length} endpoint{fileRoutes.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {fileRoutes.map((rt, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded bg-surface p-1.5 border border-border/60"
                      >
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider shrink-0 ${getMethodBadge(
                            rt.method
                          )}`}
                        >
                          {rt.method}
                        </span>
                        <span
                          className="font-mono text-foreground font-bold text-xs truncate"
                          title={rt.path}
                        >
                          {rt.path}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded border border-incoming/30 bg-incoming/5 p-2">
                <span className="text-incoming font-bold text-sm block">
                  ↓ {fileNeighbors.dependents.length}
                </span>
                <span className="text-[10px] text-muted">Dependents (Callers)</span>
              </div>
              <div className="rounded border border-outgoing/30 bg-outgoing/5 p-2">
                <span className="text-outgoing font-bold text-sm block">
                  ↑ {fileNeighbors.dependencies.length}
                </span>
                <span className="text-[10px] text-muted">Dependencies (Imports)</span>
              </div>
            </div>

            {/* Phase 6: Transitive Walk Buttons (Blast Radius & Dependency Chain) */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveWalk(activeWalk === "upstream" ? null : "upstream")}
                  className={`rounded px-2.5 py-1.5 text-xs font-semibold border cursor-pointer transition-all flex items-center justify-center gap-1.5 ${activeWalk === "upstream"
                    ? "bg-incoming/20 text-incoming border-incoming/60 ring-2 ring-incoming/40 shadow-xs"
                    : "bg-surface-raised text-foreground border-border hover:border-incoming/50 hover:bg-surface-raised/80"
                    }`}
                  title="What breaks if this file changes (2 levels deep)"
                >
                  <span>💥</span>
                  <span>Blast radius</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWalk(activeWalk === "downstream" ? null : "downstream")}
                  className={`rounded px-2.5 py-1.5 text-xs font-semibold border cursor-pointer transition-all flex items-center justify-center gap-1.5 ${activeWalk === "downstream"
                    ? "bg-outgoing/20 text-outgoing border-outgoing/60 ring-2 ring-outgoing/40 shadow-xs"
                    : "bg-surface-raised text-foreground border-border hover:border-outgoing/50 hover:bg-surface-raised/80"
                    }`}
                  title="Everything this file needs (2 levels deep)"
                >
                  <span>⛓</span>
                  <span>Dependency chain</span>
                </button>
              </div>

              {/* Active Walk Results Panel (Instant, 0 network requests) */}
              {activeWalk && (
                <div className="rounded border border-border bg-surface-raised/70 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider ${activeWalk === "upstream" ? "text-incoming" : "text-outgoing"
                          }`}
                      >
                        {activeWalk === "upstream" ? `Blast Radius` : `Dependency Chain`}
                      </span>
                      <span className="rounded bg-surface px-1.5 py-0.2 text-[10px] text-muted border border-border font-medium">
                        {walkSteps.length} {walkSteps.length === 1 ? "file" : "files"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveWalk(null)}
                      className="text-[10px] text-muted hover:text-foreground cursor-pointer px-1 rounded hover:bg-surface-raised"
                      title="Close walk view"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-[10px] text-muted leading-tight">
                    {activeWalk === "upstream"
                      ? "Transitive walk 2 levels deep: everything that breaks if this file changes."
                      : "Transitive walk 2 levels deep: everything this file needs directly or indirectly."}
                  </p>

                  {walkSteps.length > 0 ? (
                    <div className="space-y-1 max-h-60 overflow-y-auto pt-1">
                      {walkSteps.map((step) => {
                        const isHovered = hoveredTarget === step.path;
                        return (
                          <div
                            key={step.path}
                            onClick={() => onSelectFile(step.path)}
                            onMouseEnter={() => onHoverTarget(step.path)}
                            onMouseLeave={() => onHoverTarget(null)}
                            className={`flex items-center justify-between rounded border p-1.5 text-[11px] cursor-pointer transition-all ${isHovered
                              ? activeWalk === "upstream"
                                ? "border-incoming bg-incoming/15 text-foreground ring-1 ring-incoming/50"
                                : "border-outgoing bg-outgoing/15 text-foreground ring-1 ring-outgoing/50"
                              : "border-border/80 bg-surface/60 text-foreground hover:bg-surface-raised"
                              }`}
                            title={`Click to select ${step.path} (${step.depth === 1 ? "1 hop" : "2 hops"})`}
                          >
                            <div className="truncate pr-2">
                              <div className="font-semibold truncate">{step.path.split("/").pop()}</div>
                              <div className="text-[9px] text-muted truncate">{step.path}</div>
                            </div>
                            <span
                              className={`rounded px-1.5 py-0.2 text-[9px] font-bold shrink-0 border ${step.depth === 1
                                ? activeWalk === "upstream"
                                  ? "bg-incoming/15 text-incoming border-incoming/30"
                                  : "bg-outgoing/15 text-outgoing border-outgoing/30"
                                : "bg-surface text-muted border-border"
                                }`}
                            >
                              {step.depth === 1 ? "direct" : "2 hops"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded border border-dashed border-border/70 p-2 text-center text-[10px] text-muted italic">
                      No {activeWalk === "upstream" ? "callers" : "dependencies"} found within 2 levels.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* File Metadata */}
            <div className="rounded bg-surface-raised/70 p-2.5 text-[11px] space-y-1 border border-border">
              <div className="flex justify-between">
                <span className="text-muted">Lines:</span>
                <span className="text-foreground font-medium">{selectedFile.linesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Extension:</span>
                <span className="text-foreground font-medium">{selectedFile.extension}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Content Hash:</span>
                <span className="text-muted font-mono">{selectedFile.contentHash.slice(0, 10)}…</span>
              </div>
            </div>

            {/* Dependents (Incoming Callers) List */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase text-incoming font-semibold tracking-wider">
                  Dependents ({fileNeighbors.dependents.length})
                </span>
                <span className="text-[9px] text-muted">Files that import this</span>
              </div>

              {fileNeighbors.dependents.length > 0 ? (
                <div className="space-y-1">
                  {fileNeighbors.dependents.map((edge) => {
                    const isHovered = hoveredTarget === edge.source;
                    return (
                      <div
                        key={edge.id}
                        onClick={() => onSelectFile(edge.source)}
                        onMouseEnter={() => onHoverTarget(edge.source)}
                        onMouseLeave={() => onHoverTarget(null)}
                        className={`rounded border p-1.5 text-[11px] cursor-pointer transition-all ${isHovered
                          ? "border-incoming bg-incoming/15 text-foreground ring-1 ring-incoming/50"
                          : "border-border bg-surface-raised/60 text-foreground hover:border-incoming/50 hover:bg-surface-raised"
                          }`}
                        title={`Click to navigate to ${edge.source}`}
                      >
                        <div className="truncate font-semibold">{edge.source.split("/").pop()}</div>
                        <div className="truncate text-[10px] text-muted">{edge.source}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded border border-dashed border-border/70 p-2 text-center text-[11px] text-muted italic">
                  No other file in repository imports this
                </div>
              )}
            </div>

            {/* Dependencies (Outgoing Imports) List */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase text-outgoing font-semibold tracking-wider">
                  Dependencies ({fileNeighbors.dependencies.length})
                </span>
                <span className="text-[9px] text-muted">Files this imports</span>
              </div>

              {fileNeighbors.dependencies.length > 0 ? (
                <div className="space-y-1">
                  {fileNeighbors.dependencies.map((edge) => {
                    const targetPath = edge.target || edge.specifier;
                    const isHovered = hoveredTarget === targetPath;
                    return (
                      <div
                        key={edge.id}
                        onClick={() => edge.target && onSelectFile(edge.target)}
                        onMouseEnter={() => edge.target && onHoverTarget(edge.target)}
                        onMouseLeave={() => onHoverTarget(null)}
                        className={`rounded border p-1.5 text-[11px] cursor-pointer transition-all ${isHovered
                          ? "border-outgoing bg-outgoing/15 text-foreground ring-1 ring-outgoing/50"
                          : "border-border bg-surface-raised/60 text-foreground hover:border-outgoing/50 hover:bg-surface-raised"
                          }`}
                        title={`Click to navigate to ${targetPath}`}
                      >
                        <div className="truncate font-semibold">{targetPath.split("/").pop()}</div>
                        <div className="truncate text-[10px] text-muted">{targetPath}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded border border-dashed border-border/70 p-2 text-center text-[11px] text-muted italic">
                  No internal dependencies
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* CASE 3: SELECTED FOLDED FOLDER NODE                           */}
        {/* ------------------------------------------------------------- */}
        {selectedNodeId && !selectedFile && activeTab === "structure" && (
          <div className="space-y-4">
            <div>
              <span className="text-[10px] uppercase text-muted tracking-wider">Folder Node</span>
              <h4 className="text-xs font-bold text-foreground break-all select-all mt-0.5">
                {selectedNodeId}
              </h4>
              <p className="text-[11px] text-muted mt-0.5">{selectedNodeFiles.length} files contained</p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("explanation")}
                  className="w-full flex items-center justify-center gap-1.5 rounded border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25 hover:border-accent cursor-pointer transition-colors"
                >
                  <span>Explain Folder</span>
                  {selectedNodeId && explanationsCache[`folder:${selectedNodeId}`] && (
                    <span className="rounded bg-accent/20 px-1 py-0.2 text-[9px] text-accent">⚡ Cached</span>
                  )}
                </button>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded border border-border bg-surface-raised/40 p-2">
                <span className="text-foreground font-bold text-sm block">{selectedNodeFiles.length}</span>
                <span className="text-[10px] text-muted">Files</span>
              </div>
              <div className="rounded border border-border bg-surface-raised/40 p-2">
                <span className="text-foreground font-bold text-sm block">
                  {selectedNodeFiles.reduce((acc, f) => acc + f.linesCount, 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-muted">Code Lines</span>
              </div>
            </div>

            {/* Folder categories breakdown */}
            <div>
              <span className="text-[10px] uppercase text-muted tracking-wider block mb-1">
                Composition
              </span>
              <div className="space-y-1">
                {folderCategoryCounts.map(([kind, count]) => (
                  <div
                    key={kind}
                    className="flex justify-between items-center rounded bg-surface-raised/50 px-2 py-1 text-[11px] border border-border/60"
                  >
                    <span className="text-muted">{kind}</span>
                    <span className="text-foreground font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contained Files List */}
            <div>
              <span className="text-[10px] uppercase text-muted tracking-wider block mb-1.5">
                Contained Files ({selectedNodeFiles.length})
              </span>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {selectedNodeFiles.map((f) => {
                  const isHovered = hoveredTarget === f.path;
                  return (
                    <div
                      key={f.path}
                      onClick={() => onSelectFile(f.path)}
                      onMouseEnter={() => onHoverTarget(f.path)}
                      onMouseLeave={() => onHoverTarget(null)}
                      className={`flex items-center justify-between rounded border p-1.5 text-[11px] cursor-pointer transition-colors ${isHovered
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border/70 bg-surface-raised/50 text-foreground hover:border-accent hover:bg-surface-raised"
                        }`}
                      title={`Click to select ${f.path}`}
                    >
                      <span className="truncate pr-2 font-medium">{f.path.split("/").pop()}</span>
                      <span className="text-[10px] text-muted shrink-0">{f.linesCount}L</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* CASE 4: EXPLANATION TAB                                       */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "explanation" && (
          <ExplanationPanel
            analysisId={analysisId}
            selectedFilePath={selectedFilePath}
            selectedNodeId={selectedNodeId}
            allFilePaths={files.map((f) => f.path)}
            onSelectFile={onSelectFile}
            cache={explanationsCache}
            onCacheUpdate={(key, res) => {
              setExplanationsCache((prev) => ({ ...prev, [key]: res }));
            }}
          />
        )}
      </div>
    </aside>
  );
}