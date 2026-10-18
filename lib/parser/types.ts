export type EdgeKind = "import" | "reexport" | "dynamic";

export interface ParsedFile {
  id: string;
  path: string;
  folder: string;
  extension: string;
  linesCount: number;
  contentHash: string;
  fanIn: number;
  fanOut: number;
}

export interface ParsedEdge {
  id: string;
  source: string;
  target: string | null;
  kind: EdgeKind;
  specifier: string;
  resolved: boolean;
  unresolvedReason?: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface ImportFailure {
  sourceFile: string;
  specifier: string;
  kind: EdgeKind;
  reason: string;
}

export interface ImportCoverage {
  totalImports: number;
  resolvedInternal: number;
  externalDependencies: number;
  builtins: number;
  deliberatelyExcluded: number;
  unresolved: number;
  failures: ImportFailure[];
}

export interface ParserStats {
  filesFound: number;
  filesParsed: number;
  filesSkipped: number;
  totalLines: number;
  distinctFolders: number;
  reexportsFound: number;
  reexportsResolved: number;
}

export interface ExtractedRoute {
  file: string;
  method: string;
  path: string;
}

export interface ExtractedRole {
  file: string;
  role: string;
  confidence: number;
  source: string;
}

export interface ParserResult {
  rootPath: string;
  framework?: string;
  frameworkName?: string;
  stats: ParserStats;
  files: ParsedFile[];
  edges: ParsedEdge[];
  roles?: ExtractedRole[];
  routes?: ExtractedRoute[];
  skippedFiles: SkippedFile[];
  coverage: ImportCoverage;
  folders: string[];
  timestamp: string;
}

export interface ParserOptions {
  /** Additional glob/folder exclusions beyond standard build/git dirs */
  extraExcludes?: string[];
  /** Optional override for tsconfig path */
  tsconfigPath?: string;
  /** Explicit adapter override, otherwise auto-detected */
  adapter?: import("./adapter").FrameworkAdapter;
}