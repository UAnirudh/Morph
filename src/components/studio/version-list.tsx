"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRelative, titleCase } from "@/lib/utils";
import { restoreVersionAction, switchInterfaceAction, undoAction } from "@/lib/actions/studio";

export interface VersionListItem {
  id: string;
  version: number;
  summary: string;
  source: string;
  createdAt: string;
  createdByName: string | null;
  isCurrent: boolean;
  componentCount: number;
}

const SOURCE_TONE: Record<string, "primary" | "success" | "warning" | "neutral" | "info" | "danger"> = {
  ai: "success",
  "local-planner": "warning",
  manual: "info",
  restore: "neutral",
  undo: "neutral",
  seed: "neutral",
  template: "primary",
  demo: "primary",
};

export function VersionList({ versions, interfaceName }: { versions: VersionListItem[]; interfaceName: string }) {
  const [pending, setPending] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {versions.length} version{versions.length === 1 ? "" : "s"} of <span className="text-foreground">{interfaceName}</span>.
          Restoring writes a new version — history is never rewritten.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending !== null}
          onClick={async () => {
            setPending("undo");
            const result = await undoAction();
            setPending(null);
            if (!result.ok) {
              toast({ title: "Nothing to undo", description: result.error, tone: "error" });
              return;
            }
            toast({ title: "Rolled back", description: result.summary, tone: "success" });
            router.refresh();
          }}
        >
          {pending === "undo" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Undo last change
        </Button>
      </div>

      <ol className="space-y-2">
        {versions.map((version) => (
          <li
            key={version.id}
            className="flex flex-wrap items-start gap-3 rounded-lg border border-border/70 bg-card/60 p-3"
          >
            <span className="mt-0.5 grid size-8 place-items-center rounded-lg border border-border/70 bg-surface-sunken/50 text-[11px] font-semibold tabular-nums">
              v{version.version}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium">{version.summary || "Interface updated"}</p>
                {version.isCurrent ? <Badge tone="success">live</Badge> : null}
                <Badge tone={SOURCE_TONE[version.source] ?? "neutral"}>{titleCase(version.source)}</Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatDate(version.createdAt)} · {formatRelative(version.createdAt)} ·{" "}
                {version.createdByName ?? "system"} · {version.componentCount} components
              </p>
            </div>
            {!version.isCurrent ? (
              <Button
                size="xs"
                variant="secondary"
                disabled={pending !== null}
                onClick={async () => {
                  setPending(version.id);
                  const result = await restoreVersionAction(version.id);
                  setPending(null);
                  if (!result.ok) {
                    toast({ title: "Restore failed", description: result.error, tone: "error" });
                    return;
                  }
                  toast({ title: `Restored v${version.version}`, tone: "success" });
                  router.refresh();
                }}
              >
                {pending === version.id ? <Loader2 className="animate-spin" /> : <History />}
                Restore
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function InterfaceList({
  interfaces,
}: {
  interfaces: Array<{
    id: string;
    name: string;
    kind: string;
    ownerName: string | null;
    versionCount: number;
    lastUpdatedAt: string | null;
    isActive: boolean;
  }>;
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {interfaces.map((iface) => (
        <div key={iface.id} className="rounded-xl border border-border/70 bg-card/60 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{iface.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {titleCase(iface.kind)} · {iface.ownerName ?? "shared"} · {iface.versionCount} version
                {iface.versionCount === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                {iface.lastUpdatedAt ? `updated ${formatRelative(iface.lastUpdatedAt)}` : "never updated"}
              </p>
            </div>
            {iface.isActive ? <Badge tone="success">active</Badge> : null}
          </div>
          {!iface.isActive ? (
            <Button
              size="xs"
              variant="secondary"
              className="mt-3"
              disabled={pending !== null}
              onClick={async () => {
                setPending(iface.id);
                const result = await switchInterfaceAction(iface.id);
                setPending(null);
                if (!result.ok) {
                  toast({ title: "Could not switch", description: result.error, tone: "error" });
                  return;
                }
                toast({ title: `Now showing ${iface.name}`, tone: "success" });
                router.refresh();
              }}
            >
              {pending === iface.id ? <Loader2 className="animate-spin" /> : null}
              Open this interface
            </Button>
          ) : (
            <Button size="xs" variant="outline" className="mt-3" asChild>
              <a href="/studio">Open canvas</a>
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
