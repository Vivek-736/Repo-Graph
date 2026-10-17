import * as path from "node:path";
import * as fs from "node:fs";
import { Project } from "ts-morph";
import {
  ParserResult,
  ParserOptions,
  ParsedFile,
  ParsedEdge,
  ImportCoverage,
  ImportFailure,
} from "./types";
import { FallbackAdapter, FrameworkAdapter } from "./adapter";
import { walkRepository } from "./walker";
import { extractImports } from "./extractor";
import {
  loadPathAliases,
  loadPackageDependencies,
  resolveSpecifier,
} from "./resolver";
import { deduplicateEdges, computeFanInOut, extractDistinctFolders } from "./graph";

export * from "./types";
export * from "./adapter";
export * from "./walker";
export * from "./extractor";
export * from "./resolver";
export * from "./graph";

/**
 * Parses a repository directory on disk and extracts its files, edges, and import coverage.
 * Pure standalone engine: imports no web framework, UI library, or database client.
 */
export function parseRepository(directoryPath: string, options: ParserOptions = {}): ParserResult {
  const rootPath = path.resolve(directoryPath);

  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    throw new Error(`[RepoGraph Parser] Target path does not exist or is not a directory: ${rootPath}`);
  }

  // 1. Walk directory structurally
  const { parseableFiles, skippedFiles, totalFilesFound } = walkRepository(
    rootPath,
    options.extraExcludes || []
  );

  const knownFiles = new Set(parseableFiles.map((f) => f.relativePath));
  const allRepoFiles = new Set([
    ...parseableFiles.map((f) => f.relativePath),
    ...skippedFiles.map((f) => f.path),
  ]);

  // 2. Load path aliases and package dependencies
  const aliases = loadPathAliases(rootPath, options.tsconfigPath);
  const packageDeps = loadPackageDependencies(rootPath);
  const adapter: FrameworkAdapter = new FallbackAdapter();

  // 3. Initialize in-memory ts-morph project
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      jsx: 1, // Preserve
    },
  });

  const rawEdges: ParsedEdge[] = [];
  const failures: ImportFailure[] = [];

  let resolvedInternal = 0;
  let externalDependencies = 0;
  let builtins = 0;
  let deliberatelyExcluded = 0;
  let unresolvedCount = 0;
  let totalImports = 0;
  let reexportsFound = 0;
  let reexportsResolved = 0;

  // 4. Parse AST for each parseable file
  for (const file of parseableFiles) {
    const sourceFile = project.createSourceFile(file.relativePath, file.content, { overwrite: true });
    const extracted = extractImports(sourceFile);

    for (const item of extracted) {
      totalImports++;

      if (item.kind === "reexport") {
        reexportsFound++;
      }

      const resolution = resolveSpecifier(
        item.specifier,
        file.relativePath,
        rootPath,
        knownFiles,
        allRepoFiles,
        aliases,
        packageDeps,
        adapter
      );

      if (resolution.resolved) {
        resolvedInternal++;
        if (item.kind === "reexport") {
          reexportsResolved++;
        }
      } else {
        if (resolution.category === "builtin") {
          builtins++;
        } else if (resolution.category === "external") {
          externalDependencies++;
        } else if (resolution.category === "asset") {
          deliberatelyExcluded++;
        } else {
          unresolvedCount++;
          failures.push({
            sourceFile: file.relativePath,
            specifier: item.specifier,
            kind: item.kind,
            reason: resolution.reason || "unresolved_import",
          });
        }
      }

      rawEdges.push({
        id: `${file.relativePath}:${item.line}:${item.kind}:${item.specifier}`,
        source: file.relativePath,
        target: resolution.target,
        kind: item.kind,
        specifier: item.specifier,
        resolved: resolution.resolved,
        unresolvedReason: resolution.reason,
      });
    }
  }

  // 5. Pure graph calculations
  const deduplicatedEdges = deduplicateEdges(rawEdges);

  const initialFiles: ParsedFile[] = parseableFiles.map((f) => ({
    id: f.contentHash.slice(0, 16),
    path: f.relativePath,
    folder: f.folder,
    extension: f.extension,
    linesCount: f.linesCount,
    contentHash: f.contentHash,
    fanIn: 0,
    fanOut: 0,
  }));

  const finalFiles = computeFanInOut(initialFiles, deduplicatedEdges);
  const folders = extractDistinctFolders(finalFiles);
  const totalLines = finalFiles.reduce((acc, f) => acc + f.linesCount, 0);

  const coverage: ImportCoverage = {
    totalImports,
    resolvedInternal,
    externalDependencies,
    builtins,
    deliberatelyExcluded,
    unresolved: unresolvedCount,
    failures,
  };

  return {
    rootPath: rootPath.replace(/\\/g, "/"),
    stats: {
      filesFound: totalFilesFound,
      filesParsed: finalFiles.length,
      filesSkipped: skippedFiles.length,
      totalLines,
      distinctFolders: folders.length,
      reexportsFound,
      reexportsResolved,
    },
    files: finalFiles,
    edges: deduplicatedEdges,
    skippedFiles,
    coverage,
    folders,
    timestamp: new Date().toISOString(),
  };
}