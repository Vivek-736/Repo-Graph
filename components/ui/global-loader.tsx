"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global Top Progress Loader.
 * Displays a very thin, animated accent line at the very top of the window
 * whenever navigation occurs or when window.__setGlobalLoading(boolean) is triggered.
 */
declare global {
  interface Window {
    __setGlobalLoading?: (loading: boolean) => void;
  }
}

export function GlobalLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Hook global programmatic trigger
  useEffect(() => {
    window.__setGlobalLoading = (isLoading: boolean) => {
      setLoading(isLoading);
      if (isLoading) {
        setProgress(30);
      } else {
        setProgress(100);
      }
    };
    return () => {
      delete window.__setGlobalLoading;
    };
  }, []);

  // Flash loader on route/searchParam changes
  useEffect(() => {
    setLoading(true);
    setProgress(35);

    const t1 = setTimeout(() => setProgress(75), 100);
    const t2 = setTimeout(() => setProgress(100), 250);
    const t3 = setTimeout(() => setLoading(false), 450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [pathname, searchParams]);

  if (!loading && progress === 0) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 h-[2.5px] bg-transparent pointer-events-none transition-opacity duration-300 ${
        loading ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="h-full bg-accent shadow-[0_0_8px_rgba(59,130,246,0.6)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
        }}
      />
    </div>
  );
}