"use client";

import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { ParsedFile } from "@/lib/parser/types";

export interface FolderNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  dirPath: string;
  files: ParsedFile[];
  fanIn: number;
  fanOut: number;
  isOpen: boolean;
  isSelected: boolean;
  isConnected: boolean;
  isDimmed: boolean;
  connectionType: "incoming" | "outgoing" | "both" | null;
  selectedFilePath: string | null;
  incomingFilePaths: string[];
  outgoingFilePaths: string[];
  onToggleOpen: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectFile: (filePath: string) => void;
}

export type FolderNodeType = Node<FolderNodeData, "folderNode">;

const MAX_VISIBLE_ROWS = 8;

export const FolderNode = memo(function FolderNode({ data }: NodeProps<FolderNodeType>) {
  const {
    id,
    label,
    dirPath,
    files,
    fanIn,
    fanOut,
    isOpen,
    isSelected,
    isConnected,
    isDimmed,
    connectionType,
    selectedFilePath,
    incomingFilePaths = [],
    outgoingFilePaths = [],
    onToggleOpen,
    onSelectNode,
    onSelectFile,
  } = data;

  const visibleFiles = files.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = files.length - visibleFiles.length;

  const incomingSet = new Set(incomingFilePaths);
  const outgoingSet = new Set(outgoingFilePaths);

  // Border and ring styling based on selection & connection
  let borderStyle = "border-border hover:border-muted/50";
  if (isSelected) {
    borderStyle = "border-accent ring-2 ring-accent shadow-md shadow-accent/20";
  } else if (isConnected) {
    if (connectionType === "incoming") {
      borderStyle = "border-incoming ring-1 ring-incoming/50 shadow-sm shadow-incoming/10";
    } else if (connectionType === "outgoing") {
      borderStyle = "border-outgoing ring-1 ring-outgoing/50 shadow-sm shadow-outgoing/10";
    } else {
      borderStyle = "border-foreground/60 ring-1 ring-foreground/30";
    }
  }

  // -------------------------------------------------------------
  // OPEN STATE: Bordered panel with header and file rows
  // -------------------------------------------------------------
  if (isOpen) {
    return (
      <div
        className={`w-64 rounded-md border bg-surface/95 shadow-md font-mono text-xs transition-all duration-200 backdrop-blur-xs select-none ${borderStyle} ${
          isDimmed ? "opacity-15 pointer-events-none filter grayscale" : "opacity-100"
        }`}
      >
        {/* Connection handles for the whole panel if target/source is generic */}
        <Handle
          type="target"
          position={Position.Left}
          id="panel-target"
          className="w-2! h-2! bg-accent! border-surface! top-5! -ml-1 opacity-60"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="panel-source"
          className="w-2! h-2! bg-accent! border-surface! top-5! -mr-1 opacity-60"
        />

        {/* Clickable Header: closes panel back to folded node */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleOpen(id);
          }}
          className="flex items-center justify-between border-b border-border bg-surface-raised/80 px-2.5 py-2 cursor-pointer hover:bg-surface-raised transition-colors group"
          title={`Click to collapse ${dirPath}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-muted group-hover:text-foreground text-[11px]">▼</span>
            <span className="font-bold text-foreground truncate" title={dirPath}>
              {label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="rounded bg-surface px-1.5 py-0.2 text-[10px] text-muted border border-border">
              {files.length}
            </span>
            {fanIn > 0 && (
              <span className="rounded bg-incoming/10 px-1 py-0.2 text-[9px] text-incoming border border-incoming/30 font-medium" title="Fan-in">
                ↓{fanIn}
              </span>
            )}
            {fanOut > 0 && (
              <span className="rounded bg-outgoing/10 px-1 py-0.2 text-[9px] text-outgoing border border-outgoing/30 font-medium" title="Fan-out">
                ↑{fanOut}
              </span>
            )}
          </div>
        </div>

        {/* File Rows List */}
        <div className="p-1.5 space-y-0.5">
          {visibleFiles.map((file) => {
            const fileName = file.path.split("/").pop() || file.path;
            const isFileSelected = selectedFilePath === file.path;
            const isCaller = incomingSet.has(file.path);
            const isDependency = outgoingSet.has(file.path);
            const isRowDimmed =
              selectedFilePath !== null && !isFileSelected && !isCaller && !isDependency;

            let rowStyle = "text-foreground hover:bg-surface-raised/70 border border-transparent";
            if (isFileSelected) {
              rowStyle = "bg-accent/20 text-accent font-bold border border-accent/60 shadow-xs";
            } else if (isCaller) {
              rowStyle = "bg-incoming/15 text-incoming font-medium border border-incoming/40";
            } else if (isDependency) {
              rowStyle = "bg-outgoing/15 text-outgoing font-medium border border-outgoing/40";
            } else if (isRowDimmed) {
              rowStyle = "text-muted/40 border border-transparent";
            }

            return (
              <div
                key={file.path}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFile(file.path);
                }}
                className={`relative flex items-center justify-between rounded px-2 py-1 text-[11px] cursor-pointer transition-all duration-150 ${rowStyle}`}
              >
                {/* Micro Handle on each row for precise edge connections */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`row-target-${file.path}`}
                  className="w-1.5! h-1.5! bg-incoming! border-surface! -ml-1.5 opacity-80"
                />

                <span className="truncate pr-2" title={file.path}>
                  {fileName}
                </span>

                <div className="flex items-center gap-1.5 text-[9px] shrink-0">
                  {isCaller && <span className="text-incoming font-bold">caller</span>}
                  {isDependency && <span className="text-outgoing font-bold">import</span>}
                  {!isCaller && !isDependency && (
                    <>
                      {file.fanIn > 0 && <span className="text-incoming">↓{file.fanIn}</span>}
                      <span className="text-muted">{file.linesCount}L</span>
                    </>
                  )}
                </div>

                <Handle
                  type="source"
                  position={Position.Right}
                  id={`row-source-${file.path}`}
                  className="w-1.5! h-1.5! bg-outgoing! border-surface! -mr-1.5 opacity-80"
                />
              </div>
            );
          })}

          {/* More files indicator */}
          {hiddenCount > 0 && (
            <div className="px-2 py-1 text-[10px] text-center text-muted border-t border-border/40 mt-1">
              +{hiddenCount} more files
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // FOLDED STATE: Node whose height visually carries fan-in
  // -------------------------------------------------------------
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelectNode(id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onToggleOpen(id);
      }}
      className={`relative flex flex-col justify-center rounded-md border bg-surface/95 px-3 py-1.5 shadow-xs font-mono text-xs transition-all duration-200 backdrop-blur-xs select-none cursor-pointer ${borderStyle} ${
        isDimmed ? "opacity-15 pointer-events-none filter grayscale" : "opacity-100"
      }`}
      style={{
        width: `${data.width}px`,
        height: `${data.height}px`,
      }}
      title={`Click to select, double-click to open ${dirPath} (${files.length} files, fan-in: ${fanIn})`}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="node-target"
        className="w-2! h-2! bg-accent! border-surface! -ml-1 opacity-80"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="node-source"
        className="w-2! h-2! bg-accent! border-surface! -mr-1 opacity-80"
      />

      {/* Main label & open button */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 truncate">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleOpen(id);
            }}
            className="text-[10px] text-muted hover:text-foreground cursor-pointer p-0.5 rounded hover:bg-border/40"
            title="Expand into panel"
          >
            ▶
          </button>
          <span className="font-bold text-foreground truncate" title={dirPath}>
            {label}
          </span>
        </div>

        <span className="rounded bg-surface-raised px-1.5 py-0.2 text-[10px] text-muted border border-border shrink-0">
          {files.length}
        </span>
      </div>

      {/* Metrics Row (Fan-in visually explains height) */}
      <div className="flex items-center justify-between text-[10px] text-muted mt-1 pt-1 border-t border-border/40">
        <div className="flex items-center gap-2">
          {fanIn > 0 ? (
            <span className="text-incoming font-medium" title={`Fan-in: ${fanIn} callers depend on this folder`}>
              ↓ {fanIn}
            </span>
          ) : (
            <span className="opacity-50">↓ 0</span>
          )}
          {fanOut > 0 ? (
            <span className="text-outgoing font-medium" title={`Fan-out: imports ${fanOut} external modules`}>
              ↑ {fanOut}
            </span>
          ) : (
            <span className="opacity-50">↑ 0</span>
          )}
        </div>

        {isConnected && (
          <span className={`text-[9px] font-bold ${connectionType === "incoming" ? "text-incoming" : "text-outgoing"}`}>
            {connectionType === "incoming" ? "caller" : "import"}
          </span>
        )}

        {!isConnected && (
          <span className="text-[9px] opacity-60">
            {files.reduce((acc, f) => acc + f.linesCount, 0)}L
          </span>
        )}
      </div>
    </div>
  );
});