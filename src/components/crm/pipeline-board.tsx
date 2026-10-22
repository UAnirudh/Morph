"use client";

import { Badge } from "@/components/ui/badge";
import { RecordActions } from "@/components/crm/record-actions";
import type { RecordRow } from "@/lib/crm/data";
import { formatCurrency, titleCase } from "@/lib/utils";

const STAGES = ["prospecting", "qualification", "proposal", "negotiation", "won"] as const;

export function PipelineBoard({
  rows,
  limitPerStage = 4,
  metric = "amount",
  compact = false,
}: {
  rows: RecordRow[];
  limitPerStage?: number;
  metric?: "amount" | "count";
  compact?: boolean;
}) {
  const columns = STAGES.map((stage) => {
    const all = rows.filter((row) => row.stage === stage);
    return {
      stage,
      deals: all.sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, limitPerStage),
      total: all.reduce((sum, deal) => sum + Number(deal.amount), 0),
      count: all.length,
    };
  });

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      {columns.map((column) => (
        <div key={column.stage} className="rounded-lg border border-border/60 bg-surface-sunken/40">
          <div className="border-b border-border/60 px-2.5 py-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {titleCase(column.stage)}
              </p>
              <Badge tone="outline">{column.count}</Badge>
            </div>
            <p className="mt-0.5 text-xs font-semibold tabular-nums">
              {metric === "amount" ? formatCurrency(column.total, true) : `${column.count} deals`}
            </p>
          </div>
          <ul className="space-y-1.5 p-1.5">
            {column.deals.length === 0 ? (
              <li className="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[11px] text-muted-foreground">
                Empty
              </li>
            ) : (
              column.deals.map((deal) => (
                <li
                  key={deal.id ?? String(deal.name)}
                  className="group rounded-md border border-border/60 bg-card px-2 py-1.5 transition-colors hover:border-primary/40"
                >
                  <p className="truncate text-[11px] font-medium">{String(deal.name)}</p>
                  {!compact ? (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{String(deal.company)}</p>
                  ) : null}
                  <div className="mt-0.5 flex items-center justify-between gap-1">
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {formatCurrency(Number(deal.amount), true)}
                    </span>
                    <RecordActions actions={["advance_deal_stage"]} row={deal} max={1} />
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}
