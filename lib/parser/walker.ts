import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { SkippedFile } from "./types";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
  ".gemini",
  ".temp",
  "coverage",
]);

const PARSEABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

export interface WalkedFiles {
  parseableFiles: Array<{
    absolutePath: string;
    relativePath: string;
    folder: string;
    extension: string;
    linesCount: number;
    contentHash: string;
    content: string;
  }>;
  skippedFiles: SkippedFile[];
  totalFilesFound: number;
}

/**
 * Categorizes non-parseable files with an explicit, human-readable reason.
 */
function getSkipReason(fileName: string, ext: string): string {
  if (fileName.endsWith(".d.ts")) {
    return "type_declaration_file (.d.ts)";
  }
  if (fileName.startsWith(".env")) {
    return "environment_configuration";
  }
  if (fileName.includes("lock") || fileName.endsWith(".lock")) {
    return "package_manager_lockfile";
  }

  switch (ext.toLowerCase()) {
    case ".json":
      return "json_data_or_configuration";
    case ".md":
    case ".markdown":
    case ".txt":
      return "documentation_or_text";
    case ".css":
    case ".scss":
    case ".sass":
    case ".less":
      return "styling_stylesheet";
    case ".svg":
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".ico":
    case ".webp":
      return "media_graphic_asset";
    case ".sql":
      return "database_migration_or_script";
    case ".yml":
    case ".yaml":
    case ".toml":
      return "configuration_manifest";
    case ".html":
    case ".htm":
      return "static_markup";
    case ".map":
      return "source_map";
    default:
      return ext ? `unsupported_extension (${ext})` : "binary_or_extensionless_file";
  }
}

/**
 * Structurally walks the repository directory.
 * Never slices the largest N files; visits all files structurally.
 */
export function walkRepository(rootPath: string, extraExcludes: string[] = []): WalkedFiles {
  const extraExcludeSet = new Set(extraExcludes);
  const parseableFiles: WalkedFiles["parseableFiles"] = [];
  const skippedFiles: SkippedFile[] = [];

  function traverse(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort entries alphabetically for deterministic ordering
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name) || extraExcludeSet.has(entry.name)) {
          continue;
        }
        traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const folder = path.dirname(relativePath).replace(/\\/g, "/");

        // Declaration files are skipped from code graph
        if (entry.name.endsWith(".d.ts")) {
          skippedFiles.push({
            path: relativePath,
            reason: getSkipReason(entry.name, ext),
          });
          continue;
        }

        if (PARSEABLE_EXTENSIONS.has(ext)) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const linesCount = content === "" ? 0 : content.split(/\r?\n/).length;
            const contentHash = crypto.createHash("sha256").update(content).digest("hex");

            parseableFiles.push({
              absolutePath: fullPath,
              relativePath,
              folder,
              extension: ext,
              linesCount,
              contentHash,
              content,
            });
          } catch (err) {
            skippedFiles.push({
              path: relativePath,
              reason: `unreadable_file: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        } else {
          skippedFiles.push({
            path: relativePath,
            reason: getSkipReason(entry.name, ext),
          });
        }
      }
    }
  }

  traverse(rootPath);

  return {
    parseableFiles,
    skippedFiles,
    totalFilesFound: parseableFiles.length + skippedFiles.length,
  };
}