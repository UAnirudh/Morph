"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  GitCompare,
  History,
  LayoutTemplate,
  Layers,
  LogOut,
  Settings,
  Sparkles,
  Workflow,
  Building2,
  Plus,
} from "lucide-react";
import { MorphIcon } from "@/components/studio/icon";
import { signOutAction } from "@/lib/actions/auth";
import { cn, initials } from "@/lib/utils";
import type { NavigationItem } from "@/lib/morph/config";

export interface SidebarProps {
  workspaceName: string;
  navItems: NavigationItem[];
  badges: Record<string, number | undefined>;
  user: { name: string; email: string };
  userId: string;
  workspaceId: string;
  interfaceName: string;
}

const STUDIO_LINKS = [
  { href: "/studio/workflows", label: "Workflows", icon: Workflow },
  { href: "/studio/compare", label: "Before / after", icon: GitCompare },
  { href: "/studio/versions", label: "Versions", icon: History },
  { href: "/studio/saved", label: "Saved interfaces", icon: Layers },
  { href: "/studio/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/studio/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/studio/settings", label: "Settings", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-primary/12 text-foreground shadow-[inset_2px_0_0_0_hsl(var(--primary))]"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground/80")} />
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function StudioSidebar(props: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/70 bg-surface/50 lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <Link href="/studio" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_8px_24px_-10px_hsl(var(--primary))]">
            <Sparkles className="size-4 text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Morph</span>
        </Link>
        <span className="ml-auto rounded border border-border/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          MVP
        </span>
      </div>

      <div className="px-3">
        <Link
          href="/studio/workspaces"
          className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-surface-raised/60 px-2.5 py-2 text-left transition-colors hover:border-primary/40"
        >
          <span className="grid size-6 place-items-center rounded bg-primary/15 text-[10px] font-semibold text-primary">
            {initials(props.workspaceName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium">{props.workspaceName}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{props.interfaceName}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Link>
      </div>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Workspace">
        <div>
          <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            Your workspace
          </p>
          <div className="space-y-0.5">
            {props.navItems.map((item) => (
              <NavLink
                key={item.id}
                href={item.href}
                label={item.label}
                active={pathname === item.href}
                badge={item.badge ? props.badges[item.badge] : undefined}
                icon={({ className }) => <MorphIcon name={item.icon} className={className} />}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            Studio
          </p>
          <div className="space-y-0.5">
            {STUDIO_LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                icon={link.icon}
                active={pathname === link.href}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-primary/20 bg-primary/[0.06] p-2.5">
          <p className="text-[11px] font-medium text-foreground">Adaptive interface</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Ask for a change in the Morph panel. Every version is validated and reversible.
          </p>
          <Link
            href="/studio/versions"
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            See version history
          </Link>
        </div>
      </nav>

      <div className="border-t border-border/70 p-3">
        <div className="flex items-center gap-2 rounded-lg px-1 py-1">
          <span className="grid size-7 place-items-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
            {initials(props.user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium">{props.user.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{props.user.email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

export function StudioMobileBar({ navItems, workspaceName }: { navItems: NavigationItem[]; workspaceName: string }) {
  const pathname = usePathname();
  // The workspace nav may already link to Workflows when an interface was
  // generated around automations, so only add the fallback when it is missing.
  const items: NavigationItem[] = navItems.slice(0, 5);
  if (!items.some((item) => item.href === "/studio/workflows")) {
    items.push({ id: "nav-workflows", label: "Workflows", href: "/studio/workflows", icon: "workflow" });
  }
  items.push({ id: "nav-more", label: "More", href: "/studio/versions", icon: "layers" });
  return (
    <div className="glass-bar sticky top-0 z-40 lg:hidden">
      <div className="flex h-12 items-center gap-2 px-4">
        <Link href="/studio" className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-600">
            <Sparkles className="size-3 text-white" />
          </span>
          <span className="text-[13px] font-semibold">Morph</span>
        </Link>
        <span className="truncate text-[11px] text-muted-foreground">· {workspaceName}</span>
        <Link href="/studio/settings" className="ml-auto rounded p-1.5 text-muted-foreground" aria-label="Settings">
          <Settings className="size-4" />
        </Link>
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Workspace sections">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              <MorphIcon name={item.icon} className="size-3" />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/studio"
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[11px] text-primary"
        >
          <Plus className="size-3" />
          New
        </Link>
      </nav>
    </div>
  );
}
