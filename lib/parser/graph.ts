import { ParsedFile, ParsedEdge } from "./types";

/**
 * Pure function: removes duplicate edges (matching source, target, kind, specifier).
 */
export function deduplicateEdges(edges: ParsedEdge[]): ParsedEdge[] {
  const seen = new Set<string>();
  const uniqueEdges: ParsedEdge[] = [];

  for (const edge of edges) {
    const key = `${edge.source} -> ${edge.target || "null"} [${edge.kind}] (${edge.specifier})`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEdges.push(edge);
    }
  }

  return uniqueEdges;
}

/**
 * Pure function: computes fan-in and fan-out for every file based on internal resolved edges.
 * Fan-in: number of other files in the repository that import this file.
 * Fan-out: number of other files in the repository that this file imports.
 */
export function computeFanInOut(files: ParsedFile[], edges: ParsedEdge[]): ParsedFile[] {
  const incomingMap = new Map<string, Set<string>>();
  const outgoingMap = new Map<string, Set<string>>();

  for (const file of files) {
    incomingMap.set(file.path, new Set());
    outgoingMap.set(file.path, new Set());
  }

  for (const edge of edges) {
    // Only internal resolved edges contribute to graph connectivity
    if (edge.resolved && edge.target && edge.target !== edge.source) {
      if (incomingMap.has(edge.target)) {
        incomingMap.get(edge.target)!.add(edge.source);
      }
      if (outgoingMap.has(edge.source)) {
        outgoingMap.get(edge.source)!.add(edge.target);
      }
    }
  }

  return files.map((file) => ({
    ...file,
    fanIn: incomingMap.get(file.path)?.size ?? 0,
    fanOut: outgoingMap.get(file.path)?.size ?? 0,
  }));
}

/**
 * Pure function: collects distinct sorted folders from the parsed file list.
 */
export function extractDistinctFolders(files: ParsedFile[]): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    folders.add(file.folder);
  }
  return Array.from(folders).sort();
}