"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface OrgSyncProps {
  targetOrgId: string;
}

export function OrgSync({ targetOrgId }: OrgSyncProps) {
  const { isLoaded, setActive } = useOrganizationList();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || !setActive) return;

    let mounted = true;
    setActive({ organization: targetOrgId })
      .then(() => {
        if (mounted) {
          router.refresh();
        }
      })
      .catch((err) => {
        console.error("Failed to activate organization:", err);
      });

    return () => {
      mounted = false;
    };
  }, [isLoaded, setActive, targetOrgId, router]);

  return (
    <div className="flex items-center gap-2 p-4 text-xs font-mono text-muted">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-transparent" />
      Syncing organization workspace...
    </div>
  );
}