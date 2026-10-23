import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/auth/session";
import { listWorkspaceInterfaces } from "@/lib/morph/interfaces";
import { InterfaceList } from "@/components/studio/version-list";

export const metadata: Metadata = { title: "Saved interfaces" };
export const dynamic = "force-dynamic";

export default async function SavedInterfacesPage() {
  const ctx = await getWorkspaceContext({ requireOnboarded: true });
  const db = getDb();
  const interfaces = await listWorkspaceInterfaces(db, ctx.workspace.id, ctx.user.id);

  return (
    <div className="px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Saved interfaces</h1>
        <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
          Interfaces in this workspace: the fixed classic baseline, the shared demo surface, and your
          personal interface. Switching only changes which schema the canvas renders — data is untouched.
        </p>
      </header>
      <div className="mt-4">
        <InterfaceList
          interfaces={interfaces.map((iface) => ({
            id: iface.id,
            name: iface.name,
            kind: iface.kind,
            ownerName: iface.ownerName,
            versionCount: iface.versionCount,
            lastUpdatedAt: iface.lastUpdatedAt,
            isActive: iface.id === ctx.preferences.active_interface_id,
          }))}
        />
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Baseline and demo interfaces are shared workspace resources; personal interfaces are private to
        their owner. Workspace membership is checked on every read and write.
      </p>
    </div>
  );
}
