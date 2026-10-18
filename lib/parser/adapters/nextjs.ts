import * as fs from "node:fs";
import * as path from "node:path";
import { SourceFile, Node } from "ts-morph";
import { FrameworkAdapter } from "../adapter";
import { ExtractedRole, ExtractedRoute } from "../types";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

/**
 * Maps Next.js App Router file path to URL route pattern.
 * Respects dynamic segments [param], catch-all [...slug], optional catch-all [[...slug]],
 * and removes route groups (group) and parallel slots @slot.
 */
function mapAppPathToRoute(appRelativePath: string): string {
  const clean = appRelativePath.replace(/^\/+|\/+$/g, "");
  if (!clean) return "/";

  const segments = clean.split("/").filter((s) => {
    if (!s) return false;
    // Omit route groups: (auth), (marketing)
    if (s.startsWith("(") && s.endsWith(")")) return false;
    // Omit parallel route slots: @modal, @analytics
    if (s.startsWith("@")) return false;
    // Omit route interceptor symbols prefix if separate segment
    if (s === "(.)" || s === "(..)" || s === "(...)" || s === "(..)(..)") return false;
    return true;
  });

  if (segments.length === 0) {
    return "/";
  }

  return "/" + segments.join("/");
}

/**
 * Checks whether a SourceFile or any of its exported functions has 'use server'.
 */
function hasUseServerDirective(sourceFile: SourceFile): boolean {
  // 1. File-level directive
  const statements = sourceFile.getStatements();
  for (const stmt of statements.slice(0, 5)) {
    if (Node.isExpressionStatement(stmt)) {
      const text = stmt.getExpression().getText().trim();
      if (text === '"use server"' || text === "'use server'") {
        return true;
      }
    }
  }

  // 2. Function-level directive in exported functions
  for (const fn of sourceFile.getFunctions()) {
    if (!fn.isExported()) continue;
    const body = fn.getBody();
    if (body && Node.isBlock(body)) {
      const firstBodyStmt = body.getStatements()[0];
      if (firstBodyStmt && Node.isExpressionStatement(firstBodyStmt)) {
        const text = firstBodyStmt.getExpression().getText().trim();
        if (text === '"use server"' || text === "'use server'") {
          return true;
        }
      }
    }
  }

  return false;
}

export class NextJsAdapter implements FrameworkAdapter {
  readonly name = "nextjs";
  readonly displayName = "Next.js";

  detect(rootPath: string, files: string[], packageDeps?: Set<string>): boolean {
    if (packageDeps?.has("next")) {
      return true;
    }

    // Config files
    const configExists =
      fs.existsSync(path.join(/*turbopackIgnore: true*/ rootPath, "next.config.js")) ||
      fs.existsSync(path.join(/*turbopackIgnore: true*/ rootPath, "next.config.mjs")) ||
      fs.existsSync(path.join(/*turbopackIgnore: true*/ rootPath, "next.config.ts"));

    if (configExists) {
      return true;
    }

    // File structure heuristic
    const hasNextStructure = files.some(
      (f) =>
        f.startsWith("app/") ||
        f.startsWith("src/app/") ||
        f.startsWith("pages/") ||
        f.startsWith("src/pages/")
    );

    return hasNextStructure;
  }

