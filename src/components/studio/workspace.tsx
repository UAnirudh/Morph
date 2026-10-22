"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Eye, GitCompare, History, Loader2, RotateCcw, Save, Sparkles, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/misc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn, formatRelative } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { MorphCanvas } from "./canvas";
import { AiPanel, type HistoryItem } from "./ai-panel";
import type { PersonalizationSuggestion } from "@/lib/morph/suggestions";
import type { ProposalDTO } from "@/lib/morph/engine";
import type { ConfigData } from "@/lib/crm/data";
import type { FormOptions } from "@/lib/crm/form-options";
import type { JobRole, MorphConfig } from "@/lib/morph/config";
import {
  applyProposalAction,
  resetToRolePresetAction,
  saveCanvasAction,
  undoAction,
} from "@/lib/actions/studio";

export interface StudioWorkspaceProps {
  config: MorphConfig;
  data: ConfigData;
  options: FormOptions;
  role: JobRole;
  user: { name: string; email: string };
  workspaceName: string;
  interfaceName: string;
  history: HistoryItem[];
  suggestions: PersonalizationSuggestion[];
  starterPrompts: string[];
  engineLabel: string;
  notifications: Array<{ id: string; title: string; body: string; kind: string; createdAt: string; readAt: string | null }>;
}

