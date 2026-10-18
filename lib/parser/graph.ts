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

export type WalkDirection = "upstream" | "downstream";

export interface WalkStep {
  path: string;
  depth: number;
}

/**
 * Pure function: transitive walk over the edge list with a direction and a depth limit.
 * - 'upstream': Blast radius (callers / dependents — who breaks if this changes)
 * - 'downstream': Dependency chain (dependencies — what this file needs)
 * Two levels deep by default.
 */
export function transitiveWalk(
  startPath: string,
  edges: ParsedEdge[],
  direction: WalkDirection,
  maxDepth = 2
): WalkStep[] {
  if (maxDepth < 1) return [];

  // Build adjacency list for internal resolved edges
  const adj = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!edge.resolved || !edge.target || edge.source === edge.target) continue;

    if (direction === "upstream") {
      // In reverse: edge.target -> edge.source
      if (!adj.has(edge.target)) adj.set(edge.target, new Set());
      adj.get(edge.target)!.add(edge.source);
    } else {
      // Forward: edge.source -> edge.target
      if (!adj.has(edge.source)) adj.set(edge.source, new Set());
      adj.get(edge.source)!.add(edge.target);
    }
  }

  const results: WalkStep[] = [];
  const visited = new Set<string>([startPath]);
  const queue: [string, number][] = [[startPath, 0]];

  while (queue.length > 0) {
    const [curr, depth] = queue.shift()!;
    if (depth >= maxDepth) continue;

    const neighbors = adj.get(curr);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        const nextDepth = depth + 1;
        results.push({ path: neighbor, depth: nextDepth });
        queue.push([neighbor, nextDepth]);
      }
    }
  }

  // Sort primarily by depth, then by path
  return results.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Pure function: iterative cycle detection using explicit DFS call stack.
 * Guarantee: never uses recursion, so large repositories will not blow the call stack.
 */
export function detectCycles(edges: ParsedEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const edge of edges) {
    if (!edge.resolved || !edge.target || edge.source === edge.target) continue;
    nodes.add(edge.source);
    nodes.add(edge.target);
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  const cycles: string[][] = [];
  const seenCycleKeys = new Set<string>();

  // Iterative DFS from each node in the graph
  for (const startNode of nodes) {
    const stack: { node: string; neighborIdx: number }[] = [{ node: startNode, neighborIdx: 0 }];
    const inStack = new Set<string>([startNode]);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const neighbors = adj.get(top.node) || [];

      if (top.neighborIdx < neighbors.length) {
        const nextNode = neighbors[top.neighborIdx];
        top.neighborIdx++;

        if (inStack.has(nextNode)) {
          // Found cycle! Extract loop from nextNode to top of stack
          const startIndex = stack.findIndex((frame) => frame.node === nextNode);
          if (startIndex !== -1) {
            const loopVertices = stack.slice(startIndex).map((f) => f.node);

            let minIdx = 0;
            for (let i = 1; i < loopVertices.length; i++) {
              if (loopVertices[i] < loopVertices[minIdx]) minIdx = i;
            }
            const canonical = [
              ...loopVertices.slice(minIdx),
              ...loopVertices.slice(0, minIdx),
              loopVertices[minIdx],
            ];
            const key = canonical.join(" -> ");

            if (!seenCycleKeys.has(key)) {
              seenCycleKeys.add(key);
              cycles.push(canonical);
            }
          }
        } else if (stack.length < 12) {
          // Push next frame (bounded depth per path to avoid exponential branches)
          inStack.add(nextNode);
          stack.push({ node: nextNode, neighborIdx: 0 });
        }
      } else {
        // Backtrack
        inStack.delete(top.node);
        stack.pop();
      }
    }
  }

  return cycles;
}

/**
 * Pure function: checks if a file is reached by the framework or runtime config.
 * Files nothing imports are not orphans if they are pages, routes, layouts, middleware or configs.
 */
export function isFrameworkOrConfigEntry(filePath: string): boolean {
  const p = filePath.toLowerCase();
  // Next.js App Router / Pages Router conventions
  if (
    p.includes("/page.") ||
    p.includes("/layout.") ||
    p.includes("/route.") ||
    p.includes("/loading.") ||
    p.includes("/error.") ||
    p.includes("/not-found.") ||
    p.includes("/template.") ||
    p.includes("/default.")
  ) {
    return true;
  }
  // Middleware / Proxy
  if (
    p === "proxy.ts" ||
    p === "middleware.ts" ||
    p.endsWith("/middleware.ts") ||
    p.endsWith("/proxy.ts")
  ) {
    return true;
  }
  // Root config files
  if (
    p.startsWith("next.config.") ||
    p.startsWith("vite.config.") ||
    p.startsWith("tailwind.config.") ||
    p.startsWith("postcss.config.") ||
    p.startsWith("eslint.config.") ||
    p.startsWith("tsconfig.")
  ) {
    return true;
  }
  // CLI / Script entry points
  if (p.startsWith("scripts/")) {
    return true;
  }

  return false;
}

