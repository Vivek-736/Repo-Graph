"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startAnalysis } from "@/lib/actions/analysis";

export function RepoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const param = searchParams.get("repoUrl");
    if (param && !url) {
      setUrl(param);
    }
  }, [searchParams, url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a GitHub repository URL");
      return;
    }

    if (!trimmed.includes("github.com") && !trimmed.includes("/")) {
      setError("Must be a valid GitHub repository (e.g. https://github.com/owner/repo)");
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const res = await startAnalysis(trimmed);
        if (!res.success || !res.data) {
          setError(res.error || "Failed to initiate repository analysis");
          return;
        }

        // Navigate to the analysis progress & map view
        router.push(`/analyses/${res.data.analysisId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    });
  };

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
          Analyze New Repository
        </h2>
        <p className="text-[11px] text-muted mt-0.5">
          Paste a public GitHub repository URL to build its dependency map.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://github.com/owner/repository"
              disabled={isPending}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={isPending || !url.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {isPending ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Starting run...</span>
              </>
            ) : (
              <span>Analyze Repository</span>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-500">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}