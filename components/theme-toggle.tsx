"use client";

import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem("repo-graph-theme") as Theme) || "system";
    setTheme(saved);
    setMounted(true);
  }, []);

  const applyTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("repo-graph-theme", newTheme);

    const root = document.documentElement;
    root.setAttribute("data-theme", newTheme);

    if (newTheme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else if (newTheme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("light", "dark");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.classList.add("dark");
      } else {
        root.classList.add("light");
      }
    }
  };

  // Listen to system changes if theme === 'system'
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const current = localStorage.getItem("repo-graph-theme") || "system";
      if (current === "system") {
        const root = document.documentElement;
        if (e.matches) {
          root.classList.add("dark");
          root.classList.remove("light");
        } else {
          root.classList.add("light");
          root.classList.remove("dark");
        }
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  if (!mounted) {
    return <div className="h-6 w-24 bg-border/40 rounded animate-pulse" />;
  }

  return (
    <div className="inline-flex items-center rounded border border-border bg-surface p-0.5 text-xs font-mono">
      {(["system", "light", "dark"] as const).map((t) => {
        const active = theme === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => applyTheme(t)}
            className={`px-2 py-0.5 capitalize transition-colors ${
              active
                ? "bg-foreground text-background font-medium rounded-sm"
                : "text-muted hover:text-foreground"
            }`}
            title={`Set theme to ${t}`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}