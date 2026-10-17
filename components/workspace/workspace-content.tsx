import { auth, clerkClient } from "@clerk/nextjs/server";
import { AppShell } from "@/components/shell/app-shell";
import { OrgSync } from "@/components/org-sync";

export async function WorkspaceContent() {
  const { userId, orgId, orgRole, orgSlug } = await auth.protect();
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

  // Active organization exists: fetch details to render on first paint
  const org = await client.organizations.getOrganization({ organizationId: orgId });

  return (
    <AppShell currentOrgName={org.name} currentOrgId={org.id}>
      <div className="flex h-full w-full flex-col p-6 font-mono">
        <div className="max-w-2xl rounded border border-border bg-surface p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-muted">Active Workspace</span>
              <h1 className="text-base font-semibold text-foreground">{org.name}</h1>
            </div>
            <span className="rounded bg-surface-raised px-2 py-0.5 text-[11px] text-muted border border-border">
              {orgRole || "member"}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-xs text-muted">
            <div className="flex justify-between py-1 border-b border-border/40">
              <span>Organization ID</span>
              <span className="text-foreground select-all">{org.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span>Slug</span>
              <span className="text-foreground">{orgSlug || org.slug || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/40">
              <span>Members Count</span>
              <span className="text-foreground">{org.membersCount ?? 1}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Server-rendered</span>
              <span className="text-incoming">true (first paint)</span>
            </div>
          </div>

          <div className="mt-6 rounded bg-surface-raised p-3 text-[11px] text-muted border border-border">
            <p>
              Use the organization switcher in the header to switch teams or invite teammates.
              Accepted invitations automatically land members in this workspace.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}