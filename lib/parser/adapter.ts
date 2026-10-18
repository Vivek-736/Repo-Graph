import { SourceFile } from "ts-morph";
import { ExtractedRole, ExtractedRoute } from "./types";

/**
 * Framework Adapter Interface.
 * Encapsulates framework-specific conventions so the parser core remains agnostic.
 */
export interface FrameworkAdapter {
  readonly name: string;
  readonly displayName: string;

  /**
   * Checks whether the directory is governed by this framework.
   */
  detect(rootPath: string, files: string[], packageDeps?: Set<string>): boolean;

  /**
   * Optional custom path alias resolver if the framework configures aliases implicitly.
   */
  resolveAlias?(specifier: string, fromFile: string, rootPath: string): string | null;

  /**
   * Classifies a file into a framework-defined role (e.g. controller, service, page_route, etc.).
   */
  classifyRole?(filePath: string, sourceFile?: SourceFile): ExtractedRole | null;

  /**
   * Extracts exact routable endpoints (method + full URL pattern) from file syntax.
   * Exact or absent: emit only if method and full pattern are recoverable with no inference.
   */
  extractRoutes?(filePath: string, sourceFile?: SourceFile): ExtractedRoute[];
}

/**
 * Fallback Adapter.
 * Assumes no framework at all. Treats files as standard modules.
 */
export class FallbackAdapter implements FrameworkAdapter {
  readonly name = "generic";
  readonly displayName = "Plain Library";

  detect(_rootPath: string, _files: string[], _packageDeps?: Set<string>): boolean {
    return true;
  }

  resolveAlias(_specifier: string, _fromFile: string, _rootPath: string): string | null {
    return null;
  }

  classifyRole(filePath: string, _sourceFile?: SourceFile): ExtractedRole | null {
    const p = filePath.replace(/\\/g, "/");

    if (
      p === "index.ts" ||
      p === "index.js" ||
      p === "src/index.ts" ||
      p === "src/index.js" ||
      p.endsWith("/index.ts") ||
      p.endsWith("/index.js") ||
      p.includes("main.ts") ||
      p.includes("main.js")
    ) {
      return { file: filePath, role: "entry_point", confidence: 1.0, source: "adapter:generic" };
    }

    if (p.endsWith(".tsx") || p.endsWith(".jsx") || p.includes("/components/")) {
      return { file: filePath, role: "component", confidence: 1.0, source: "adapter:generic" };
    }

    if (p.endsWith(".d.ts") || p.includes("types.") || p.includes("schema.")) {
      return { file: filePath, role: "types", confidence: 1.0, source: "adapter:generic" };
    }

    return { file: filePath, role: "internal", confidence: 1.0, source: "adapter:generic" };
  }

  extractRoutes(_filePath: string, _sourceFile?: SourceFile): ExtractedRoute[] {
    return [];
  }
}