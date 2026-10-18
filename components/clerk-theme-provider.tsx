"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useEffect, useState } from "react";

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to dark since RepoGraph default or system is typically dark, but detect immediately
  const [isDark, setIsDark] = useState<boolean>(true);

  useEffect(() => {
    const updateTheme = () => {
      const saved = localStorage.getItem("repo-graph-theme") || "system";
      if (saved === "dark") {
        setIsDark(true);
      } else if (saved === "light") {
        setIsDark(false);
      } else {
        // system
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setIsDark(prefersDark);
      }
    };

    updateTheme();

    // Observe document element class / attribute changes from ThemeToggle
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", updateTheme);

    return () => {
      observer.disconnect();
      mql.removeEventListener("change", updateTheme);
    };
  }, []);

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        layout: {
          unsafe_disableDevelopmentModeWarnings: true,
        },
        elements: {
          formButtonPrimary: "shadow-none",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}