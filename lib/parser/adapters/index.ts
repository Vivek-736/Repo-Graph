import { FrameworkAdapter, FallbackAdapter } from "../adapter";
import { NextJsAdapter } from "./nextjs";
import { NestJsAdapter } from "./nestjs";
import { ExpressAdapter } from "./express";

export * from "./nextjs";
export * from "./nestjs";
export * from "./express";

/**
 * Detection runs in a fixed order and the first match wins.
 * 1. Next.js
 * 2. NestJS
 * 3. Express
 * 4. Fallback / Generic
 */
export function detectAdapter(
  rootPath: string,
  files: string[],
  packageDeps?: Set<string>
): FrameworkAdapter {
  const nextAdapter = new NextJsAdapter();
  if (nextAdapter.detect(rootPath, files, packageDeps)) {
    return nextAdapter;
  }

  const nestAdapter = new NestJsAdapter();
  if (nestAdapter.detect(rootPath, files, packageDeps)) {
    return nestAdapter;
  }

  const expressAdapter = new ExpressAdapter();
  if (expressAdapter.detect(rootPath, files, packageDeps)) {
    return expressAdapter;
  }

  return new FallbackAdapter();
}