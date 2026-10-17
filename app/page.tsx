import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthRedirect } from "@/components/auth-redirect";
import { Suspense } from "react";
import Image from "next/image";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-background text-foreground font-mono">
      {/* Stream authenticated redirect inside Suspense boundary */}
      <Suspense fallback={null}>
        <AuthRedirect />
      </Suspense>

      {/* Top right theme and auth controls */}
      <div className="absolute top-4 right-4 flex items-center gap-3">
        <ThemeToggle />
        <Suspense fallback={<div className="h-7 w-16" />}>
          <div className="flex items-center gap-2">
            <SignInButton forceRedirectUrl="/workspace">
              <button className="px-2.5 py-1 text-xs border border-border rounded bg-surface hover:bg-surface-raised transition-colors">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton forceRedirectUrl="/workspace">
              <button className="px-2.5 py-1 text-xs bg-foreground text-background font-medium rounded hover:opacity-90 transition-opacity">
                Sign up
              </button>
            </SignUpButton>
          </div>
        </Suspense>
      </div>

      <div className="w-full max-w-md text-center">
        <Image
          src="/logo.svg"
          alt="RepoGraph Logo"
          width={48}
          height={48}
          priority
          className="mx-auto mb-3 rounded-xl shadow-sm"
        />
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mb-4 text-[11px] rounded border border-border bg-surface text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          <span>Dependency Graph & Codebase Map</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          RepoGraph
        </h1>
        <p className="mt-2 text-xs text-muted leading-relaxed">
          Sign in to access your team workspace, map dependencies, and inspect structural impact.
        </p>

        <div className="mt-6 flex justify-center gap-3">
          <SignInButton forceRedirectUrl="/workspace">
            <button className="px-4 py-1.5 text-xs font-semibold bg-accent text-white rounded hover:opacity-95 transition-opacity">
              Sign in to Workspace
            </button>
          </SignInButton>
        </div>
      </div>
    </main>
  );
}