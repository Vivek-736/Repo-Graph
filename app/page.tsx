import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeroRepoInput } from "@/components/landing/hero-repo-input";
import {
  HeroIllustration,
  BlastRadiusIllustration,
  ASTPipelineIllustration,
  FrameworksIllustration,
} from "@/components/landing/svg-illustrations";

async function HeaderAuth() {
  const session = await auth();
  const isSignedIn = Boolean(session?.userId);

  if (isSignedIn) {
    return (
      <Link
        href="/workspace"
        className="rounded border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-border/60 transition-colors"
      >
        Open Workspace →
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal" forceRedirectUrl="/workspace">
        <button className="rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised transition-colors cursor-pointer">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal" forceRedirectUrl="/workspace">
        <button className="rounded bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity cursor-pointer">
          Sign up
        </button>
      </SignUpButton>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground font-mono selection:bg-accent selection:text-white">
      {/* ========================================================================= */}
      {/* 1. STICKY HEADER                                                         */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="max-w-[1140px] mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo & Product Name */}
          <Link href="/" className="flex items-center gap-2.5 text-foreground hover:opacity-90 transition-opacity">
            <Image
              src="/logo.svg"
              alt="RepoGraph Logo"
              width={24}
              height={24}
              priority
              className="rounded"
            />
            <span className="font-bold tracking-tight text-sm text-foreground">RepoGraph</span>
          </Link>

          {/* Theme Control & Way In */}
          <div className="flex items-center gap-3">
            <ThemeToggle />

            <Suspense
              fallback={
                <div className="h-7 w-20 animate-pulse rounded border border-border bg-surface-raised" />
              }
            >
              <HeaderAuth />
            </Suspense>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. HERO SECTION                                                          */}
      {/* ========================================================================= */}
      <section className="min-h-[85vh] flex flex-col justify-center py-20 lg:py-24 border-b border-border">
        <div className="max-w-[1140px] mx-auto px-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded border border-border bg-surface-raised px-2.5 py-1 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span>Deterministic Dependency Maps</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] text-foreground">
                See the shape of code you didn&rsquo;t write.
              </h1>

              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[64ch]">
                A local app that parses public GitHub repositories into structural dependency maps.
                Folders as boxes, imports as directional lines, and real blast radius. Everything on screen comes from real code parsing.
              </p>

              {/* Hero Repo Input Field */}
              <div className="pt-2">
                <HeroRepoInput />
              </div>

              <p className="text-[11px] text-muted">
                Paste any public TypeScript or JavaScript repository URL to begin.
              </p>
            </div>

            {/* Right Static Inline SVG Illustration */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end">
              <HeroIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. SECTION 1: WHAT THE THING DOES                                        */}
      {/* ========================================================================= */}
      <section className="py-28 lg:py-32 border-b border-border">
        <div className="max-w-[1140px] mx-auto px-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-20 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-accent block">
                Overview & Impact
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.1] text-foreground">
                A map, not a reading list.
              </h2>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[46ch]">
                Folders collapse into readable modules. Files connect only when a real import resolves to a real target on disk.
              </p>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[46ch]">
                Select any file to see its immediate callers in green, its outgoing dependencies in amber, and what breaks two levels out if it changes.
              </p>
            </div>

            <div className="lg:col-span-6 flex justify-center lg:justify-end">
              <BlastRadiusIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. SECTION 2: HOW IT WORKS                                               */}
      {/* ========================================================================= */}
      <section className="py-28 lg:py-32 border-b border-border">
        <div className="max-w-[1140px] mx-auto px-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-20 items-center">
            <div className="lg:col-span-6 order-2 lg:order-1 flex justify-center lg:justify-start">
              <ASTPipelineIllustration />
            </div>

            <div className="lg:col-span-6 order-1 lg:order-2 space-y-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-incoming block">
                AST Resolution
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.1] text-foreground">
                Real AST parsing. Never heuristics.
              </h2>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[46ch]">
                Every node and edge is parsed directly from source files using ts-morph. Path aliases, barrel index re-exports, and CommonJS require calls resolve to physical files on disk.
              </p>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[46ch]">
                Graph calculations are pure functions over the edge list. Unresolved imports are reported with explicit reasons rather than guessed connections.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. SECTION 3: WHICH FRAMEWORKS IT UNDERSTANDS                            */}
      {/* ========================================================================= */}
      <section className="py-28 lg:py-32 border-b border-border">
        <div className="max-w-[1140px] mx-auto px-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-20 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-outgoing block">
                Adapters
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.1] text-foreground">
                Framework conventions, zero runtime overhead.
              </h2>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[46ch]">
                Convention knowledge lives in standalone adapters, not in the parser core. RepoGraph recognizes Next.js App and Pages routers, NestJS module graphs, and Express routes.
              </p>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[46ch]">
                Declared HTTP endpoints are extracted into interactive route tables, linking each path directly to its source handler without executing the application.
              </p>
            </div>

            <div className="lg:col-span-6 flex justify-center lg:justify-end">
              <FrameworksIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. SECTION 4: WHAT IT DELIBERATELY DOESN'T DO (At the end per spec)       */}
      {/* ========================================================================= */}
      <section className="py-28 lg:py-32 border-b border-border bg-surface-raised/20">
        <div className="max-w-[1140px] mx-auto px-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            {/* Left Column: Heading and philosophy */}
            <div className="lg:col-span-5 space-y-4">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted block">
                Design Principles
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.1] text-foreground">
                What we deliberately leave out.
              </h2>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-[46ch]">
                Developer tools accumulate noise when they try to score or grade what they observe. RepoGraph is built around four deliberate refusals.
              </p>
              <div className="pt-4 border-t border-border/60 max-w-[46ch]">
                <p className="text-[11px] text-muted leading-relaxed">
                  Every visual edge is grounded in physical code parsing. If an architectural relationship cannot be resolved with certainty from source ASTs, it is omitted rather than approximated.
                </p>
              </div>
            </div>

            {/* Right Column: 4 Refusal Cards in a 2x2 grid */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded border border-border bg-surface p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-outgoing" />
                  <h3 className="text-xs font-bold text-foreground">No quality scores or ratings</h3>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  It explains a codebase, it doesn&rsquo;t grade one. No scores, lint tallies, or subjective severity badges.
                </p>
              </div>

              <div className="rounded border border-border bg-surface p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-outgoing" />
                  <h3 className="text-xs font-bold text-foreground">No guessed connections</h3>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  An edge exists only when a real import resolves to a real file. Skipped files are counted and reasons recorded. Absent beats approximate.
                </p>
              </div>

              <div className="rounded border border-border bg-surface p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <h3 className="text-xs font-bold text-foreground">No AI deciding the graph</h3>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Everything on screen comes from real AST parsing. The AI explains what the parser found; it never decides what&rsquo;s there.
                </p>
              </div>

              <div className="rounded border border-border bg-surface p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <h3 className="text-xs font-bold text-foreground">No ambient motion</h3>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Answers derivable from the edge list appear instantly. Nothing moves unless it was clicked.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. QUIET FOOTER                                                          */}
      {/* ========================================================================= */}
      <footer className="py-12 bg-surface">
        <div className="max-w-[1140px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">RepoGraph</span>
            <span>&copy; 2026</span>
            <span className="text-border">·</span>
            <span>Made with passion by Vivek</span>
          </div>
          <p className="text-[11px] text-muted">
            Deterministic architectural maps from physical code parsing.
          </p>
        </div>
      </footer>
    </div>
  );
}