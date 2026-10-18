import { SourceFile, SyntaxKind, StringLiteral, NoSubstitutionTemplateLiteral, Node } from "ts-morph";
import { EdgeKind } from "./types";

export interface ExtractedImport {
  specifier: string;
  kind: EdgeKind;
  line: number;
}

/**
 * Extracts plain imports, re-exports, dynamic imports, and CommonJS require() calls
 * with literal strings from an AST SourceFile.
 */
export function extractImports(sourceFile: SourceFile): ExtractedImport[] {
  const results: ExtractedImport[] = [];

  // 1. Plain imports (e.g. import { x } from './foo', import './styles.css')
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const specifier = importDecl.getModuleSpecifierValue();
    if (specifier) {
      results.push({
        specifier,
        kind: "import",
        line: importDecl.getStartLineNumber(),
      });
    }
  }

  // 2. Re-exports (e.g. export { x } from './foo', export * from './bar')
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    const specifier = exportDecl.getModuleSpecifierValue();
    if (specifier) {
      results.push({
        specifier,
        kind: "reexport",
        line: exportDecl.getStartLineNumber(),
      });
    }
  }

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  // 3. Dynamic imports with literal string: import('./module')
  for (const call of callExpressions) {
    if (call.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      const args = call.getArguments();
      if (args.length > 0) {
        const firstArg = args[0];
        let literalValue: string | null = null;

        if (firstArg.getKind() === SyntaxKind.StringLiteral) {
          literalValue = (firstArg as StringLiteral).getLiteralValue();
        } else if (firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
          literalValue = (firstArg as NoSubstitutionTemplateLiteral).getLiteralValue();
        }

        if (literalValue !== null && literalValue.trim() !== "") {
          results.push({
            specifier: literalValue,
            kind: "dynamic",
            line: call.getStartLineNumber(),
          });
        }
      }
    }
  }

  // 4. CommonJS require with literal string: require('./module')
  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getKind() === SyntaxKind.Identifier && expr.getText() === "require") {
      const args = call.getArguments();
      if (args.length > 0) {
        const firstArg = args[0];
        let literalValue: string | null = null;

        if (firstArg.getKind() === SyntaxKind.StringLiteral) {
          literalValue = (firstArg as StringLiteral).getLiteralValue();
        } else if (firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
          literalValue = (firstArg as NoSubstitutionTemplateLiteral).getLiteralValue();
        }

        if (literalValue !== null && literalValue.trim() !== "") {
          results.push({
            specifier: literalValue,
            kind: "require",
            line: call.getStartLineNumber(),
          });
        }
      }
    }
  }

  return results;
}

/**
 * Reads the exported names of a CommonJS module:
 * - module.exports.name = ...
 * - exports.name = ...
 * - module.exports = { a, b, c }
 * - module.exports = function name() ...
 * - module.exports = class name ...
 */
export function extractCommonJSExports(sourceFile: SourceFile): string[] {
  const exportNames = new Set<string>();

  const binaryExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
  for (const expr of binaryExpressions) {
    if (expr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;

    const left = expr.getLeft();
    const right = expr.getRight();

    // 1. module.exports = ...
    if (left.getText() === "module.exports") {
      if (right.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const obj = right.asKind(SyntaxKind.ObjectLiteralExpression);
        if (obj) {
          for (const prop of obj.getProperties()) {
            if (
              Node.isPropertyAssignment(prop) ||
              Node.isShorthandPropertyAssignment(prop) ||
              Node.isMethodDeclaration(prop)
            ) {
              exportNames.add(prop.getName());
            }
          }
        }
      } else if (Node.isFunctionExpression(right) || Node.isClassExpression(right)) {
        const name = right.getName();
        if (name) exportNames.add(name);
        else exportNames.add("default");
      } else if (Node.isIdentifier(right)) {
        exportNames.add(right.getText());
      }
      continue;
    }

    // 2. module.exports.foo = ... or exports.bar = ...
    if (Node.isPropertyAccessExpression(left)) {
      const subExpr = left.getExpression();
      if (subExpr.getText() === "module.exports" || subExpr.getText() === "exports") {
        exportNames.add(left.getName());
      }
    }
  }

  return Array.from(exportNames);
}