function NotificationsMenu({
  notifications,
  unreadCount,
}: {
  notifications: StudioWorkspaceProps["notifications"];
  unreadCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen((current) => !current)} aria-label="Notifications">
            <span className="relative">
              <Bell />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full bg-primary text-[8px] font-semibold text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-10 z-40 w-80 animate-fade-in rounded-lg border border-border bg-surface-raised p-2 shadow-pop">
            <p className="px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Notifications
            </p>
            {notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-1">
                {notifications.slice(0, 6).map((notification) => (
                  <li
                    key={notification.id}
                    className={cn(
                      "rounded-md px-2 py-1.5",
                      notification.readAt ? "opacity-70" : "bg-primary/[0.06]",
                    )}
                  >
                    <p className="text-[11px] font-medium">{notification.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{notification.body}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">{formatRelative(notification.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function StudioWorkspace(props: StudioWorkspaceProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [config, setConfig] = React.useState<MorphConfig>(props.config);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [proposal, setProposal] = React.useState<ProposalDTO | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(true);
  // One Morph panel instance only: sidebar on wide screens, drawer below.
  const isWide = useMediaQuery("(min-width: 1280px)");

  React.useEffect(() => setConfig(props.config), [props.config]);

  const unread = props.notifications.filter((notification) => !notification.readAt).length;

  const previewActive = proposal !== null && previewMode === false && proposal.config !== null;
  const displayConfig = proposal?.config ?? config;
  const displayData = proposal?.previewData ?? props.data;
  const editable = !previewMode && !previewActive;

  async function persistReorder(components: MorphConfig["components"]) {
    const next = { ...config, components };
    setConfig(next);
    setSaving(true);
    const result = await saveCanvasAction(next);
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Could not save layout", description: result.error, tone: "error" });
      return;
    }
    toast({ title: "Layout saved", description: "A new version was recorded.", tone: "success" });
    router.refresh();
  }

  async function handleUndo() {
    setSaving(true);
    const result = await undoAction();
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Nothing to undo", description: result.error, tone: "error" });
      return;
    }
    toast({ title: "Rolled back", description: result.summary, tone: "success" });
    setProposal(null);
    router.refresh();
  }

  async function handleCheckpoint() {
    setSaving(true);
    const result = await saveCanvasAction(config);
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Could not save", description: result.error, tone: "error" });
      return;
    }
    toast({ title: "Version saved", description: "You can restore it from Versions.", tone: "success" });
    router.refresh();
  }

  async function applyPreview() {
    if (!proposal) return;
    setSaving(true);
    const result = await applyProposalAction(proposal.id);
    setSaving(false);
    if (!result.ok) {
      toast({ title: "Apply failed", description: result.error, tone: "error" });
      return;
    }
    setProposal(null);
    toast({ title: "Interface updated", description: result.summary, tone: "success" });
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="glass-bar sticky top-0 z-30">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 lg:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {displayConfig.header.title}
              </h1>
              {displayConfig.header.badge ? <Badge tone="primary">{displayConfig.header.badge}</Badge> : null}
              {previewActive ? (
                <Badge tone="warning" className="animate-morph-pulse">
                  Preview — not applied
                </Badge>
              ) : null}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {props.workspaceName} · {props.interfaceName}
              {displayConfig.header.subtitle ? ` · ${displayConfig.header.subtitle}` : ""}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {saving ? (
              <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> saving
              </span>
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                  <Eye className="size-3.5" />
                  Preview
                  <Switch
                    checked={previewMode}
                    onCheckedChange={setPreviewMode}
                    aria-label="Toggle preview mode"
                    className="scale-75"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent>Preview mode hides editing affordances and the Morph panel.</TooltipContent>
            </Tooltip>

            <Button variant="ghost" size="xs" onClick={handleUndo} disabled={saving}>
              <Undo2 />
              Undo
            </Button>

            <Button variant="ghost" size="xs" onClick={() => setResetOpen(true)} disabled={saving}>
              <RotateCcw />
              Reset
            </Button>

            <Button variant="secondary" size="xs" onClick={handleCheckpoint} disabled={saving}>
              <Save />
              Save version
            </Button>

            <Button variant="outline" size="xs" asChild>
              <Link href="/studio/compare">
                <GitCompare />
                Before / after
              </Link>
            </Button>

            <Button variant="ghost" size="xs" asChild>
              <Link href="/studio/versions">
                <History />
                Versions
              </Link>
            </Button>

            <div className="hidden lg:block">
              <NotificationsMenu notifications={props.notifications} unreadCount={unread} />
            </div>

            {!panelOpen ? (
              <Button size="xs" onClick={() => setPanelOpen(true)}>
                <Sparkles />
                Ask Morph
              </Button>
            ) : null}
          </div>
        </div>

        {previewActive ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-primary/30 bg-primary/10 px-4 py-2 text-[11px] text-primary lg:px-6">
            <Sparkles className="size-3.5" />
            <span className="font-medium">
              Preview of “{proposal?.prompt}” — the live interface is unchanged until you apply.
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="xs" variant="outline" onClick={() => setProposal(null)}>
                <X />
                Exit preview
              </Button>
              <Button size="xs" onClick={applyPreview} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                Apply change
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn("min-w-0 flex-1 overflow-y-auto", previewMode && "mx-auto w-full max-w-6xl")}>
          <div className="px-4 py-5 lg:px-6">
            <MorphCanvas
              config={displayConfig}
              data={displayData}
              options={props.options}
              role={props.role}
              currentUserName={props.user.name}
              editable={editable}
              onReorder={persistReorder}
            />
            <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              <span>
                {displayConfig.components.length} components · layout {displayConfig.layout.density} ·{" "}
                {displayConfig.accessibility.fontSize === "base" ? "default text" : `${displayConfig.accessibility.fontSize} text`}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-primary" />
                Rendered from a validated schema — data never changes with the layout.
              </span>
            </footer>
          </div>
        </div>

        {isWide && panelOpen && !previewMode ? (
          <aside className="w-[360px] shrink-0 border-l border-border/70 bg-surface/40">
            <AiPanel
              role={props.role}
              engineLabel={props.engineLabel}
              history={props.history}
              suggestions={props.suggestions}
              starterPrompts={props.starterPrompts}
              onPreview={setProposal}
              previewingId={proposal?.id ?? null}
              onApplied={() => router.refresh()}
              onCollapse={() => setPanelOpen(false)}
            />
          </aside>
        ) : null}
      </div>

      {/* Mobile / tablet Morph drawer */}
      {!isWide && !previewMode ? (
        <div className="border-t border-border/70 bg-surface/60">
          <div className="max-h-[65dvh] overflow-y-auto">
            <AiPanel
              role={props.role}
              engineLabel={props.engineLabel}
              history={props.history}
              suggestions={props.suggestions}
              starterPrompts={props.starterPrompts}
              onPreview={setProposal}
              previewingId={proposal?.id ?? null}
              onApplied={() => router.refresh()}
            />
          </div>
        </div>
      ) : null}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to your role template?</DialogTitle>
            <DialogDescription>
              This saves a new version built from the {props.role.replace("_", " ")} template. Your
              history stays intact, so you can restore the current layout afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Keep current
            </Button>
            <Button
              onClick={async () => {
                setSaving(true);
                const result = await resetToRolePresetAction();
                setSaving(false);
                setResetOpen(false);
                if (!result.ok) {
                  toast({ title: "Reset failed", description: result.error, tone: "error" });
                  return;
                }
                toast({ title: "Reset to role template", tone: "success" });
                router.refresh();
              }}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Reset layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
