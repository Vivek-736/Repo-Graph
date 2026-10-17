import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { WorkspaceContent } from "@/components/workspace/workspace-content";
import { AppShell } from "@/components/shell/app-shell";

export const instant = false;

export default async function WorkspacePage() {
  await auth.protect();

  return (
    <Suspense
      fallback={
        <AppShell currentOrgName="Loading workspace..." currentOrgId={null}>
          <div className="flex h-full w-full items-center justify-center p-6 font-mono text-xs text-muted">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent mr-2" />
            Loading workspace...
          </div>
        </AppShell>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}