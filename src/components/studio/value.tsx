import { Badge } from "@/components/ui/badge";
import type { FieldSpec } from "@/lib/morph/config";
import { formatCurrency, formatDate, formatNumber, formatRelative, titleCase } from "@/lib/utils";

export function formatFieldValue(
  value: string | number | boolean | null | undefined,
  field: Pick<FieldSpec, "type">,
): string {
  if (value === null || value === undefined) return "—";
  switch (field.type) {
    case "currency":
      return formatCurrency(Number(value), Number(value) >= 1_000_000);
    case "number":
      return formatNumber(Number(value));
    case "percent":
      return `${formatNumber(Number(value))}%`;
    case "date":
      return formatDate(String(value));
    case "relative_date":
      return formatRelative(String(value));
    case "boolean":
      return value ? "Yes" : "No";
    case "badge":
      return titleCase(String(value));
    default:
      return String(value);
  }
}

const STATUS_TONES: Record<string, "success" | "warning" | "danger" | "info" | "primary" | "neutral"> = {
  new: "info",
  contacted: "primary",
  qualified: "success",
  unqualified: "neutral",
  converted: "success",
  prospecting: "neutral",
  qualification: "info",
  proposal: "primary",
  negotiation: "warning",
  won: "success",
  lost: "danger",
  open: "info",
  in_progress: "warning",
  done: "success",
  high: "danger",
  medium: "warning",
  low: "neutral",
  inbound: "info",
  outbound: "primary",
  referral: "success",
  event: "warning",
  partner: "neutral",
  call: "info",
  email: "primary",
  meeting: "success",
  note: "neutral",
  task: "info",
  stage_change: "warning",
  workflow: "primary",
  system: "neutral",
};

export function StatusBadge({ value }: { value: string }) {
  const tone = STATUS_TONES[value?.toLowerCase?.()] ?? "neutral";
  return <Badge tone={tone}>{titleCase(String(value))}</Badge>;
}

export function FieldCell({
  value,
  field,
}: {
  value: string | number | boolean | null;
  field: FieldSpec;
}) {
  const content = formatFieldValue(value, field);
  if (field.type === "badge") return <StatusBadge value={String(value ?? "")} />;
  if (field.type === "boolean" && value) return <Badge tone="warning">Flagged</Badge>;
  if (field.type === "person") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
          {content
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </span>
        <span className="truncate">{content}</span>
      </span>
    );
  }
  return <span className={field.type === "currency" ? "font-mono tabular-nums" : undefined}>{content}</span>;
}
