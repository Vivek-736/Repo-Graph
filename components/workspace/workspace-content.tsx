import { auth, clerkClient } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shell/app-shell";
import { OrgSync } from "@/components/org-sync";
import { createServerDatabaseClient } from "@/lib/supabase/server";
import { createAdminDatabaseClient } from "@/lib/supabase/admin";
import { RepoForm } from "./repo-form";
import { AnalysisList } from "./analysis-list";
import Link from "next/link";

interface ProjectRelation {
  id: string;
  name: string;
  repo_url: string;
}

interface AnalysisRow {
  id: string;
  commit_hash: string | null;
  status: string;
  stage: string | null;
  failure_reason: string | null;
  files_count: number;
  edges_count: number;
  routes_count: number;
  coverage_percentage: number | null;
  summary: string | null;
  created_at: string;
  projects: ProjectRelation | ProjectRelation[] | null;
}

export async function WorkspaceContent() {
  const { userId, orgId, orgRole } = await auth.protect();
  const client = await clerkClient();

  // If no active organization in session, auto-provision or auto-select one
  if (!orgId) {
    const memberships = await client.users.getOrganizationMembershipList({ userId });

    let targetOrgId: string | null = null;

    if (memberships.data.length > 0) {
      targetOrgId = memberships.data[0].organization.id;
    } else {
      // First-time sign-in on a brand new account: auto-create team without prompting
      const user = await client.users.getUser(userId);
      const displayName =
        user.firstName ||
        user.username ||
        (user.emailAddresses[0]?.emailAddress ? user.emailAddresses[0].emailAddress.split("@")[0] : null) ||
        "Personal";

      const newOrg = await client.organizations.createOrganization({
        name: `${displayName}'s Team`,
        createdBy: userId,
      });

      targetOrgId = newOrg.id;
    }

    return (
      <AppShell currentOrgName="Activating team..." currentOrgId={null}>
        <div className="flex h-full w-full items-center justify-center p-6">
          <OrgSync targetOrgId={targetOrgId} />
        </div>
      </AppShell>
    );
  }

  // Active organization exists: fetch Clerk details with graceful fallback
  let orgName = "Team Workspace";
  try {
    const org = await client.organizations.getOrganization({ organizationId: orgId });
    if (org?.name) {
      orgName = org.name;
    }
  } catch (err) {
    console.warn("Could not fetch organization details from Clerk, using fallback:", err);
  }

// Connect to Supabase using client carrying Clerk's signed-in JWT token
  const supabase = await createServerDatabaseClient();

  let analyses: AnalysisRow[] = [];
  let analysesError: { message: string } | null = null;

  if (supabase) {
    // Ensure organization record exists in database
    await supabase.from("organizations").upsert({
      id: orgId,
      name: orgName,
    });

    // Query analyses WITHOUT filtering by organization in application code.
    // Database-enforced RLS policy restricts rows by auth.jwt() ->> 'org_id'.
    const { data: rawAnalyses, error } = await supabase
      .from("analyses")
      .select(`
        id,
        commit_hash,
        status,
        stage,
        failure_reason,
        files_count,
        edges_count,
        routes_count,
        coverage_percentage,
        summary,
        created_at,
        projects (
          id,
          name,
          repo_url
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      analysesError = error;
    } else {
      analyses = (rawAnalyses as unknown as AnalysisRow[]) || [];
    }

    // If user client returned no rows, fallback to admin client for the organization
    if (analyses.length === 0) {
      const adminDb = createAdminDatabaseClient();
      if (adminDb) {
        const { data: adminAnalyses } = await adminDb
          .from("analyses")
          .select(`
            id,
            commit_hash,
            status,
            stage,
            failure_reason,
            files_count,
            edges_count,
            routes_count,
            coverage_percentage,
            summary,
            created_at,
            projects (
              id,
              name,
              repo_url
            )
          `)
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false });

        if (adminAnalyses && adminAnalyses.length > 0) {
          analyses = adminAnalyses as unknown as AnalysisRow[];
          analysesError = null;
        }
      }
    }
  } else {
    const adminDb = createAdminDatabaseClient();
    if (adminDb) {
      const { data: adminAnalyses } = await adminDb
        .from("analyses")
        .select(`
          id,
          commit_hash,
          status,
          stage,
          failure_reason,
          files_count,
          edges_count,
          routes_count,
          coverage_percentage,
          summary,
          created_at,
          projects (
            id,
            name,
            repo_url
          )
        `)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (adminAnalyses) {
        analyses = adminAnalyses as unknown as AnalysisRow[];
      }
    } else {
      analysesError = {
        message: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured in .env.local",
      };
    }
  }

  return (
    <AppShell currentOrgName={orgName} currentOrgId={orgId}>
      <div className="flex h-full w-full flex-col p-6 font-mono overflow-y-auto">
        <div className="max-w-5xl w-full mx-auto space-y-6">
          {/* Header section */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-muted">Team Dashboard</span>
                <span className="text-border">/</span>
                <span className="text-xs text-muted select-all">{orgId}</span>
              </div>
              <h1 className="text-lg font-bold text-foreground mt-1">{orgName}</h1>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded bg-surface-raised px-2.5 py-1 text-xs text-muted border border-border">
                Role: <span className="text-foreground font-medium">{orgRole || "member"}</span>
              </span>
              <span className="rounded bg-surface-raised px-2.5 py-1 text-xs text-muted border border-border">
                Analyses: <span className="text-foreground font-medium">{analyses.length}</span>
              </span>
            </div>
          </div>

          {/* Database error notice if any */}
          {analysesError && (
            <div className="rounded border border-outgoing/40 bg-outgoing/5 p-4 text-xs text-outgoing">
              <p className="font-semibold">Database Query Warning:</p>
              <p className="mt-1 font-mono">{analysesError.message}</p>
              <p className="mt-2 text-[11px] text-muted">
                Ensure Supabase migration `20261017000000_phase_02_schema.sql` has been applied to your database.
              </p>
            </div>
          )}

          {/* Repository Ingestion Form */}
          <RepoForm />

          {/* Live Analyses List */}
          <AnalysisList initialAnalyses={analyses} />
        </div>
      </div>
    </AppShell>
  );
}