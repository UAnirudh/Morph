import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { ROLE_LABELS, type JobRole } from "@/lib/morph/config";
import { Badge } from "@/components/ui/badge";
import { formatDate, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Workspaces" };
export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const counts = {
    leads: (await db.prepare("SELECT COUNT(*) AS c FROM leads WHERE workspace_id = ?").get(ctx.workspace.id) as { c: number }).c,
    deals: (await db.prepare("SELECT COUNT(*) AS c FROM deals WHERE workspace_id = ?").get(ctx.workspace.id) as { c: number }).c,
    tasks: (await db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE workspace_id = ?").get(ctx.workspace.id) as { c: number }).c,
    activities: (await db.prepare("SELECT COUNT(*) AS c FROM activities WHERE workspace_id = ?").get(ctx.workspace.id) as { c: number }).c,
  };

  return (
    <div className="px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Workspaces</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
          Every record, interface and workflow is scoped to a workspace. Authorization is enforced in
          server code on every read and write, not only in the UI.
        </p>
      </header>

      <section className="mt-4 rounded-xl border border-border/70 bg-card/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">
              {initials(ctx.workspace.name)}
            </span>
            <div>
              <p className="text-sm font-semibold">{ctx.workspace.name}</p>
              <p className="text-[11px] text-muted-foreground">
                Created {formatDate(ctx.workspace.created_at)} · slug {ctx.workspace.slug}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="primary">{counts.leads} leads</Badge>
                <Badge tone="info">{counts.deals} deals</Badge>
                <Badge tone="neutral">{counts.tasks} tasks</Badge>
                <Badge tone="neutral">{counts.activities} activities</Badge>
              </div>
            </div>
          </div>
          <Badge tone="outline">your role: {ROLE_LABELS[ctx.preferences.job_role as JobRole]}</Badge>
        </div>

        <div className="mt-4">
          <p className="label-caps">Members</p>
          <ul className="mt-2 divide-y divide-border/50">
            {ctx.teammates.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-2">
                <span className="grid size-7 place-items-center rounded-full bg-secondary text-[10px] font-semibold">
                  {initials(member.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {member.name}
                    {member.id === ctx.user.id ? <span className="ml-1 text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                </div>
                <Badge tone="outline">{ROLE_LABELS[member.jobRole as JobRole] ?? member.jobRole}</Badge>
                <Badge tone={member.role === "owner" ? "primary" : "neutral"}>{member.role}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-dashed border-border p-4">
        <p className="text-xs font-medium">Multiple workspaces & invitations</p>
        <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
          This MVP runs one workspace per account so the demo data stays coherent. The schema
          (workspaces, memberships, per-workspace interfaces) already supports many, and seat
          invitations need an email provider — neither is wired here. See docs/ARCHITECTURE.md for the
          extension points.
        </p>
      </section>
    </div>
  );
}