  classifyRole(filePath: string, sourceFile?: SourceFile): ExtractedRole | null {
    const p = filePath.replace(/\\/g, "/");

    // 1. App Router Page
    if (
      p.match(/(^|\/)(app|src\/app)\/(.+)\/page\.(tsx|ts|jsx|js)$/) ||
      p.match(/(^|\/)(app|src\/app)\/page\.(tsx|ts|jsx|js)$/)
    ) {
      return { file: filePath, role: "page_route", confidence: 1.0, source: "adapter:nextjs" };
    }

    // 2. App Router Route Handler
    if (
      p.match(/(^|\/)(app|src\/app)\/(.+)\/route\.(ts|js)$/) ||
      p.match(/(^|\/)(app|src\/app)\/route\.(ts|js)$/)
    ) {
      return { file: filePath, role: "api_endpoint", confidence: 1.0, source: "adapter:nextjs" };
    }

    // 3. Pages Router API Route
    if (p.match(/(^|\/)(pages|src\/pages)\/api\/.+\.(ts|js)$/)) {
      return { file: filePath, role: "api_endpoint", confidence: 1.0, source: "adapter:nextjs" };
    }

    // 4. Pages Router Page
    if (
      p.match(/(^|\/)(pages|src\/pages)\/(?!api\/|_app|_document|_error).+\.(tsx|ts|jsx|js)$/)
    ) {
      return { file: filePath, role: "page_route", confidence: 1.0, source: "adapter:nextjs" };
    }

    // 5. Server Actions: 'use server' file or function
    if (sourceFile && hasUseServerDirective(sourceFile)) {
      return { file: filePath, role: "server_action", confidence: 1.0, source: "adapter:nextjs:action" };
    }
    if (p.includes("/actions/") || p.endsWith(".action.ts") || p.endsWith(".action.tsx")) {
      return { file: filePath, role: "server_action", confidence: 0.9, source: "adapter:nextjs" };
    }

    // 6. UI Components
    if (p.endsWith(".tsx") || p.endsWith(".jsx") || p.includes("/components/")) {
      return { file: filePath, role: "component", confidence: 1.0, source: "adapter:nextjs" };
    }

    // 7. Types
    if (p.endsWith(".d.ts") || p.includes("types.") || p.includes("schema.")) {
      return { file: filePath, role: "types", confidence: 1.0, source: "adapter:nextjs" };
    }

    // 8. Internals / Plumbing
    return { file: filePath, role: "internal", confidence: 1.0, source: "adapter:nextjs" };
  }

  extractRoutes(filePath: string, sourceFile?: SourceFile): ExtractedRoute[] {
    const p = filePath.replace(/\\/g, "/");
    const routes: ExtractedRoute[] = [];

    // Case 1: App Router page: app/**/page.tsx or src/app/**/page.tsx
    const appPageMatch =
      p.match(/(?:^|\/)(?:app|src\/app)\/(.+)\/page\.(?:tsx|ts|jsx|js)$/) ||
      p.match(/(?:^|\/)(?:app|src\/app)\/page\.(?:tsx|ts|jsx|js)$/);

    if (appPageMatch) {
      const subpath = appPageMatch[1] || "";
      const routePath = mapAppPathToRoute(subpath);
      routes.push({
        file: filePath,
        method: "GET",
        path: routePath,
      });
      return routes;
    }

    // Case 2: App Router route handler: app/**/route.ts or src/app/**/route.ts
    const appRouteMatch =
      p.match(/(?:^|\/)(?:app|src\/app)\/(.+)\/route\.(?:ts|js)$/) ||
      p.match(/(?:^|\/)(?:app|src\/app)\/route\.(?:ts|js)$/);

    if (appRouteMatch) {
      const subpath = appRouteMatch[1] || "";
      const routePath = mapAppPathToRoute(subpath);

      if (sourceFile) {
        // Inspect exported HTTP functions
        for (const fn of sourceFile.getFunctions()) {
          const fnName = fn.getName();
          if (fn.isExported() && fnName && HTTP_METHODS.has(fnName)) {
            routes.push({
              file: filePath,
              method: fnName,
              path: routePath,
            });
          }
        }

        // Inspect exported HTTP consts: export const GET = ...
        for (const varStmt of sourceFile.getVariableStatements()) {
          if (!varStmt.isExported()) continue;
          for (const decl of varStmt.getDeclarationList().getDeclarations()) {
            const varName = decl.getName();
            if (HTTP_METHODS.has(varName)) {
              routes.push({
                file: filePath,
                method: varName,
                path: routePath,
              });
            }
          }
        }
      }

      return routes;
    }

    // Case 3: Pages Router page: pages/** (excluding api/, _app, _document, _error)
    const pagesMatch = p.match(/(?:^|\/)(?:pages|src\/pages)\/(?!api\/|_app|_document|_error)(.+)\.(?:tsx|ts|jsx|js)$/);
    if (pagesMatch) {
      let pagePath = pagesMatch[1];
      if (pagePath.endsWith("/index") || pagePath === "index") {
        pagePath = pagePath.replace(/\/?index$/, "");
      }
      const routePath = pagePath ? `/${pagePath}` : "/";
      routes.push({
        file: filePath,
        method: "GET",
        path: routePath,
      });
      return routes;
    }

    return routes;
  }
}