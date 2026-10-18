import * as path from "node:path";
import * as fs from "node:fs";
import ts from "typescript";
import { FrameworkAdapter } from "./adapter";
import { EdgeKind } from "./types";

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

const CANDIDATE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
];

export interface PathAliasRule {
  prefix: string;
  targets: string[];
}

export interface ResolveResult {
  resolved: boolean;
  target: string | null;
  category: "internal" | "external" | "builtin" | "asset" | "unresolved";
  reason?: string;
}

/**
 * Loads path mappings from tsconfig.json or jsconfig.json, handling comments and trailing commas.
 */
export function loadPathAliases(rootPath: string, customTsconfig?: string): PathAliasRule[] {
  const configFile = customTsconfig
    ? path.resolve(rootPath, customTsconfig)
    : fs.existsSync(path.join(rootPath, "tsconfig.json"))
      ? path.join(rootPath, "tsconfig.json")
      : fs.existsSync(path.join(rootPath, "jsconfig.json"))
        ? path.join(rootPath, "jsconfig.json")
        : null;

  if (!configFile || !fs.existsSync(configFile)) {
    return [];
  }

  try {
    const { config, error } = ts.readConfigFile(configFile, ts.sys.readFile);
    if (error || !config) {
      return [];
    }

    const compilerOptions = config.compilerOptions || {};
    const baseUrl = compilerOptions.baseUrl || ".";
    const paths = compilerOptions.paths || {};

    const rules: PathAliasRule[] = [];
    for (const [key, targetList] of Object.entries(paths)) {
      if (Array.isArray(targetList)) {
        const prefix = key.replace(/\*$/, "");
        const targets = targetList.map((t) => {
          const cleanTarget = String(t).replace(/\*$/, "");
          return path.join(baseUrl, cleanTarget).replace(/\\/g, "/");
        });
        rules.push({ prefix, targets });
      }
    }

    return rules;
  } catch {
    return [];
  }
}

/**
 * Reads root package.json to identify declared external dependencies.
 */
export function loadPackageDependencies(rootPath: string): Set<string> {
  const pkgPath = path.join(rootPath, "package.json");
  const deps = new Set<string>();

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        if (pkg[section] && typeof pkg[section] === "object") {
          for (const dep of Object.keys(pkg[section])) {
            deps.add(dep);
          }
        }
      }
    } catch {
      // Ignored if package.json is unparseable
    }
  }

  return deps;
}

/**
 * Resolves an import specifier to a concrete file within the repository.
 * Never guesses an edge: if unresolved, attaches a specific reason.
 */
export function resolveSpecifier(
  specifier: string,
  fromFilePath: string,
  rootPath: string,
  knownFiles: Set<string>,
  allRepoFiles: Set<string>,
  aliases: PathAliasRule[],
  packageDeps: Set<string>,
  adapter: FrameworkAdapter
): ResolveResult {
  // 1. Node.js built-ins (e.g. 'fs', 'node:path')
  const cleanSpecifier = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
  if (NODE_BUILTINS.has(cleanSpecifier)) {
    return {
      resolved: false,
      target: null,
      category: "builtin",
      reason: `builtin_module (${specifier})`,
    };
  }

  // 2. Allow framework adapter hook (if any)
  const adapterResolved = adapter.resolveAlias?.(specifier, fromFilePath, rootPath);
  if (adapterResolved && knownFiles.has(adapterResolved)) {
    return {
      resolved: true,
      target: adapterResolved,
      category: "internal",
    };
  }

  // 3. Check for Relative Imports (starts with '.' or '/')
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
  let candidateBasePaths: string[] = [];

  if (isRelative) {
    const fromDir = path.dirname(fromFilePath);
    const resolvedPath = path.normalize(path.join(fromDir, specifier)).replace(/\\/g, "/");
    candidateBasePaths.push(resolvedPath);
  } else {
    // 4. Check Path Aliases (e.g. '@/components/foo' -> 'components/foo')
    let matchedAlias = false;
    for (const rule of aliases) {
      if (rule.prefix === "" || specifier.startsWith(rule.prefix)) {
        matchedAlias = true;
        const remainder = specifier.slice(rule.prefix.length);
        for (const target of rule.targets) {
          const candidate = path.normalize(path.join(target, remainder)).replace(/\\/g, "/");
          candidateBasePaths.push(candidate);
        }
      }
    }

    // 5. If not an alias and not relative, check external dependencies
    if (!matchedAlias) {
      // e.g. 'react', '@clerk/backend', 'lodash/get'
      const isScoped = specifier.startsWith("@");
      const parts = specifier.split("/");
      const rootPackage = isScoped && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];

      if (packageDeps.has(rootPackage) || !specifier.includes("/")) {
        return {
          resolved: false,
          target: null,
          category: "external",
          reason: `external_dependency (${specifier})`,
        };
      }
    }
  }

  // 6. Test candidates against known files in the repository
  for (const basePath of candidateBasePaths) {
    for (const ext of CANDIDATE_EXTENSIONS) {
      const candidateWithExt = (basePath + ext).replace(/^\.\//, "");

      if (knownFiles.has(candidateWithExt)) {
        return {
          resolved: true,
          target: candidateWithExt,
          category: "internal",
        };
      }

      // Check if it targets a non-code asset present in the repository (e.g. css, svg)
      if (allRepoFiles.has(candidateWithExt)) {
        return {
          resolved: false,
          target: null,
          category: "asset",
          reason: `non_code_asset (${candidateWithExt})`,
        };
      }
    }
  }

  // 7. If candidateBasePaths was checked but nothing was found
  if (candidateBasePaths.length > 0) {
    const primaryCandidate = candidateBasePaths[0].replace(/^\.\//, "");
    return {
      resolved: false,
      target: null,
      category: "unresolved",
      reason: `target_file_not_found (${primaryCandidate})`,
    };
  }

  // 8. Fallback for unmapped packages or deep external imports
  return {
    resolved: false,
    target: null,
    category: "external",
    reason: `external_dependency (${specifier})`,
  };
}