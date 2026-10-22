import Link from "next/link";
import { Sparkles } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="morph-grid-bg relative hidden flex-col justify-between border-r border-border/70 p-12 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
            <Sparkles className="size-4 text-white" />
          </span>
          <span className="text-base font-semibold tracking-tight">Morph</span>
        </Link>
        <div className="max-w-md">
          <p className="label-caps">Adaptive interfaces</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            The interface should fit the person, not the other way around.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Morph compiles natural language into a typed interface schema. Every change is
            validated, versioned and reversible — and the CRM underneath never changes unless you
            change it.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4">
            {[
              { label: "Leads", value: "26" },
              { label: "Deals", value: "22" },
              { label: "Automations", value: "2" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border/70 bg-surface/60 p-3">
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</dt>
                <dd className="mt-1 text-xl font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">
          Seeded with deterministic demo data — safe to explore, reset from the demo panel.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <Sparkles className="size-4 text-white" />
            </span>
            <span className="font-semibold">Morph</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
