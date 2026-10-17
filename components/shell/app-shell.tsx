import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import React, { Suspense } from "react";
import Image from "next/image";

interface AppShellProps {
  currentOrgName?: string | null;
  currentOrgId?: string | null;
  children: React.ReactNode;
}

export function AppShell({ currentOrgName, currentOrgId, children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Top Application Bar */}
      <header className="flex h-12 w-full shrink-0 items-center justify-between border-b border-border bg-surface px-4 text-xs">
        {/* Left: Branding & Current Org rendered directly on server */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="RepoGraph"
            width={26}
            height={26}
            className="rounded-lg shadow-xs"
          />
          <span className="font-mono font-bold tracking-wider uppercase text-foreground">
            RepoGraph
          </span>
          <span className="text-border">/</span>
          {currentOrgName ? (
            <div className="flex items-center gap-1.5 font-mono text-muted" title={currentOrgId || ""}>
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="font-medium text-foreground">{currentOrgName}</span>
              {currentOrgId && (
                <span className="text-[10px] text-muted opacity-70">({currentOrgId.slice(0, 8)}…)</span>
              )}
            </div>
          ) : (
            <span className="font-mono text-muted">No active team</span>
          )}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2.5">
          <Suspense fallback={<div className="h-6 w-20" />}>
            <OrganizationSwitcher
              hidePersonal={true}
              afterCreateOrganizationUrl="/workspace"
              afterSelectOrganizationUrl="/workspace"
              afterLeaveOrganizationUrl="/workspace"
              appearance={{
                elements: {
                  rootBox: "flex items-center",
                  organizationSwitcherTrigger:
                    "flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border border-border bg-surface text-foreground hover:bg-surface-raised",
                },
              }}
            />
          </Suspense>

          <ThemeToggle />

          <Suspense fallback={<div className="h-6 w-6 rounded-full bg-border" />}>
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "h-6 w-6",
                },
              }}
            />
          </Suspense>
        </div>
      </header>

      {/* Main Workspace Surface */}
      <main className="flex flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}