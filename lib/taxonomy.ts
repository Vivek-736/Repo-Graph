/**
 * Framework Rail Taxonomy.
 * Lives apart from parser adapters so browser components can import it
 * without pulling ts-morph, fs, or node builtins into the client bundle.
 */

export type FrameworkId = "nextjs" | "nestjs" | "express" | "generic";

export interface TaxonomyCategory {
  id: string;
  name: string;
  role: string;
  color: string;
  description?: string;
}

export interface FrameworkTaxonomy {
  id: FrameworkId;
  name: string;
  categories: TaxonomyCategory[];
}

export const FRAMEWORK_TAXONOMIES: Record<FrameworkId, FrameworkTaxonomy> = {
  nextjs: {
    id: "nextjs",
    name: "Next.js",
    categories: [
      { id: "page_routes", name: "Page routes", role: "page_route", color: "#a855f7", description: "App & Pages router pages" },
      { id: "api_endpoints", name: "API endpoints", role: "api_endpoint", color: "#38bdf8", description: "Route handlers & API routes" },
      { id: "server_actions", name: "Server actions", role: "server_action", color: "#10b981", description: "Exported 'use server' actions" },
      { id: "components", name: "Components", role: "component", color: "#eab308", description: "UI components" },
      { id: "internals", name: "Internals", role: "internal", color: "#64748b", description: "Internal utilities & libraries" },
      { id: "types", name: "Types", role: "types", color: "#f59e0b", description: "TypeScript contracts & schemas" },
    ],
  },
  nestjs: {
    id: "nestjs",
    name: "NestJS",
    categories: [
      { id: "controllers", name: "Controllers", role: "controller", color: "#a855f7", description: "@Controller classes & handlers" },
      { id: "services", name: "Services", role: "service", color: "#10b981", description: "@Injectable services & providers" },
      { id: "modules", name: "Modules", role: "module", color: "#38bdf8", description: "@Module organizational boundaries" },
      { id: "entities", name: "Entities", role: "entity", color: "#f59e0b", description: "@Entity ORM data models" },
      { id: "internals", name: "Internals", role: "internal", color: "#64748b", description: "Internal helpers & middleware" },
      { id: "types", name: "Types", role: "types", color: "#ec4899", description: "DTOs & type definitions" },
    ],
  },
  express: {
    id: "express",
    name: "Express",
    categories: [
      { id: "routes", name: "Routes", role: "route", color: "#a855f7", description: "Route handlers & routers" },
      { id: "controllers", name: "Controllers", role: "controller", color: "#38bdf8", description: "Request handlers & controllers" },
      { id: "middleware", name: "Middleware", role: "middleware", color: "#ec4899", description: "Express middleware functions" },
      { id: "services", name: "Services", role: "service", color: "#10b981", description: "Business logic & domain services" },
      { id: "models", name: "Models", role: "model", color: "#f59e0b", description: "Data models & schemas" },
      { id: "entry_points", name: "Entry points", role: "entry_point", color: "#6366f1", description: "App setup & server listeners" },
      { id: "internals", name: "Internals", role: "internal", color: "#64748b", description: "Internal utilities & helpers" },
    ],
  },
  generic: {
    id: "generic",
    name: "Plain Library",
    categories: [
      { id: "entry_points", name: "Entry points", role: "entry_point", color: "#a855f7", description: "Main exports & root files" },
      { id: "components", name: "Components", role: "component", color: "#38bdf8", description: "Reusable UI components" },
      { id: "internals", name: "Internals", role: "internal", color: "#64748b", description: "Internal modules & algorithms" },
      { id: "types", name: "Types", role: "types", color: "#f59e0b", description: "Types & declarations" },
    ],
  },
};

/**
 * Returns taxonomy categories for a given framework ID.
 */
export function getTaxonomy(framework: FrameworkId | string = "generic"): FrameworkTaxonomy {
  if (framework === "nextjs") return FRAMEWORK_TAXONOMIES.nextjs;
  if (framework === "nestjs") return FRAMEWORK_TAXONOMIES.nestjs;
  if (framework === "express") return FRAMEWORK_TAXONOMIES.express;
  return FRAMEWORK_TAXONOMIES.generic;
}

/**
 * Fast client-side fallback detection from file paths when DB role records are absent.
 */
