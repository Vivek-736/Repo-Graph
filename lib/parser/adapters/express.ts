import * as fs from "node:fs";
import * as path from "node:path";
import { SourceFile } from "ts-morph";
import { FrameworkAdapter } from "../adapter";
import { ExtractedRole, ExtractedRoute } from "../types";

/**
 * Express Framework Adapter.
 *
 * Classifies roles based on directory and filename conventions,
 * accepting both singular and plural folder names (routes/route,
 * controllers/controller, middleware/middlewares, models/model, services/service).
 *
 * Express routes are assembled dynamically at runtime and cannot be statically
 * recovered with zero inference; per the "exact or absent" rule, no routes are
 * extracted and the route table remains empty.
 */
export class ExpressAdapter implements FrameworkAdapter {
  readonly name = "express";
  readonly displayName = "Express";

  detect(rootPath: string, files: string[], packageDeps?: Set<string>): boolean {
    // 1. Explicit package dependency
    if (packageDeps?.has("express")) {
      return true;
    }

    // 2. Package.json on disk check (if packageDeps wasn't loaded)
    const pkgPath = path.join(rootPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgContent = fs.readFileSync(pkgPath, "utf-8");
        const pkg = JSON.parse(pkgContent);
        if (
          pkg.dependencies?.express ||
          pkg.devDependencies?.express ||
          pkg.peerDependencies?.express
        ) {
          return true;
        }
      } catch {
        // Ignore read/parse error
      }
    }

    // 3. Structural heuristic: presence of routes/controllers + app.js or server.js
    const normalizedFiles = files.map((f) => f.replace(/\\/g, "/").toLowerCase());
    const hasServerEntry = normalizedFiles.some(
      (f) =>
        f === "app.js" ||
        f === "server.js" ||
        f === "src/app.js" ||
        f === "src/server.js" ||
        f === "app.ts" ||
        f === "server.ts" ||
        f === "src/app.ts" ||
        f === "src/server.ts" ||
        f.endsWith("bin/www")
    );

    const hasExpressFolders = normalizedFiles.some((f) => {
      const parts = f.split("/");
      return parts.some((p) =>
        ["routes", "route", "router", "routers", "controllers", "controller", "middleware", "middlewares"].includes(p)
      );
    });

    return hasServerEntry && hasExpressFolders;
  }

  classifyRole(filePath: string, _sourceFile?: SourceFile): ExtractedRole | null {
    const p = filePath.replace(/\\/g, "/").toLowerCase();
    const segments = p.split("/");
    const fileName = segments[segments.length - 1];

    // 1. Entry points (root or src/ level servers, bin/www)
    if (
      fileName === "app.js" ||
      fileName === "app.ts" ||
      fileName === "server.js" ||
      fileName === "server.ts" ||
      p.endsWith("bin/www")
    ) {
      return { file: filePath, role: "entry_point", confidence: 1.0, source: "adapter:express" };
    }

    // 2. Routes & Routers (singular & plural conventions)
    const hasFolder = (singular: string, plural: string) =>
      segments.slice(0, -1).some((seg) => seg === singular || seg === plural);

    if (
      hasFolder("route", "routes") ||
      hasFolder("router", "routers") ||
      fileName.includes(".route.") ||
      fileName.includes(".routes.") ||
      fileName.includes(".router.")
    ) {
      return { file: filePath, role: "route", confidence: 1.0, source: "adapter:express" };
    }

    // 3. Controllers
    if (hasFolder("controller", "controllers") || fileName.includes(".controller.")) {
      return { file: filePath, role: "controller", confidence: 1.0, source: "adapter:express" };
    }

    // 4. Middleware
    if (hasFolder("middleware", "middlewares") || fileName.includes(".middleware.")) {
      return { file: filePath, role: "middleware", confidence: 1.0, source: "adapter:express" };
    }

    // 5. Services
    if (hasFolder("service", "services") || fileName.includes(".service.")) {
      return { file: filePath, role: "service", confidence: 1.0, source: "adapter:express" };
    }

    // 6. Models & Schemas
    if (
      hasFolder("model", "models") ||
      hasFolder("schema", "schemas") ||
      hasFolder("entity", "entities") ||
      fileName.includes(".model.") ||
      fileName.includes(".schema.")
    ) {
      return { file: filePath, role: "model", confidence: 1.0, source: "adapter:express" };
    }

    // 7. General root index or main entry
    if (
      (p === "index.js" || p === "index.ts" || p === "src/index.js" || p === "src/index.ts") &&
      segments.length <= 2
    ) {
      return { file: filePath, role: "entry_point", confidence: 1.0, source: "adapter:express" };
    }

    // 8. Other internal plumbing / utilities
    return { file: filePath, role: "internal", confidence: 1.0, source: "adapter:express" };
  }

  /**
   * Express routes are assembled dynamically at runtime and not statically recoverable.
   * Per the exact-or-absent rule, return an empty route table.
   */
  extractRoutes(_filePath: string, _sourceFile?: SourceFile): ExtractedRoute[] {
    return [];
  }
}