export interface InsightCycle {
  cycle: string[];
  description: string;
}

export interface InsightItem {
  path: string;
  description: string;
  meta?: number | string;
}

export interface InsightsResult {
  unimported: InsightItem[];
  popular: InsightItem[];
  cycles: InsightCycle[];
  oversized: InsightItem[];
  totalCount: number;
}

/**
 * The 4 fixed string sentences for Phase 6 insights.
 * No model is involved in this phase at all.
 */
export const INSIGHT_SENTENCES = {
  unimported: "Nothing in the repository imports this file.",
  popular: "Imported by a high proportion of the codebase.",
  cycle: "Participates in a circular dependency cycle.",
  oversized: "Exceeds typical file length for this codebase.",
} as const;

/**
 * Pure function: computes the 4 kinds of insights.
 * Ordering: Files-nothing-imports leads the list, followed by popular, cycles, and oversized.
 */
export function computeInsights(files: ParsedFile[], edges: ParsedEdge[]): InsightsResult {
  // 1. Files nothing imports (excluding framework/config entries)
  const unimported: InsightItem[] = files
    .filter((f) => f.fanIn === 0 && !isFrameworkOrConfigEntry(f.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      description: INSIGHT_SENTENCES.unimported,
      meta: `${f.linesCount}L`,
    }));

  // 2. Files an unusual number of things import (popular modules, fan-in >= 4)
  const popular: InsightItem[] = files
    .filter((f) => f.fanIn >= 4)
    .sort((a, b) => b.fanIn - a.fanIn)
    .map((f) => ({
      path: f.path,
      description: INSIGHT_SENTENCES.popular,
      meta: `↓ ${f.fanIn} callers`,
    }));

  // 3. Circular dependency cycles
  const detectedCycles = detectCycles(edges);
  const cycles: InsightCycle[] = detectedCycles.map((c) => ({
    cycle: c,
    description: INSIGHT_SENTENCES.cycle,
  }));

  // 4. Files that are simply too long (>= 250 lines)
  const oversized: InsightItem[] = files
    .filter((f) => f.linesCount >= 250)
    .sort((a, b) => b.linesCount - a.linesCount)
    .map((f) => ({
      path: f.path,
      description: INSIGHT_SENTENCES.oversized,
      meta: `${f.linesCount} lines`,
    }));

  const totalCount = unimported.length + popular.length + cycles.length + oversized.length;

  return {
    unimported,
    popular,
    cycles,
    oversized,
    totalCount,
  };
}

/**
 * Classifies a file into a single category ID.
 */
/**
 * Classifies a file into a single category ID matching the framework taxonomy.
 */
export function getFileCategoryId(filePath: string): string {
  const p = filePath.toLowerCase().replace(/\\/g, "/");

  // Routable surfaces
  if (p.includes("/page.") || p.endsWith("page.tsx") || p.endsWith("page.ts")) {
    return "page_routes";
  }
  if (p.includes("/route.") || p.includes("/api/") || p.endsWith("route.ts") || p.endsWith("route.js")) {
    return "api_endpoints";
  }
  if (p.includes("action") || p.endsWith(".action.ts") || p.endsWith(".action.tsx")) {
    return "server_actions";
  }

  // Nest surfaces
  if (p.endsWith(".controller.ts") || p.endsWith(".controller.js")) {
    return "controllers";
  }
  if (p.endsWith(".service.ts") || p.endsWith(".service.js") || p.includes("/services/")) {
    return "services";
  }
  if (p.endsWith(".module.ts") || p.endsWith(".module.js")) {
    return "modules";
  }
  if (p.endsWith(".entity.ts") || p.endsWith(".entity.js")) {
    return "entities";
  }

  // Common concepts
  if (p.endsWith(".tsx") || p.endsWith(".jsx") || p.includes("/components/")) {
    return "components";
  }
  if (p.includes("index.") || p.includes("main.")) {
    return "entry_points";
  }
  if (p.includes("types.") || p.includes("schema.") || p.endsWith(".d.ts") || p.includes(".dto.")) {
    return "types";
  }

  return "internals";
}