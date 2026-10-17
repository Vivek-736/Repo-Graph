import { SourceFile, SyntaxKind, StringLiteral, NoSubstitutionTemplateLiteral } from "ts-morph";
import { EdgeKind } from "./types";

export interface ExtractedImport {
  specifier: string;
  kind: EdgeKind;
  line: number;
}

/**
 * Extracts plain imports, re-exports, and dynamic imports with literal strings from an AST SourceFile.
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

  // 3. Dynamic imports with literal string: import('./module')
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
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

  return results;
}