/**
 * Prompt builders for Phase 10 AI operations.
 * Enforces strict formatting constraints and prevents hallucinated graph edges.
 */

export const ALLOWED_MODEL_ROLES = [
  "service",
  "repository",
  "model",
  "util",
  "config",
  "component",
  "hook",
] as const;

export type AllowedModelRole = (typeof ALLOWED_MODEL_ROLES)[number];

export interface FileNeighbourContext {
  path: string;
  linesCount: number;
  role?: string;
  imports: string[];
  importedBy: string[];
}

export interface FolderNeighbourContext {
  folderPath: string;
  files: Array<{ path: string; role?: string }>;
  externalInbound: Array<{ caller: string; target: string }>;
  externalOutbound: Array<{ source: string; dependency: string }>;
}

export function buildFileExplainPrompt(ctx: FileNeighbourContext): string {
  const importsText =
    ctx.imports.length > 0
      ? ctx.imports.map((p) => `- \`${p}\``).join("\n")
      : "(None - has no dependencies)";

  const callersText =
    ctx.importedBy.length > 0
      ? ctx.importedBy.map((p) => `- \`${p}\``).join("\n")
      : "(None - standalone entry or unreferenced)";

  return `You are an expert software architect inspecting a codebase.
Explain what the file \`${ctx.path}\` does in the context of its actual neighbours in the dependency graph.

FACTS ABOUT THIS FILE:
- Path: \`${ctx.path}\`
- Lines of code: ${ctx.linesCount}
${ctx.role ? `- Identified Role: **${ctx.role}**\n` : ""}
- Files it imports (${ctx.imports.length}):
${importsText}

- Files that import it (${ctx.importedBy.length}):
${callersText}

CONSTRAINTS (MANDATORY):
1. Never speculate or invent dependencies. Base your explanation strictly and only on the files listed above.
2. Formatting rules:
   - You may ONLY use: **bold**, bullet points (- item), and inline code (\`path\`).
   - NEVER use headings (#, ##, ###, etc.) because the UI panel is narrow.
   - Whenever mentioning any repository file or path, wrap it in backticks (e.g. \`${ctx.path}\`) so it becomes an interactive link.
3. Be concise and dense. Provide 1 to 2 focused paragraphs explaining what it does, how it relates to what it imports, and why its callers depend on it.`;
}

export function buildFolderExplainPrompt(ctx: FolderNeighbourContext): string {
  const filesList = ctx.files
    .slice(0, 40)
    .map((f) => `- \`${f.path}\`${f.role ? ` (**${f.role}**)` : ""}`)
    .join("\n");

  const inboundList =
    ctx.externalInbound.length > 0
      ? ctx.externalInbound
          .slice(0, 30)
          .map((e) => `- \`${e.caller}\` -> \`${e.target}\``)
          .join("\n")
      : "(No external files import this folder)";

  const outboundList =
    ctx.externalOutbound.length > 0
      ? ctx.externalOutbound
          .slice(0, 30)
          .map((e) => `- \`${e.source}\` -> \`${e.dependency}\``)
          .join("\n")
      : "(This folder does not import any external files)";

  return `You are an expert software architect inspecting a codebase.
Explain the folder \`${ctx.folderPath}\` as a whole.

FACTS ABOUT THIS FOLDER:
- Folder path: \`${ctx.folderPath}\`
- Total files inside: ${ctx.files.length}
- Files inside this folder:
${filesList}

- External callers (files outside this folder that import code inside it, count: ${ctx.externalInbound.length}):
${inboundList}

- External dependencies (code inside this folder importing files outside it, count: ${ctx.externalOutbound.length}):
${outboundList}

CONSTRAINTS (MANDATORY):
1. This explanation MUST be about the folder as a whole and why so much points at it or depends on it. Do NOT write a summary of just one file inside it.
2. Formatting rules:
   - You may ONLY use: **bold**, bullet points (- item), and inline code (\`path\`).
   - NEVER use headings (#, ##, ###, etc.).
   - Wrap all repository paths and files in backticks.
3. Keep it dense, developer-focused, and under 3 short paragraphs.`;
}

export function buildRoleClassificationPrompt(
  files: Array<{ path: string; imports: string[]; importedBy: string[] }>
): string {
  const fileSummaries = files.map((f) => ({
    path: f.path,
    imports: f.imports.slice(0, 10),
    importedBy: f.importedBy.slice(0, 10),
  }));

  return `Classify the architectural role of each unclassified file below.

Allowed roles (strictly choose from this list):
- "service" (business logic, external APIs)
- "repository" (data access, database queries)
- "model" (type definitions, schemas, data structures)
- "util" (pure helper functions, formatters, algorithms)
- "config" (configuration settings, environment variables, constants)
- "component" (UI presentation widgets)
- "hook" (reusable stateful logic or React hooks)

CRITICAL RULE:
You may NEVER assign structural or routable roles such as "page", "route", or "controller".

FILES TO CLASSIFY:
${JSON.stringify(fileSummaries, null, 2)}

Return ONLY valid JSON matching this schema:
[
  {
    "path": string,
    "role": "service" | "repository" | "model" | "util" | "config" | "component" | "hook",
    "confidence": number between 0.5 and 1.0
  }
]`;
}