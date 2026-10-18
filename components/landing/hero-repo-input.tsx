"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

export function HeroRepoInput() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) {
      setError("Enter a repository URL (e.g. github.com/owner/repo)");
      return;
    }

    if (!trimmed.includes("github.com") && !trimmed.includes("/")) {
      setError("Please provide a valid GitHub repository");
      return;
    }

    setError(null);

    const targetUrl = `/workspace?repoUrl=${encodeURIComponent(trimmed)}`;

    if (isSignedIn) {
      router.push(targetUrl);
    } else {
      router.push(`/sign-in?redirect_url=${encodeURIComponent(targetUrl)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[560px]">
      <div className="flex flex-col sm:flex-row items-stretch gap-2 rounded border border-border bg-surface p-1.5 shadow-sm">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          placeholder="https://github.com/owner/repository"
          className="flex-1 bg-transparent px-3 py-2 text-xs font-mono text-foreground focus:outline-hidden"
        />
        <button
          type="submit"
          className="rounded bg-foreground px-4 py-2 text-xs font-semibold text-background hover:opacity-90 cursor-pointer transition-opacity shrink-0"
        >
          Map repository
        </button>
      </div>
      
      {error && (
        <p className="mt-1.5 text-[11px] font-mono text-outgoing">{error}</p>
      )}
    </form>
  );
}