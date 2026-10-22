"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import { FieldCell } from "@/components/studio/value";
import type { FieldSpec } from "@/lib/morph/config";
import type { RecordRow } from "@/lib/crm/data";

export interface DataTableProps {
  columns: FieldSpec[];
  rows: RecordRow[];
  searchable?: boolean;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  filterField?: string;
  filterValues?: string[];
  compact?: boolean;
  pageSize?: number;
  emptyHint?: string;
  rowActions?: (row: RecordRow) => React.ReactNode;
  onRowClick?: (row: RecordRow) => void;
}

function compare(a: string | number | boolean | null, b: string | number | boolean | null): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function DataTable({
  columns,
  rows,
  searchable = false,
  sortField,
  sortDirection = "desc",
  filterField,
  filterValues,
  compact = false,
  pageSize,
  emptyHint,
  rowActions,
  onRowClick,
}: DataTableProps) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<string>("all");
  const [sort, setSort] = React.useState<{ field: string; direction: "asc" | "desc" } | null>(
    sortField ? { field: sortField, direction: sortDirection } : null,
  );
  const [page, setPage] = React.useState(0);

  const filterOptions = React.useMemo(() => {
    if (!filterField || !filterValues?.length) return [];
    return filterValues;
  }, [filterField, filterValues]);

  const filtered = React.useMemo(() => {
    let result = rows;
    if (filter !== "all" && filterField) {
      result = result.filter((row) => String(row[filterField]) === filter);
    }
    if (query.trim()) {
      const term = query.trim().toLowerCase();
      result = result.filter((row) =>
        columns.some((column) => String(row[column.key] ?? "").toLowerCase().includes(term)),
      );
    }
    if (sort) {
      result = [...result].sort((a, b) => {
        const order = compare(a[sort.field] ?? null, b[sort.field] ?? null);
        return sort.direction === "asc" ? order : -order;
      });
    }
    return result;
  }, [rows, filter, filterField, query, columns, sort]);

  const pageCount = pageSize ? Math.ceil(filtered.length / pageSize) : 1;
  const clampedPage = Math.min(page, Math.max(0, pageCount - 1));
  const visible = pageSize ? filtered.slice(clampedPage * pageSize, (clampedPage + 1) * pageSize) : filtered;

  React.useEffect(() => {
    setPage(0);
  }, [query, filter]);

  function toggleSort(field: string) {
    setSort((current) => {
      if (current?.field === field) {
        return { field, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { field, direction: "asc" };
    });
  }

  return (
    <div className="space-y-3">
      {(searchable || filterOptions.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? (
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search…"
                aria-label="Search table"
                className={cn("pl-8", compact ? "h-8 text-xs" : "h-8 text-xs")}
              />
            </div>
          ) : null}
          {filterOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter">
              {["all", ...filterOptions].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors",
                    filter === option
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border/70 text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {option === "all" ? "All" : option.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="text-xs text-muted-foreground">{emptyHint ?? "Nothing matches those filters yet."}</p>
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/70">
                {columns.map((column) => {
                  const active = sort?.field === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={cn(
                        "whitespace-nowrap px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
                        compact ? "py-1" : "py-2",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                          active && "text-foreground",
                        )}
                        aria-label={`Sort by ${column.label}`}
                      >
                        {column.label}
                        {active ? (
                          sort?.direction === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : null}
                      </button>
                    </th>
                  );
                })}
                {rowActions ? (
                  <th scope="col" className="px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, rowIndex) => (
                <tr
                  key={row.id ?? `row-${rowIndex}`}
                  className={cn(
                    "border-b border-border/40 text-xs transition-colors last:border-0",
                    onRowClick && "cursor-pointer hover:bg-secondary/40",
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.key}
                      className={cn(
                        "max-w-[220px] truncate px-2 align-middle text-muted-foreground",
                        compact ? "py-1.5" : "py-2.5",
                        index === 0 && "font-medium text-foreground",
                      )}
                    >
                      <FieldCell value={row[column.key] ?? null} field={column} />
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="px-2 py-1 text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">{rowActions(row)}</div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          {filtered.length === 0
            ? "0 records"
            : `${formatNumber(filtered.length)} record${filtered.length === 1 ? "" : "s"}`}
          {rows.length !== filtered.length ? ` of ${formatNumber(rows.length)}` : ""}
        </span>
        {pageSize && pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={clampedPage === 0}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {clampedPage + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={clampedPage >= pageCount - 1}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
