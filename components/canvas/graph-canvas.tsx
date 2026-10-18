"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Edge as FlowEdge,
  Node as FlowNode,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { ParsedFile, ParsedEdge } from "@/lib/parser/types";
import { foldDirectories, FoldedDirectory } from "@/lib/parser/folding";
import { getFileCategoryId } from "@/lib/parser/graph";
import { FolderNode, FolderNodeData } from "./folder-node";

const nodeTypes = {
  folderNode: FolderNode,
};

interface GraphCanvasProps {
  files: ParsedFile[];
  edges: ParsedEdge[];
  selectedNodeId: string | null;
  selectedFilePath: string | null;
  hoveredTarget?: string | null;
  activeCategoryId?: string | null;
  walkedFilePaths?: string[];
  walkDirection?: "upstream" | "downstream" | null;
  onSelectNode: (nodeId: string | null) => void;
  onSelectFile: (filePath: string | null) => void;
  onHoverTarget?: (target: string | null) => void;
}

const MAX_VISIBLE_ROWS = 8;

/**
 * Calculates deterministic graph layout using dagre.
 */
function layoutGraph(
  foldedNodes: FoldedDirectory[],
  edges: ParsedEdge[],
  openNodeIds: Set<string>,
  fileToNodeId: Map<string, string>
) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    align: "UL",
    nodesep: 60,
    ranksep: 110,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // 1. Add nodes with their actual dimensions
  for (const node of foldedNodes) {
    const isOpen = openNodeIds.has(node.id);
    let width = node.width;
    let height = node.height;

    if (isOpen) {
      width = 256; // w-64
      const visibleCount = Math.min(node.files.length, MAX_VISIBLE_ROWS);
      const hasOverflow = node.files.length > MAX_VISIBLE_ROWS;
      height = 36 + visibleCount * 26 + (hasOverflow ? 24 : 0) + 12;
    }

    g.setNode(node.id, { width, height });
  }

  // 2. Add inter-node edges
  const seenInterEdges = new Set<string>();
  for (const edge of edges) {
    if (!edge.resolved || !edge.target) continue;
    const srcNode = fileToNodeId.get(edge.source);
    const tgtNode = fileToNodeId.get(edge.target);

    if (srcNode && tgtNode && srcNode !== tgtNode) {
      const key = `${srcNode}->${tgtNode}`;
      if (!seenInterEdges.has(key)) {
        seenInterEdges.add(key);
        g.setEdge(srcNode, tgtNode);
      }
    }
  }

  // 3. Compute layout
  dagre.layout(g);

  // 4. Return computed positions
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of foldedNodes) {
    const pos = g.node(node.id);
    if (pos) {
      positions.set(node.id, {
        x: pos.x - pos.width / 2,
        y: pos.y - pos.height / 2,
      });
    } else {
      positions.set(node.id, { x: 0, y: 0 });
    }
  }

  return positions;
}

