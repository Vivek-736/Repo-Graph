import { ParsedFile, ParsedEdge } from "./types";

export interface FoldedDirectory {
  id: string; // The canonical directory path (e.g. "components/shell" or ".")
  label: string; // Shortest unique label
  dirPath: string;
  files: ParsedFile[];
  fanIn: number;
  fanOut: number;
  width: number;
  height: number;
}

/**
 * Computes the shortest label for each directory path that remains unique on screen.
 */
export function computeShortestUniqueLabels(dirPaths: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (dirPaths.length === 0) return result;

  // Split paths into segments from the right (e.g. "a/b/c" -> ["c", "b", "a"])
  const segmentsMap = new Map<string, string[]>();
  for (const d of dirPaths) {
    if (d === "." || d === "") {
      segmentsMap.set(d, ["root"]);
    } else {
      const parts = d.split("/").reverse();
      segmentsMap.set(d, parts);
    }
  }

  // Iteratively add parent segments until each label is unique among all paths
  let currentDepth = 1;
  const maxDepth = Math.max(...Array.from(segmentsMap.values()).map((s) => s.length));

  while (currentDepth <= maxDepth) {
    const candidateMap = new Map<string, string>();
    const frequency = new Map<string, number>();

    for (const [dir, parts] of segmentsMap.entries()) {
      const label = parts.slice(0, currentDepth).reverse().join("/");
      candidateMap.set(dir, label);
      frequency.set(label, (frequency.get(label) || 0) + 1);
    }

    // Check which directories have unique labels
    let allUnique = true;
    for (const [dir, label] of candidateMap.entries()) {
      if (frequency.get(label) === 1) {
        if (!result.has(dir)) {
          result.set(dir, label);
        }
      } else {
        allUnique = false;
      }
    }

    if (allUnique) break;
    currentDepth++;
  }

  // Fallback for any remaining: use full dir path or "root"
  for (const d of dirPaths) {
    if (!result.has(d)) {
      result.set(d, d === "." || d === "" ? "root" : d);
    }
  }

  return result;
}

/**
 * Gets the parent directory of a directory path.
 */
function getParentDir(dirPath: string): string {
  if (dirPath === "." || dirPath === "") return ".";
  const lastSlash = dirPath.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  return dirPath.slice(0, lastSlash);
}

/**
 * Computes depth of a directory path: "." is 0, "components" is 1, "components/shell" is 2.
 */
function getDirDepth(dirPath: string): number {
  if (dirPath === "." || dirPath === "") return 0;
  return dirPath.split("/").length;
}

/**
 * Deepest-first directory folding algorithm.
 * Starts with every directory as its own node.
 * Merges upward from deepest directory until under roughly two dozen nodes.
 * Guarantees every node holds > 1 file (unless total repo files <= 1).
 */
