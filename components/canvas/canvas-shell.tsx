"use client";

import { useMemo, useState } from "react";
import { ParserResult, ParsedFile } from "@/lib/parser/types";
import { GraphCanvas } from "./graph-canvas";
import { DetailPane } from "./detail-pane";

export interface FileCategory {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface CanvasShellProps {
  data: ParserResult;
}

/**
 * Pure function: categorizes files into a handful of distinct structural layers.
 */
export function categorizeFiles(files: ParsedFile[]): FileCategory[] {
  const categories: FileCategory[] = [
    { id: "routes", name: "Routes & Pages", color: "#a855f7", count: 0 },
    { id: "components", name: "Components", color: "#38bdf8", count: 0 },
    { id: "services", name: "Core & Services", color: "#10b981", count: 0 },
    { id: "types", name: "Types & Contracts", color: "#f59e0b", count: 0 },
    { id: "tooling", name: "Scripts & Tooling", color: "#f43f5e", count: 0 },
  ];

  for (const file of files) {
    const p = file.path.toLowerCase();
    if (p.includes("/page.") || p.includes("/route.") || p.includes("/layout.") || p.includes("proxy.") || p.includes("middleware.")) {
      categories[0].count++;
    } else if (p.startsWith("components/") || p.includes("/components/") || p.endsWith(".tsx")) {
      categories[1].count++;
    } else if (p.startsWith("lib/") || p.includes("/lib/") || p.includes("server.") || p.includes("service.")) {
      categories[2].count++;
    } else if (p.includes("types.") || p.includes("schema.") || p.endsWith(".d.ts")) {
      categories[3].count++;
    } else {
      categories[4].count++;
    }
  }

  return categories;
}

export function CanvasShell({ data }: CanvasShellProps) {
  const { files, edges, stats, rootPath } = data;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeWalk, setActiveWalk] = useState<{
    paths: string[];
    direction: "upstream" | "downstream" | null;
  }>({ paths: [], direction: null });

  const categories = useMemo(() => categorizeFiles(files), [files]);

  return (
    <div className="flex h-full w-full overflow-hidden font-mono text-xs">
      {/* ========================================================================= */}
      {/* 1. LEFT RAIL: Narrow column listing file categories                      */}
      {/* ========================================================================= */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface select-none">
        {/* Rail Header */}
        <div className="flex h-10 items-center justify-between border-b border-border px-3.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Categories
            </span>
            {activeCategoryId && (
              <button
                type="button"
                onClick={() => setActiveCategoryId(null)}
                className="text-[10px] text-accent hover:underline cursor-pointer ml-1"
                title="Clear category filter"
              >
                (clear)
              </button>
            )}
          </div>
          <span className="text-[10px] text-muted opacity-80">
            {categories.reduce((acc, c) => acc + c.count, 0)} files
          </span>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {categories.map((category) => {
            const isActive = activeCategoryId === category.id;
            return (
              <div
                key={category.id}
                onClick={() => setActiveCategoryId(isActive ? null : category.id)}
                className={`flex items-center justify-between rounded px-2.5 py-1.5 transition-colors cursor-pointer group ${
                  isActive
                    ? "bg-accent/15 border border-accent/40 text-foreground font-semibold ring-1 ring-accent/30 shadow-xs"
                    : "hover:bg-surface-raised border border-transparent text-foreground/90"
                }`}
                title={isActive ? "Click to clear filter" : `Click to filter by ${category.name}`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-xs group-hover:text-foreground">
                    {category.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isActive && <span className="text-[10px] text-accent">●</span>}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] border border-border/60 ${
                      isActive ? "bg-accent/20 text-accent font-bold" : "bg-surface-raised text-muted"
                    }`}
                  >
                    {category.count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rail Footer / Repository Metrics */}
        <div className="border-t border-border p-3 bg-surface-raised/40 space-y-1.5 text-[11px] text-muted">
          <div className="flex justify-between">
            <span>Parsed Files</span>
            <span className="text-foreground font-medium">{stats.filesParsed}</span>
          </div>
          <div className="flex justify-between">
            <span>Code Lines</span>
            <span className="text-foreground font-medium">{stats.totalLines.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Folders</span>
            <span className="text-foreground font-medium">{stats.distinctFolders}</span>
          </div>
          <div className="flex justify-between">
            <span>Re-exports</span>
            <span className="text-foreground font-medium">{stats.reexportsResolved}</span>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MIDDLE COLUMN: Interactive Graph Canvas                                */}
      {/* ========================================================================= */}
      <section className="flex flex-1 flex-col h-full bg-background relative overflow-hidden">
        {/* Canvas Toolbar / Breadcrumb Bar */}
        <div className="flex h-10 w-full shrink-0 items-center justify-between border-b border-border bg-surface px-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted text-[11px] uppercase tracking-wider">Repository</span>
            <span className="text-border">/</span>
            <span className="text-foreground font-semibold truncate max-w-sm" title={rootPath}>
              {rootPath.split("/").pop() || "workspace"}
            </span>
            {selectedFilePath && (
              <>
                <span className="text-border">/</span>
                <span className="text-accent truncate max-w-xs">{selectedFilePath}</span>
              </>
            )}
            {activeCategoryId && (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-[10px] text-accent border border-accent/30 font-medium">
                category: {categories.find((c) => c.id === activeCategoryId)?.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-muted text-[11px]">
            <span>{files.length} files</span>
            <span className="text-border">|</span>
            <span>{edges.length} edges</span>
            <span className="text-border">|</span>
            <span className="text-incoming">● in</span>
            <span className="text-outgoing">● out</span>
          </div>
        </div>

        {/* Canvas Body */}
        <div className="flex-1 relative w-full h-full">
          <GraphCanvas
            files={files}
            edges={edges}
            selectedNodeId={selectedNodeId}
            selectedFilePath={selectedFilePath}
            hoveredTarget={hoveredTarget}
            activeCategoryId={activeCategoryId}
            walkedFilePaths={activeWalk.paths}
            walkDirection={activeWalk.direction}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              setSelectedFilePath(null);
            }}
            onSelectFile={(path) => {
              setSelectedFilePath(path);
            }}
            onHoverTarget={setHoveredTarget}
          />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. RIGHT PANE: Detail Pane with Resting, Walk & Insights (Phase 6)        */}
      {/* ========================================================================= */}
      <DetailPane
        data={data}
        selectedNodeId={selectedNodeId}
        selectedFilePath={selectedFilePath}
        hoveredTarget={hoveredTarget}
        onSelectNode={setSelectedNodeId}
        onSelectFile={setSelectedFilePath}
        onHoverTarget={setHoveredTarget}
        onActiveWalkChange={setActiveWalk}
      />
    </div>
  );
}