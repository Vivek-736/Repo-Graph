"use client";

import { useMemo, useState } from "react";
import { ParserResult, ParsedFile } from "@/lib/parser/types";
import { GraphCanvas } from "./graph-canvas";

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

  const categories = useMemo(() => categorizeFiles(files), [files]);

  // Selected file object if any
  const selectedFile = useMemo(() => {
    if (!selectedFilePath) return null;
    return files.find((f) => f.path === selectedFilePath) || null;
  }, [files, selectedFilePath]);

  // Incoming callers and outgoing dependencies for selected file
  const fileDependencies = useMemo(() => {
    if (!selectedFilePath) return { incoming: [], outgoing: [] };

    const incoming = edges.filter((e) => e.target === selectedFilePath && e.resolved);
    const outgoing = edges.filter((e) => e.source === selectedFilePath && e.resolved);

    return { incoming, outgoing };
  }, [selectedFilePath, edges]);

  // Selected node details if a node is selected (and no single file)
  const selectedNodeFiles = useMemo(() => {
    if (!selectedNodeId || selectedFilePath) return [];
    return files.filter((f) => {
      const folder = f.folder || ".";
      return folder === selectedNodeId || folder.startsWith(selectedNodeId + "/");
    });
  }, [files, selectedNodeId, selectedFilePath]);

  return (
    <div className="flex h-full w-full overflow-hidden font-mono text-xs">
      {/* ========================================================================= */}
      {/* 1. LEFT RAIL: Narrow column listing file categories                      */}
      {/* ========================================================================= */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface select-none">
        {/* Rail Header */}
        <div className="flex h-10 items-center justify-between border-b border-border px-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Categories
          </span>
          <span className="text-[10px] text-muted opacity-80">
            {categories.reduce((acc, c) => acc + c.count, 0)} files
          </span>
        </div>

        {/* Categories List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between rounded px-2.5 py-1.5 transition-colors hover:bg-surface-raised cursor-default group"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2 w-2 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-xs text-foreground/90 group-hover:text-foreground">
                  {category.name}
                </span>
              </div>
              <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-muted border border-border/60">
                {category.count}
              </span>
            </div>
          ))}
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
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              setSelectedFilePath(null);
            }}
            onSelectFile={(path) => {
              setSelectedFilePath(path);
            }}
          />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. RIGHT PANE: Fixed column for inspection details                        */}
      {/* ========================================================================= */}
      <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-surface select-none overflow-y-auto">
        {/* Pane Header */}
        <div className="flex h-10 items-center justify-between border-b border-border px-3.5 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Inspector
          </span>
          <span className="text-[10px] text-muted opacity-80">
            {selectedFile ? "File Details" : selectedNodeId ? "Folder Details" : "No Selection"}
          </span>
        </div>

        {/* Selected File Details */}
        {selectedFile ? (
          <div className="p-3.5 space-y-4">
            <div>
              <span className="text-[10px] uppercase text-muted tracking-wider">File</span>
              <h4 className="text-xs font-bold text-foreground break-all select-all mt-0.5">
                {selectedFile.path}
              </h4>
              <p className="text-[11px] text-muted mt-0.5">folder: {selectedFile.folder}</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded border border-incoming/30 bg-incoming/5 p-2">
                <span className="text-incoming font-bold text-sm block">↓ {selectedFile.fanIn}</span>
                <span className="text-[10px] text-muted">Fan-in (Callers)</span>
              </div>
              <div className="rounded border border-outgoing/30 bg-outgoing/5 p-2">
                <span className="text-outgoing font-bold text-sm block">↑ {selectedFile.fanOut}</span>
                <span className="text-[10px] text-muted">Fan-out (Imports)</span>
              </div>
            </div>

            <div className="rounded bg-surface-raised p-2.5 text-[11px] space-y-1 border border-border">
              <div className="flex justify-between">
                <span className="text-muted">Lines:</span>
                <span className="text-foreground font-medium">{selectedFile.linesCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Extension:</span>
                <span className="text-foreground font-medium">{selectedFile.extension}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Hash:</span>
                <span className="text-muted font-mono">{selectedFile.contentHash.slice(0, 10)}…</span>
              </div>
            </div>

            {/* Incoming Callers */}
            <div>
              <span className="text-[10px] uppercase text-incoming font-semibold tracking-wider block mb-1">
                Incoming Callers ({fileDependencies.incoming.length})
              </span>
              {fileDependencies.incoming.length > 0 ? (
                <div className="space-y-1">
                  {fileDependencies.incoming.map((edge) => (
                    <div
                      key={edge.id}
                      onClick={() => setSelectedFilePath(edge.source)}
                      className="rounded border border-border bg-surface-raised/60 p-1.5 text-[11px] hover:border-incoming/50 cursor-pointer transition-colors"
                      title={edge.source}
                    >
                      <div className="truncate text-foreground font-medium">
                        {edge.source.split("/").pop()}
                      </div>
                      <div className="truncate text-[10px] text-muted">{edge.source}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-muted italic">No incoming callers inside repo</span>
              )}
            </div>

            {/* Outgoing Imports */}
            <div>
              <span className="text-[10px] uppercase text-outgoing font-semibold tracking-wider block mb-1">
                Outgoing Imports ({fileDependencies.outgoing.length})
              </span>
              {fileDependencies.outgoing.length > 0 ? (
                <div className="space-y-1">
                  {fileDependencies.outgoing.map((edge) => (
                    <div
                      key={edge.id}
                      onClick={() => edge.target && setSelectedFilePath(edge.target)}
                      className="rounded border border-border bg-surface-raised/60 p-1.5 text-[11px] hover:border-outgoing/50 cursor-pointer transition-colors"
                      title={edge.target || edge.specifier}
                    >
                      <div className="truncate text-foreground font-medium">
                        {edge.target ? edge.target.split("/").pop() : edge.specifier}
                      </div>
                      <div className="truncate text-[10px] text-muted">
                        {edge.target || edge.specifier}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-muted italic">No internal imports</span>
              )}
            </div>
          </div>
        ) : selectedNodeId ? (
          /* Selected Folder Node Details */
          <div className="p-3.5 space-y-4">
            <div>
              <span className="text-[10px] uppercase text-muted tracking-wider">Folder Node</span>
              <h4 className="text-xs font-bold text-foreground break-all select-all mt-0.5">
                {selectedNodeId}
              </h4>
              <p className="text-[11px] text-muted mt-0.5">{selectedNodeFiles.length} files contained</p>
            </div>

            {/* Files in this folded node */}
            <div>
              <span className="text-[10px] uppercase text-muted tracking-wider block mb-1.5">
                Contained Files
              </span>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {selectedNodeFiles.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => setSelectedFilePath(f.path)}
                    className="flex items-center justify-between rounded border border-border/80 bg-surface-raised/50 px-2 py-1.5 text-[11px] hover:border-accent hover:bg-surface-raised cursor-pointer transition-colors"
                  >
                    <span className="truncate pr-2 text-foreground" title={f.path}>
                      {f.path.split("/").pop()}
                    </span>
                    <span className="text-[10px] text-muted shrink-0">{f.linesCount}L</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Empty Initial State */
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-muted">
            <div className="h-8 w-8 rounded bg-surface-raised flex items-center justify-center border border-border mb-2.5">
              <span className="text-xs">⌕</span>
            </div>
            <span className="text-xs font-medium text-foreground">No selection</span>
            <p className="mt-1 text-[11px] text-muted leading-relaxed max-w-[200px]">
              Click a folder node or file row on the canvas to inspect its callers, imports, and blast radius.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}