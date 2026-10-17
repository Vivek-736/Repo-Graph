"use client";

import { useMemo, useState } from "react";
import { ParserResult, ParsedFile, ParsedEdge } from "@/lib/parser/types";

interface DetailPaneProps {
  data: ParserResult;
  selectedNodeId: string | null;
  selectedFilePath: string | null;
  hoveredTarget: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onSelectFile: (filePath: string | null) => void;
  onHoverTarget: (target: string | null) => void;
}

export type DetailTab = "structure" | "explanation";

/**
 * Classifies a file into a human-readable role/kind.
 */
export function getFileKind(filePath: string): { label: string; color: string } {
  const p = filePath.toLowerCase();
  if (p.includes("/page.") || p.includes("/route.") || p.includes("/layout.") || p.includes("proxy.") || p.includes("middleware.")) {
    return { label: "Route / Page", color: "#a855f7" };
  }
  if (p.startsWith("components/") || p.includes("/components/") || p.endsWith(".tsx")) {
    return { label: "Component", color: "#38bdf8" };
  }
  if (p.startsWith("lib/") || p.includes("/lib/") || p.includes("server.") || p.includes("service.")) {
    return { label: "Core Service", color: "#10b981" };
  }
  if (p.includes("types.") || p.includes("schema.") || p.endsWith(".d.ts")) {
    return { label: "Type Contract", color: "#f59e0b" };
  }
  return { label: "Script / Tooling", color: "#f43f5e" };
}

/**
 * Detects framework from file tree.
 */
export function detectFramework(files: ParsedFile[]): string {
  const hasAppRouter = files.some((f) => f.path.startsWith("app/"));
  const hasPagesRouter = files.some((f) => f.path.startsWith("pages/"));
  if (hasAppRouter) return "Next.js (App Router)";
  if (hasPagesRouter) return "Next.js (Pages Router)";
  const hasVite = files.some((f) => f.path.includes("vite.config"));
  if (hasVite) return "Vite";
  return "Standalone TypeScript";
}

export function DetailPane({
  data,
  selectedNodeId,
  selectedFilePath,
  hoveredTarget,
  onSelectNode,
  onSelectFile,
  onHoverTarget,
}: DetailPaneProps) {
  const { files, edges, stats, rootPath } = data;

  // Tab state persists across selection changes (Acceptance Check 4)
  const [activeTab, setActiveTab] = useState<DetailTab>("structure");

  const repoName = useMemo(() => {
    const parts = rootPath.split("/").filter(Boolean);
    return parts.pop() || "repository";
  }, [rootPath]);

  const frameworkName = useMemo(() => detectFramework(files), [files]);

  // Count route files
  const routeCount = useMemo(() => {
    return files.filter((f) => {
      const p = f.path.toLowerCase();
      return p.includes("/page.") || p.includes("/route.") || p.includes("proxy.");
    }).length;
  }, [files]);

  // Unidentified / unclassified files count
  const unclassifiedCount = useMemo(() => {
    return files.filter((f) => getFileKind(f.path).label === "Script / Tooling").length;
  }, [files]);

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
        // Prioritize pages/entrypoints first, then alphabetical
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
      <div className="flex h-10 items-center justify-between border-b border-border px-3.5 bg-surface shrink-0">
        {hasSelection ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("structure")}
              className={`rounded px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${activeTab === "structure"
                  ? "bg-surface-raised text-foreground border border-border"
                  : "text-muted hover:text-foreground border border-transparent"
                }`}
            >
              Structure
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("explanation")}
              className={`rounded px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${activeTab === "explanation"
                  ? "bg-surface-raised text-foreground border border-border"
                  : "text-muted hover:text-foreground border border-transparent"
                }`}
            >
              Explanation
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Repository Overview
            </span>
          </div>
        )}

        {hasSelection && (
          <button
            type="button"
            onClick={() => {
              onSelectNode(null);
              onSelectFile(null);
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
        {/* CASE 1: RESTING STATE (Nothing selected)                      */}
        {/* ------------------------------------------------------------- */}
        {!hasSelection && (
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
                <span className="text-foreground font-bold text-sm block">{stats.totalLines.toLocaleString()}</span>
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
              <div className="flex justify-between">
                <span className="text-muted">Unidentified Files:</span>
                <span className="text-muted font-medium">{unclassifiedCount}</span>
              </div>
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
                    backgroundColor: `${getFileKind(selectedFile.path).color}15`,
                    color: getFileKind(selectedFile.path).color,
                    border: `1px solid ${getFileKind(selectedFile.path).color}40`,
                  }}
                >
                  {getFileKind(selectedFile.path).label}
                </span>
              </div>
              <h4 className="text-xs font-bold text-foreground break-all select-all mt-1">
                {selectedFile.path}
              </h4>
              <p className="text-[11px] text-muted mt-0.5">folder: {selectedFile.folder}</p>
            </div>

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
              <div className="space-y-1">
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
        {hasSelection && activeTab === "explanation" && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted min-h-[300px]">
            <div className="h-9 w-9 rounded-full bg-surface-raised flex items-center justify-center border border-border mb-3 text-accent text-sm">
              ✦
            </div>
            <h4 className="text-xs font-bold text-foreground">AI Explanation</h4>
            <p className="mt-1.5 text-[11px] text-muted leading-relaxed max-w-[200px]">
              No AI explanation generated yet. Explanations from parser syntax and immediate neighbours will be synthesized and cached in Phase 6.
            </p>
            {selectedFile && (
              <div className="mt-4 rounded bg-surface-raised px-2.5 py-1 text-[10px] text-muted border border-border truncate max-w-full">
                Target: {selectedFile.path.split("/").pop()}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}