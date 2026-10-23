import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getActiveInterface, listVersions, toVersionDTO } from "@/lib/morph/interfaces";
import type { JobRole } from "@/lib/morph/config";
import { VersionList } from "@/components/studio/version-list";

export const metadata: Metadata = { title: "Versions" };
export const dynamic = "force-dynamic";

export default async function VersionsPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const active = await getActiveInterface(db, {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    preferences: ctx.preferences,
    jobRole: ctx.preferences.job_role as JobRole,
  });
  const versions = (await listVersions(db, active.iface.id, 40)).map((row) => toVersionDTO(db, row));

  return (
    <div className="px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Version history</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
          Every transformation, manual layout change and restore is stored as a new immutable version.
          Undo re-applies the previous configuration rather than deleting anything.
        </p>
      </header>
      <div className="mt-4">
        <VersionList versions={versions} interfaceName={active.iface.name} />
      </div>
    </div>
  );
}
