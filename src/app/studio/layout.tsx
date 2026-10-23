import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getActiveInterface } from "@/lib/morph/interfaces";
import { resolveMetric } from "@/lib/crm/data";
import type { JobRole } from "@/lib/morph/config";
import { StudioSidebar, StudioMobileBar } from "@/components/studio/sidebar";
import { AccessibilityBridge } from "@/components/studio/accessibility-bridge";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Studio" };

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const active = await getActiveInterface(db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });
  const scope = { workspaceId: ctx.workspace.id, userId: ctx.user.id };
  const badges = {
    overdue_followups: await resolveMetric(db, scope, "overdue_followups"),
    task_due_today: await resolveMetric(db, scope, "task_due_today"),
    flagged_leads: await resolveMetric(db, scope, "flagged_leads"),
  };

  return (
    <ToastProvider>
      <AccessibilityBridge
        fontSize={active.config.accessibility.fontSize}
        highContrast={active.config.accessibility.highContrast}
        reduceMotion={active.config.accessibility.reduceMotion}
        density={active.config.layout.density}
      />
      <div className="flex min-h-dvh bg-background">
        <StudioSidebar
          workspaceName={ctx.workspace.name}
          navItems={active.config.navigation.items}
          badges={badges}
          user={{ name: ctx.user.name, email: ctx.user.email }}
          userId={ctx.user.id}
          workspaceId={ctx.workspace.id}
          interfaceName={active.iface.name}
        />
        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <StudioMobileBar navItems={active.config.navigation.items} workspaceName={ctx.workspace.name} />
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