export function foldDirectories(
  files: ParsedFile[],
  edges: ParsedEdge[],
  targetMaxNodes: number = 24
): FoldedDirectory[] {
  if (files.length === 0) return [];

  // Group files by initial folder
  const initialMap = new Map<string, ParsedFile[]>();
  for (const file of files) {
    const folder = file.folder || ".";
    if (!initialMap.has(folder)) {
      initialMap.set(folder, []);
    }
    initialMap.get(folder)!.push(file);
  }

  // Auto-threshold loop: start at threshold = 2 (fewer than a couple of files)
  let threshold = 2;
  let finalNodeMap = new Map<string, ParsedFile[]>();

  while (true) {
    // Each pass is computed fresh from initialMap
    const current = new Map<string, ParsedFile[]>();
    for (const [k, v] of initialMap.entries()) {
      current.set(k, [...v]);
    }

    // Determine maximum depth across all current directories
    const getDepths = () => Array.from(current.keys()).map(getDirDepth);
    let maxDepth = Math.max(0, ...getDepths());

    // Process each depth level from maxDepth down to 1
    for (let depth = maxDepth; depth >= 1; depth--) {
      const dirsAtDepth = Array.from(current.keys())
        .filter((d) => d !== "." && getDirDepth(d) === depth)
        .sort((a, b) => a.localeCompare(b));

      for (const dir of dirsAtDepth) {
        const dirFiles = current.get(dir);
        if (!dirFiles) continue;

        if (dirFiles.length < threshold) {
          const parent = getParentDir(dir);
          if (!current.has(parent)) {
            current.set(parent, []);
          }
          current.get(parent)!.push(...dirFiles);
          current.delete(dir);
        }
      }
    }

    // After folding upward, ensure NO node holds <= 1 file (Acceptance Check 2)
    // If any non-root node holds <= 1 file, merge it into parent
    for (const [dir, dirFiles] of Array.from(current.entries())) {
      if (dir !== "." && dirFiles.length < 2) {
        const parent = getParentDir(dir);
        if (!current.has(parent)) {
          current.set(parent, []);
        }
        current.get(parent)!.push(...dirFiles);
        current.delete(dir);
      }
    }

    // If root holds <= 1 file and multiple nodes exist, merge root files into the largest node
    const activeNodes = Array.from(current.entries()).filter(([_, f]) => f.length > 0);
    if (activeNodes.length > 1) {
      const rootFiles = current.get(".");
      if (rootFiles && rootFiles.length < 2) {
        const otherNodes = activeNodes
          .filter(([k]) => k !== ".")
          .sort((a, b) => b[1].length - a[1].length);
        if (otherNodes.length > 0) {
          otherNodes[0][1].push(...rootFiles);
          current.delete(".");
        }
      }
    }

    const remainingActive = Array.from(current.entries()).filter(([_, f]) => f.length > 0);
    const activeCount = remainingActive.length;

    // Check if every node holds > 1 file
    const allHaveMultiple = remainingActive.every(([, f]) => f.length > 1 || files.length <= 1);

    if (activeCount <= targetMaxNodes && allHaveMultiple) {
      finalNodeMap = current;
      break;
    }

    if (threshold > files.length) {
      finalNodeMap = current;
      break;
    }

    threshold++;
  }

  // Filter out any empty directories
  const activeEntries = Array.from(finalNodeMap.entries()).filter(([_, f]) => f.length > 0);

  // Compute shortest unique labels
  const activeDirPaths = activeEntries.map(([dir]) => dir);
  const labels = computeShortestUniqueLabels(activeDirPaths);

  // Map each file path to its containing folded node id
  const fileToNodeId = new Map<string, string>();
  for (const [dir, dirFiles] of activeEntries) {
    for (const f of dirFiles) {
      fileToNodeId.set(f.path, dir);
    }
  }

  // Compute fan-in and fan-out per folded node (inter-node edges)
  const nodeFanIn = new Map<string, Set<string>>();
  const nodeFanOut = new Map<string, Set<string>>();
  for (const dir of activeDirPaths) {
    nodeFanIn.set(dir, new Set());
    nodeFanOut.set(dir, new Set());
  }

  for (const edge of edges) {
    if (!edge.resolved || !edge.target) continue;
    const srcNode = fileToNodeId.get(edge.source);
    const tgtNode = fileToNodeId.get(edge.target);

    if (srcNode && tgtNode && srcNode !== tgtNode) {
      nodeFanOut.get(srcNode)?.add(edge.source);
      nodeFanIn.get(tgtNode)?.add(edge.source);
    }
  }

  // Assemble FoldedDirectory objects with fan-in driven height
  const result: FoldedDirectory[] = [];

  for (const [dir, dirFiles] of activeEntries) {
    const label = labels.get(dir) || dir;
    const fanInCount = nodeFanIn.get(dir)?.size || 0;
    const fanOutCount = nodeFanOut.get(dir)?.size || 0;

    // Width comes strictly from label length (so a long name doesn't read as important)
    const width = Math.max(130, Math.min(220, label.length * 8 + 48));

    // Height strictly carries fan-in (how many things depend on it)
    // Base height 48px; increases proportionally with fan-in
    const height = Math.min(110, Math.max(48, 48 + fanInCount * 8));

    result.push({
      id: dir,
      label,
      dirPath: dir,
      files: dirFiles,
      fanIn: fanInCount,
      fanOut: fanOutCount,
      width,
      height,
    });
  }

  // Sort deterministically by id
  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}