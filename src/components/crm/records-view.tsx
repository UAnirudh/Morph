"use client";

import * as React from "react";
import { DataTable } from "@/components/crm/data-table";
import { RecordActions } from "@/components/crm/record-actions";
import { PipelineBoard } from "@/components/crm/pipeline-board";
import { CreateLeadDialog, CreateTaskDialog, LogActivityDialog } from "@/components/crm/record-actions";
import { Badge } from "@/components/ui/badge";
import type { ActionId, FieldSpec } from "@/lib/morph/config";
import type { RecordRow } from "@/lib/crm/data";
import type { FormOptions } from "@/lib/crm/form-options";
import { formatCurrency, formatNumber } from "@/lib/utils";

export interface RecordMetric {
  label: string;
  value: number;
  format: "currency" | "number" | "percent";
  hint: string;
}

export function RecordsView({
  title,
  description,
  entity,
  metrics,
  columns,
  rows,
  filterField,
  filterValues,
  rowActions,
  options,
  showPipeline = false,
  emptyHint,
  children,
}: {
  title: string;
  description: string;
  entity: "lead" | "deal" | "task" | "activity" | "company" | "contact";
  metrics: RecordMetric[];
  columns: FieldSpec[];
  rows: RecordRow[];
  filterField?: string;
  filterValues?: string[];
  rowActions: ActionId[];
  options: FormOptions;
  showPipeline?: boolean;
  emptyHint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-5 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {entity === "lead" ? (
            <>
              <CreateLeadDialog options={options} />
              <CreateTaskDialog options={options} />
            </>
          ) : null}
          {entity === "task" ? (
            <>
              <CreateTaskDialog options={options} />
              <LogActivityDialog options={options} />
            </>
          ) : null}
          {entity === "deal" ? <CreateTaskDialog options={options} /> : null}
          {entity === "activity" ? <LogActivityDialog options={options} /> : null}
          {entity === "company" || entity === "contact" ? (
            <CreateLeadDialog
              options={options}
              trigger={
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-[13px] text-muted-foreground hover:bg-secondary"
                >
                  Add related lead
                </button>
              }
            />
          ) : null}
        </div>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border/70 bg-card/70 p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {metric.format === "currency"
                ? formatCurrency(metric.value, metric.value >= 100_000)
                : metric.format === "percent"
                  ? `${formatNumber(metric.value)}%`
                  : formatNumber(metric.value)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{metric.hint}</p>
          </div>
        ))}
      </div>

      {showPipeline ? (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Pipeline</h2>
            <Badge tone="outline">drag-free stage moves via the arrow action</Badge>
          </div>
          <PipelineBoard rows={rows} limitPerStage={4} />
        </section>
      ) : null}

      <section className="mt-5 rounded-xl border border-border/70 bg-card/60 p-4">
        {children}
        <DataTable
          columns={columns}
          rows={rows}
          searchable
          sortField={columns[0]?.key}
          sortDirection="asc"
          filterField={filterField}
          filterValues={filterValues}
          pageSize={14}
          emptyHint={emptyHint}
          rowActions={(row) =>
            rowActions.length > 0 ? <RecordActions actions={rowActions} row={row} max={3} /> : null
          }
        />
      </section>
    </div>
  );
}
