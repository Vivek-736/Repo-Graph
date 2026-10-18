import * as fs from "node:fs";
import * as path from "node:path";
import { SourceFile, Node, SyntaxKind } from "ts-morph";
import { FrameworkAdapter } from "../adapter";
import { ExtractedRole, ExtractedRoute } from "../types";

const HTTP_DECORATORS = new Set([
  "Get",
  "Post",
  "Put",
  "Delete",
  "Patch",
  "Options",
  "Head",
  "All",
]);

/**
 * Combines controller route prefix and method subpath into a normalized URL pattern.
 */
function combineRoutePatterns(prefix: string, subpath: string): string {
  const cleanPrefix = prefix.trim().replace(/^\/+|\/+$/g, "");
  const cleanSubpath = subpath.trim().replace(/^\/+|\/+$/g, "");

  if (!cleanPrefix && !cleanSubpath) return "/";
  if (!cleanPrefix) return `/${cleanSubpath}`;
  if (!cleanSubpath) return `/${cleanPrefix}`;
  return `/${cleanPrefix}/${cleanSubpath}`;
}

/**
 * Extracts string value from decorator argument if it is a literal string,
 * or if it is an object literal with a 'path' string property.
 */
function extractPathFromDecoratorArg(argNode: Node | undefined): { success: boolean; path: string } {
  if (!argNode) {
    return { success: true, path: "" };
  }

  // String literal: @Get('users') or @Controller("users")
  if (argNode.getKind() === SyntaxKind.StringLiteral || argNode.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    const text = argNode.getText();
    // Strip surrounding quotes
    return { success: true, path: text.slice(1, -1) };
  }

  // Object literal: @Controller({ path: 'users' })
  if (argNode.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const obj = argNode.asKind(SyntaxKind.ObjectLiteralExpression);
    const pathProp = obj?.getProperty("path");
    if (pathProp && Node.isPropertyAssignment(pathProp)) {
      const init = pathProp.getInitializer();
      if (init && (init.getKind() === SyntaxKind.StringLiteral || init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral)) {
        return { success: true, path: init.getText().slice(1, -1) };
      }
    }
  }

  // If dynamic variable or unresolved expression: exact or absent rule says fail extraction
  return { success: false, path: "" };
}

export class NestJsAdapter implements FrameworkAdapter {
  readonly name = "nestjs";
  readonly displayName = "NestJS";

  detect(rootPath: string, files: string[], packageDeps?: Set<string>): boolean {
    if (packageDeps?.has("@nestjs/core") || packageDeps?.has("@nestjs/common")) {
      return true;
    }

    if (fs.existsSync(path.join(rootPath, "nest-cli.json"))) {
      return true;
    }

    const hasNestFiles = files.some(
      (f) =>
        f.endsWith(".controller.ts") ||
        f.endsWith(".service.ts") ||
        f.endsWith(".module.ts") ||
        f.endsWith(".entity.ts")
    );

    return hasNestFiles;
  }

  classifyRole(filePath: string, sourceFile?: SourceFile): ExtractedRole | null {
    const p = filePath.replace(/\\/g, "/");

    // 1. Controller check
    if (p.endsWith(".controller.ts") || p.endsWith(".controller.js")) {
      return { file: filePath, role: "controller", confidence: 1.0, source: "adapter:nestjs" };
    }

    // 2. Service check
    if (p.endsWith(".service.ts") || p.endsWith(".service.js")) {
      return { file: filePath, role: "service", confidence: 1.0, source: "adapter:nestjs" };
    }

    // 3. Module check
    if (p.endsWith(".module.ts") || p.endsWith(".module.js")) {
      return { file: filePath, role: "module", confidence: 1.0, source: "adapter:nestjs" };
    }

    // 4. Entity check
    if (p.endsWith(".entity.ts") || p.endsWith(".entity.js")) {
      return { file: filePath, role: "entity", confidence: 1.0, source: "adapter:nestjs" };
    }

    // AST fallback inspection if filename doesn't follow strict suffix
    if (sourceFile) {
      for (const cls of sourceFile.getClasses()) {
        for (const dec of cls.getDecorators()) {
          const name = dec.getName();
          if (name === "Controller") {
            return { file: filePath, role: "controller", confidence: 1.0, source: "adapter:nestjs:ast" };
          }
          if (name === "Injectable") {
            return { file: filePath, role: "service", confidence: 1.0, source: "adapter:nestjs:ast" };
          }
          if (name === "Module") {
            return { file: filePath, role: "module", confidence: 1.0, source: "adapter:nestjs:ast" };
          }
          if (name === "Entity") {
            return { file: filePath, role: "entity", confidence: 1.0, source: "adapter:nestjs:ast" };
          }
        }
      }
    }

    // 5. Types / DTOs
    if (
      p.endsWith(".dto.ts") ||
      p.endsWith(".interface.ts") ||
      p.endsWith(".types.ts") ||
      p.endsWith(".d.ts") ||
      p.includes("/dto/")
    ) {
      return { file: filePath, role: "types", confidence: 1.0, source: "adapter:nestjs" };
    }

    return { file: filePath, role: "internal", confidence: 1.0, source: "adapter:nestjs" };
  }

  extractRoutes(filePath: string, sourceFile?: SourceFile): ExtractedRoute[] {
    if (!sourceFile) return [];

    const routes: ExtractedRoute[] = [];

    for (const cls of sourceFile.getClasses()) {
      const controllerDecorator = cls.getDecorators().find((d) => d.getName() === "Controller");
      if (!controllerDecorator) continue;

      const args = controllerDecorator.getArguments();
      const controllerPathResult = extractPathFromDecoratorArg(args[0]);

      // If controller path is present but cannot be extracted without inference, skip
      if (!controllerPathResult.success) {
        continue;
      }

      const controllerPrefix = controllerPathResult.path;

      for (const method of cls.getMethods()) {
        for (const dec of method.getDecorators()) {
          const decName = dec.getName();
          if (!HTTP_DECORATORS.has(decName)) continue;

          const methodArgs = dec.getArguments();
          const methodPathResult = extractPathFromDecoratorArg(methodArgs[0]);

          // Exact or absent constraint: only emit if full pattern is recoverable with no inference
          if (!methodPathResult.success) {
            continue;
          }

          const httpMethod = decName.toUpperCase();
          const fullPattern = combineRoutePatterns(controllerPrefix, methodPathResult.path);

          routes.push({
            file: filePath,
            method: httpMethod,
            path: fullPattern,
          });
        }
      }
    }

    return routes;
  }
}