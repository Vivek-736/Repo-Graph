/**
 * Framework Rail Taxonomy.
 * Lives apart from parser adapters so browser components can import it
 * without pulling ts-morph, fs, or node builtins into the client bundle.
 */

export type FrameworkId = "nextjs" | "nestjs" | "generic";

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