export function detectFrameworkFromPaths(paths: string[]): FrameworkId {
  const isNest = paths.some(
    (p) =>
      p.endsWith(".controller.ts") ||
      p.endsWith(".service.ts") ||
      p.endsWith(".module.ts") ||
      p.endsWith(".entity.ts") ||
      p.includes("nest-cli.json")
  );
  if (isNest) return "nestjs";

  const isNext = paths.some(
    (p) =>
      p.startsWith("app/") ||
      p.startsWith("src/app/") ||
      p.startsWith("pages/") ||
      p.startsWith("src/pages/") ||
      p.includes("next.config")
  );
  if (isNext) return "nextjs";

  const isExpress = paths.some((p) => {
    const parts = p.toLowerCase().split("/");
    return (
      parts.some((part) =>
        ["routes", "route", "router", "routers", "controllers", "controller", "middleware", "middlewares"].includes(part)
      ) ||
      p === "app.js" ||
      p === "server.js" ||
      p.endsWith("bin/www")
    );
  });
  if (isExpress) return "express";

  return "generic";
}

/**
 * Fast client-side fallback role mapping from file path for displaying categories.
 */
export function classifyPathRoleFallback(filePath: string, framework: FrameworkId): string {
  const p = filePath.replace(/\\/g, "/");

  if (framework === "nestjs") {
    if (p.endsWith(".controller.ts") || p.endsWith(".controller.js")) return "controller";
    if (p.endsWith(".service.ts") || p.endsWith(".service.js")) return "service";
    if (p.endsWith(".module.ts") || p.endsWith(".module.js")) return "module";
    if (p.endsWith(".entity.ts") || p.endsWith(".entity.js")) return "entity";
    if (p.endsWith(".dto.ts") || p.endsWith(".interface.ts") || p.endsWith(".types.ts") || p.endsWith(".d.ts")) return "types";
    return "internal";
  }

  if (framework === "nextjs") {
    if (
      p.match(/(^|\/)(app|src\/app)\/.*\/page\.(tsx|ts|jsx|js)$/) ||
      p.match(/(^|\/)(pages|src\/pages)\/(?!api\/|_app|_document|_error).*\.(tsx|ts|jsx|js)$/)
    ) {
      return "page_route";
    }
    if (
      p.match(/(^|\/)(app|src\/app)\/.*\/route\.(ts|js)$/) ||
      p.match(/(^|\/)(pages|src\/pages)\/api\/.*\.(ts|js)$/)
    ) {
      return "api_endpoint";
    }
    if (p.includes("action") || p.includes("actions/")) {
      return "server_action";
    }
    if (p.endsWith(".tsx") || p.includes("/components/")) {
      return "component";
    }
    if (p.endsWith(".d.ts") || p.includes("types.") || p.includes("schema.")) {
      return "types";
    }
    return "internal";
  }

  if (framework === "express") {
    const segments = p.toLowerCase().split("/");
    const fileName = segments[segments.length - 1];

    if (
      fileName === "app.js" ||
      fileName === "app.ts" ||
      fileName === "server.js" ||
      fileName === "server.ts" ||
      p.endsWith("bin/www")
    ) {
      return "entry_point";
    }

    const hasFolder = (singular: string, plural: string) =>
      segments.slice(0, -1).some((seg) => seg === singular || seg === plural);

    if (
      hasFolder("route", "routes") ||
      hasFolder("router", "routers") ||
      fileName.includes(".route.") ||
      fileName.includes(".routes.") ||
      fileName.includes(".router.")
    ) {
      return "route";
    }

    if (hasFolder("controller", "controllers") || fileName.includes(".controller.")) {
      return "controller";
    }

    if (hasFolder("middleware", "middlewares") || fileName.includes(".middleware.")) {
      return "middleware";
    }

    if (hasFolder("service", "services") || fileName.includes(".service.")) {
      return "service";
    }

    if (
      hasFolder("model", "models") ||
      hasFolder("schema", "schemas") ||
      hasFolder("entity", "entities") ||
      fileName.includes(".model.") ||
      fileName.includes(".schema.")
    ) {
      return "model";
    }

    if (
      (p === "index.js" || p === "index.ts" || p === "src/index.js" || p === "src/index.ts") &&
      segments.length <= 2
    ) {
      return "entry_point";
    }

    return "internal";
  }

  // Generic
  if (p === "index.ts" || p === "index.js" || p === "src/index.ts" || p === "src/index.js" || p.includes("main.")) {
    return "entry_point";
  }
  if (p.endsWith(".tsx") || p.includes("/components/")) {
    return "component";
  }
  if (p.endsWith(".d.ts") || p.includes("types.") || p.includes("schema.")) {
    return "types";
  }

  return "internal";
}