function InnerGraphCanvas({
  files,
  edges,
  selectedNodeId,
  selectedFilePath,
  hoveredTarget = null,
  activeCategoryId = null,
  walkedFilePaths = [],
  walkDirection = null,
  onSelectNode,
  onSelectFile,
  onHoverTarget = () => {},
}: GraphCanvasProps) {
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(new Set());
  const { fitView, getZoom } = useReactFlow();
  const isFirstRender = useRef(true);

  // 1. Compute folded directories
  const foldedDirs = useMemo(() => foldDirectories(files, edges), [files, edges]);

  // 2. Map files to node IDs
  const fileToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of foldedDirs) {
      for (const f of node.files) {
        map.set(f.path, node.id);
      }
    }
    return map;
  }, [foldedDirs]);

  // Toggle open panel state
  const handleToggleOpen = useCallback((nodeId: string) => {
    setOpenNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Compute deterministic layout
  const positions = useMemo(
    () => layoutGraph(foldedDirs, edges, openNodeIds, fileToNodeId),
    [foldedDirs, edges, openNodeIds, fileToNodeId]
  );

  // Identify highlighted connections for selection
  const highlightedConnections = useMemo(() => {
    const incomingFilePaths = new Set<string>();
    const outgoingFilePaths = new Set<string>();
    const incomingNodeIds = new Set<string>();
    const outgoingNodeIds = new Set<string>();
    const connectedNodeIds = new Set<string>();

    if (selectedFilePath) {
      const selfNode = fileToNodeId.get(selectedFilePath);
      if (selfNode) connectedNodeIds.add(selfNode);

      for (const edge of edges) {
        if (!edge.resolved || !edge.target) continue;
        if (edge.target === selectedFilePath) {
          incomingFilePaths.add(edge.source);
          const srcNode = fileToNodeId.get(edge.source);
          if (srcNode) {
            incomingNodeIds.add(srcNode);
            connectedNodeIds.add(srcNode);
          }
        }
        if (edge.source === selectedFilePath) {
          outgoingFilePaths.add(edge.target);
          const tgtNode = fileToNodeId.get(edge.target);
          if (tgtNode) {
            outgoingNodeIds.add(tgtNode);
            connectedNodeIds.add(tgtNode);
          }
        }
      }
    } else if (selectedNodeId) {
      connectedNodeIds.add(selectedNodeId);

      for (const edge of edges) {
        if (!edge.resolved || !edge.target) continue;
        const srcNode = fileToNodeId.get(edge.source);
        const tgtNode = fileToNodeId.get(edge.target);

        if (tgtNode === selectedNodeId && srcNode !== selectedNodeId) {
          incomingFilePaths.add(edge.source);
          if (srcNode) {
            incomingNodeIds.add(srcNode);
            connectedNodeIds.add(srcNode);
          }
        }
        if (srcNode === selectedNodeId && tgtNode !== selectedNodeId) {
          outgoingFilePaths.add(edge.target);
          if (tgtNode) {
            outgoingNodeIds.add(tgtNode);
            connectedNodeIds.add(tgtNode);
          }
        }
      }
    }

    return {
      incomingFilePaths: Array.from(incomingFilePaths),
      outgoingFilePaths: Array.from(outgoingFilePaths),
      incomingNodeIds,
      outgoingNodeIds,
      connectedNodeIds,
    };
  }, [selectedFilePath, selectedNodeId, edges, fileToNodeId]);

  const hasSelection = Boolean(selectedFilePath || selectedNodeId);
  const walkedSet = useMemo(() => new Set(walkedFilePaths), [walkedFilePaths]);

  // Build React Flow Nodes
  const flowNodes: FlowNode<FolderNodeData>[] = useMemo(() => {
    return foldedDirs.map((node) => {
      const pos = positions.get(node.id) || { x: 0, y: 0 };
      const isOpen = openNodeIds.has(node.id);
      const isSelected =
        selectedNodeId === node.id ||
        (selectedFilePath !== null && fileToNodeId.get(selectedFilePath) === node.id);
      const isConnected =
        hasSelection && !isSelected && highlightedConnections.connectedNodeIds.has(node.id);

      const matchedCount = activeCategoryId
        ? node.files.filter((f) => getFileCategoryId(f.path) === activeCategoryId).length
        : node.files.length;
      const hasCategoryMatch = !activeCategoryId || matchedCount > 0;
      const isWalkedNode = Boolean(walkedSet.size > 0 && node.files.some((f) => walkedSet.has(f.path)));

      // Dimming logic:
      // When a category is active: dim nodes with 0 matching files, but keep them on screen.
      // When selection is active: dim unselected, unconnected nodes.
      const isDimmed =
        (hasSelection && !isSelected && !isConnected && !isWalkedNode) ||
        (Boolean(activeCategoryId) && !hasCategoryMatch);

      let connectionType: "incoming" | "outgoing" | "both" | null = null;
      if (isConnected || isWalkedNode) {
        if (isWalkedNode) {
          connectionType = walkDirection === "upstream" ? "incoming" : "outgoing";
        } else {
          const isInc = highlightedConnections.incomingNodeIds.has(node.id);
          const isOut = highlightedConnections.outgoingNodeIds.has(node.id);
          if (isInc && isOut) connectionType = "both";
          else if (isInc) connectionType = "incoming";
          else if (isOut) connectionType = "outgoing";
        }
      }

      const isNodeHovered = hoveredTarget === node.id;
      const hoveredFilePath =
        hoveredTarget && files.some((f) => f.path === hoveredTarget) ? hoveredTarget : null;

      return {
        id: node.id,
        type: "folderNode",
        position: pos,
        data: {
          id: node.id,
          label: node.label,
          dirPath: node.dirPath,
          files: node.files,
          fanIn: node.fanIn,
          fanOut: node.fanOut,
          width: node.width,
          height: node.height,
          isOpen,
          isSelected,
          isConnected: isConnected || isWalkedNode,
          isDimmed,
          connectionType,
          selectedFilePath,
          incomingFilePaths: highlightedConnections.incomingFilePaths,
          outgoingFilePaths: highlightedConnections.outgoingFilePaths,
          isHovered: isNodeHovered,
          hoveredFilePath,
          activeCategoryId,
          categoryMatchCount: activeCategoryId ? matchedCount : undefined,
          walkedFilePaths,
          walkDirection,
          onToggleOpen: handleToggleOpen,
          onSelectNode,
          onSelectFile,
          onHoverNode: onHoverTarget,
          onHoverFile: onHoverTarget,
        },
      };
    });
  }, [
    foldedDirs,
    positions,
    openNodeIds,
    selectedNodeId,
    selectedFilePath,
    hasSelection,
    highlightedConnections,
    hoveredTarget,
    activeCategoryId,
    walkedSet,
    walkedFilePaths,
    walkDirection,
    files,
    fileToNodeId,
    handleToggleOpen,
    onSelectNode,
    onSelectFile,
    onHoverTarget,
  ]);

  // Build React Flow Edges (connecting either to rows or to node bodies)
  const flowEdges: FlowEdge[] = useMemo(() => {
    // Map edges to grouped connection keys to handle multiple edges cleanly
    interface EdgeGroup {
      source: string;
      target: string;
      sourceHandle: string;
      targetHandle: string;
      hasIncomingHighlight: boolean;
      hasOutgoingHighlight: boolean;
      hasHoverHighlight: boolean;
    }

    const groupMap = new Map<string, EdgeGroup>();

    for (const edge of edges) {
      if (!edge.resolved || !edge.target) continue;
      const srcNode = fileToNodeId.get(edge.source);
      const tgtNode = fileToNodeId.get(edge.target);

      if (!srcNode || !tgtNode || srcNode === tgtNode) continue;

      const srcIsOpen = openNodeIds.has(srcNode);
      const tgtIsOpen = openNodeIds.has(tgtNode);

      const srcFiles = foldedDirs.find((n) => n.id === srcNode)?.files || [];
      const tgtFiles = foldedDirs.find((n) => n.id === tgtNode)?.files || [];

      const srcVisible = srcFiles.slice(0, MAX_VISIBLE_ROWS).some((f) => f.path === edge.source);
      const tgtVisible = tgtFiles.slice(0, MAX_VISIBLE_ROWS).some((f) => f.path === edge.target);

      const sourceHandle = srcIsOpen
        ? srcVisible
          ? `row-source-${edge.source}`
          : "panel-source"
        : "node-source";
      const targetHandle = tgtIsOpen
        ? tgtVisible
          ? `row-target-${edge.target}`
          : "panel-target"
        : "node-target";

      const key = `${srcNode}:${sourceHandle}->${tgtNode}:${targetHandle}`;

      // Check whether this edge matches selection
      let isIncoming = false;
      let isOutgoing = false;

      if (selectedFilePath) {
        if (edge.target === selectedFilePath) isIncoming = true;
        if (edge.source === selectedFilePath) isOutgoing = true;
      } else if (selectedNodeId) {
        if (tgtNode === selectedNodeId && srcNode !== selectedNodeId) isIncoming = true;
        if (srcNode === selectedNodeId && tgtNode !== selectedNodeId) isOutgoing = true;
      }

      const isHoverMatch = Boolean(
        hoveredTarget &&
          (edge.source === hoveredTarget ||
            edge.target === hoveredTarget ||
            srcNode === hoveredTarget ||
            tgtNode === hoveredTarget)
      );

      const isWalkMatch = Boolean(
        walkedSet.size > 0 &&
          (walkedSet.has(edge.source) || (edge.target && walkedSet.has(edge.target)))
      );

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          source: srcNode,
          target: tgtNode,
          sourceHandle,
          targetHandle,
          hasIncomingHighlight: isIncoming,
          hasOutgoingHighlight: isOutgoing,
          hasHoverHighlight: isHoverMatch || isWalkMatch,
        });
      } else {
        const existing = groupMap.get(key)!;
        if (isIncoming) existing.hasIncomingHighlight = true;
        if (isOutgoing) existing.hasOutgoingHighlight = true;
        if (isHoverMatch || isWalkMatch) existing.hasHoverHighlight = true;
      }
    }

    const list: FlowEdge[] = [];

    for (const [key, group] of groupMap.entries()) {
      const isIncoming = group.hasIncomingHighlight;
      const isOutgoing = group.hasOutgoingHighlight;
      const isHover = group.hasHoverHighlight;
      const isDimmed = (hasSelection || Boolean(activeCategoryId) || walkedSet.size > 0) && !isIncoming && !isOutgoing && !isHover;

      let stroke = "rgba(100, 116, 139, 0.45)";
      let strokeWidth = 1.25;
      let zIndex = 5;

      if (isHover) {
        stroke = walkDirection === "upstream" ? "#10b981" : walkDirection === "downstream" ? "#f59e0b" : (isIncoming ? "#10b981" : isOutgoing ? "#f59e0b" : "#38bdf8");
        strokeWidth = 3.5;
        zIndex = 50;
      } else if (isIncoming) {
        stroke = "#10b981"; // Incoming emerald
        strokeWidth = 2.5;
        zIndex = 30;
      } else if (isOutgoing) {
        stroke = "#f59e0b"; // Outgoing amber
        strokeWidth = 2.5;
        zIndex = 30;
      } else if (isDimmed) {
        stroke = "rgba(100, 116, 139, 0.05)";
        strokeWidth = 0.75;
        zIndex = 1;
      }

      list.push({
        id: key,
        source: group.source,
        target: group.target,
        sourceHandle: group.sourceHandle,
        targetHandle: group.targetHandle,
        type: "default",
        zIndex,
        animated: isIncoming || isOutgoing || isHover,
        style: {
          stroke,
          strokeWidth,
          opacity: isDimmed ? 0.1 : 1,
          transition: "stroke 0.2s, stroke-width 0.2s, opacity 0.2s",
        },
      });
    }

    return list;
  }, [
    edges,
    fileToNodeId,
    openNodeIds,
    selectedFilePath,
    selectedNodeId,
    hasSelection,
    hoveredTarget,
    activeCategoryId,
    walkedSet,
    walkDirection,
    foldedDirs,
  ]);

  // Refitting on open: ONLY EVER ZOOM OUT, NEVER IN
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      fitView({ padding: 0.2, duration: 400 });
      return;
    }

    const currentZoom = getZoom();
    // Setting maxZoom: currentZoom ensures we NEVER zoom in on open, only zoom out if needed
    fitView({
      padding: 0.2,
      duration: 350,
      maxZoom: currentZoom,
    });
  }, [openNodeIds, fitView, getZoom]);

  return (
    <div
      className="h-full w-full relative"
      onClick={() => {
        // Deselect when clicking canvas background
        onSelectNode(null);
        onSelectFile(null);
      }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        fitView
      >
        <Background color="var(--border)" gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}