/**
 * Framework Adapter Interface.
 * Encapsulates framework-specific conventions so the parser core remains agnostic.
 */
export interface FrameworkAdapter {
  readonly name: string;

  /**
   * Checks whether the directory is governed by this framework.
   */
  detect(rootPath: string, files: string[]): boolean;

  /**
   * Optional custom path alias resolver if the framework configures aliases implicitly.
   */
  resolveAlias?(specifier: string, fromFile: string, rootPath: string): string | null;

  /**
   * Optional role classifier for a file (e.g. route, page, layout, middleware).
   */
  classifyRole?(filePath: string): string | null;
}

/**
 * Fallback Adapter.
 * Assumes no framework at all. Treats files as standard modules.
 */
export class FallbackAdapter implements FrameworkAdapter {
  readonly name = "fallback";

  detect(_rootPath: string, _files: string[]): boolean {
    return true;
  }

  resolveAlias(_specifier: string, _fromFile: string, _rootPath: string): string | null {
    return null;
  }

  classifyRole(_filePath: string): string | null {
    return null;
  }
}