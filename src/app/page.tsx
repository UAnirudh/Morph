import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  GitCompare,
  Layers,
  Lock,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/lib/auth/session";

const PILLARS = [
  {
    icon: Sparkles,
    title: "Describe it, don't configure it",
    body: "“Show my pipeline, overdue follow-ups and top opportunities.” Morph compiles that sentence into a validated interface schema.",
  },
  {
    icon: Layers,
    title: "More than a theme",
    body: "Morph changes which data is surfaced, how work is laid out and which actions are one click away — not just colours.",
  },
  {
    icon: Lock,
    title: "Safe by construction",
    body: "Generated UI is untrusted input. Every change is validated against a component registry, dataset allowlist and action contract.",
  },
];

const DEMOS = [
  {
    role: "Sales manager",
    prompt: "Prioritize revenue, pipeline health, and overdue follow-ups.",
    icon: Users,
  },
  {
    role: "Sales representative",
    prompt: "A simple workspace focused on my assigned leads and today's tasks.",
    icon: BadgeCheck,
  },
  {
    role: "Operations manager",
    prompt: "Show team workload, unfinished tasks, and bottlenecks.",
    icon: Workflow,
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();
  return (
    <div className="min-h-dvh">
      <header className="glass-bar sticky top-0 z-40">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Morph home">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_8px_24px_-10px_hsl(var(--primary))]">
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Morph</span>
            <Badge tone="primary" className="ml-1 hidden sm:inline-flex">
              MVP
            </Badge>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href={user ? "/studio" : "/signup"}>
              <Button size="sm">
                {user ? "Open workspace" : "Get started"}
                <ArrowRight />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="morph-grid-bg relative overflow-hidden border-b border-border/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
            <div className="max-w-3xl">
              <Badge tone="outline" className="mb-6 gap-2 border-primary/30 bg-primary/10 text-primary">
                <span className="size-1.5 animate-morph-pulse rounded-full bg-primary" />
                Adaptive software, not another dashboard builder
              </Badge>
              <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
                Describe how you want your software to work.
                <span className="block bg-gradient-to-r from-violet-300 via-violet-400 to-sky-300 bg-clip-text text-transparent">
                  Morph makes it happen.
                </span>
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Every CRM forces the same interface on every person. Morph reads your instruction,
                compiles it into a validated interface configuration and renders it instantly — on top
                of the same, unchanged business data.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href={user ? "/studio" : "/signup"}>
                  <Button size="lg">
                    {user ? "Open your workspace" : "Create a workspace"}
                    <ArrowRight />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button size="lg" variant="outline">
                    Explore the live demo
                  </Button>
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Seeded with a full CRM — 26 leads, 22 deals, 32 tasks and a working automation engine.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-border/60 bg-surface/40">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.title} className="panel p-6">
                <span className="mb-4 inline-grid size-10 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <pillar.icon className="size-5" />
                </span>
                <h2 className="text-sm font-semibold tracking-tight">{pillar.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label-caps">One dataset, three interfaces</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Same CRM. Different people. Radically different software.
              </h2>
            </div>
            <Link href="/studio/compare" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              See the before/after demo <GitCompare className="size-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {DEMOS.map((demo) => (
              <article key={demo.role} className="panel group relative overflow-hidden p-6">
                <div className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-primary/10 blur-2xl transition group-hover:bg-primary/20" />
                <demo.icon className="size-5 text-primary" />
                <h3 className="mt-4 text-sm font-semibold">{demo.role}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">“{demo.prompt}”</p>
                <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
                  Compiled live by Morph Engine
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border/60 bg-surface/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Built for the TiE Young Entrepreneurs demo</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                A working vertical slice: functional CRM, schema-driven renderer, transformation
                engine with preview and rollback, preferences and a real workflow engine.
              </p>
            </div>
            <Link href="/login">
              <Button size="lg">
                Enter the demo workspace
                <ArrowRight />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Morph — the adaptive interface layer. MVP build.</p>
          <p>Every transformation is versioned, validated and reversible.</p>
        </div>
      </footer>
    </div>
  );
}
