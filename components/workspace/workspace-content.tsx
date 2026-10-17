import { auth, clerkClient } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shell/app-shell";
import { OrgSync } from "@/components/org-sync";
import { createServerDatabaseClient } from "@/lib/supabase/server";

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
  } else {
    analysesError = {
      message: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured in .env.local",
    };
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

          {/* Analyses List or Empty State */}
          {analyses.length > 0 ? (
            <div className="space-y-3">
              <span className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                Repository Analyses
              </span>

              <div className="grid gap-3">
                {analyses.map((analysis) => {
                  const project = Array.isArray(analysis.projects)
                    ? analysis.projects[0]
                    : analysis.projects;

                  const isCompleted = analysis.status === "completed";
                  const isParsing = analysis.status === "parsing" || analysis.status === "pending";
                  const isFailed = analysis.status === "failed";

                  return (
                    <div
                      key={analysis.id}
                      className="rounded border border-border bg-surface p-4 transition-colors hover:border-muted/40"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-bold text-foreground">
                              {project?.name || "Unknown Repository"}
                            </span>
                            {analysis.commit_hash && (
                              <span className="rounded bg-surface-raised px-2 py-0.5 text-[10px] text-muted border border-border">
                                {analysis.commit_hash.slice(0, 7)}
                              </span>
                            )}
                          </div>
                          {project?.repo_url && (
                            <p className="text-xs text-muted mt-1 select-all">{project.repo_url}</p>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div>
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1.5 rounded bg-incoming/10 px-2.5 py-1 text-xs text-incoming border border-incoming/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-incoming" />
                              Completed
                            </span>
                          )}
                          {isParsing && (
                            <span className="inline-flex items-center gap-1.5 rounded bg-outgoing/10 px-2.5 py-1 text-xs text-outgoing border border-outgoing/30">
                              <span className="h-1.5 w-1.5 rounded-full bg-outgoing animate-pulse" />
                              {analysis.stage ? `Parsing: ${analysis.stage}` : "Parsing..."}
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1.5 rounded bg-red-500/10 px-2.5 py-1 text-xs text-red-500 border border-red-500/30">
                              Failed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Summary or Stage */}
                      {analysis.summary && (
                        <p className="text-xs text-foreground/90 mt-3 pt-3 border-t border-border/50">
                          {analysis.summary}
                        </p>
                      )}

                      {/* Metrics bar */}
                      <div className="mt-3 flex items-center gap-6 pt-3 border-t border-border/40 text-xs text-muted">
                        <div>
                          Files: <span className="text-foreground font-medium">{analysis.files_count}</span>
                        </div>
                        <div>
                          Edges: <span className="text-foreground font-medium">{analysis.edges_count}</span>
                        </div>
                        <div>
                          Routes: <span className="text-foreground font-medium">{analysis.routes_count}</span>
                        </div>
                        {analysis.coverage_percentage !== null && (
                          <div>
                            Coverage:{" "}
                            <span className="text-foreground font-medium">
                              {Number(analysis.coverage_percentage).toFixed(1)}%
                            </span>
                          </div>
                        )}
                        <div className="ml-auto text-[11px]">
                          {new Date(analysis.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Empty State for a team that has never run an analysis */
            <div className="rounded border border-dashed border-border bg-surface/50 p-12 text-center">
              <div className="mx-auto h-10 w-10 rounded-full bg-surface-raised flex items-center justify-center border border-border mb-3">
                <span className="text-base text-muted font-mono">∅</span>
              </div>
              <h2 className="text-sm font-semibold text-foreground">No analyses found for this team</h2>
              <p className="mt-1 text-xs text-muted max-w-sm mx-auto leading-relaxed">
                This organization has not run any repository analyses yet. Analyses for this organization will appear here automatically.
              </p>
              <div className="mt-4 inline-block text-[11px] text-muted rounded bg-surface-raised px-3 py-1.5 border border-border">
                Multi-tenant RLS active: Switching organizations in the top header will display that team&apos;s records.
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}