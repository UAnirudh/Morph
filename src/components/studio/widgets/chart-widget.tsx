"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_DATASETS, type ChartComponent } from "@/lib/morph/config";
import type { RecordRow } from "@/lib/crm/data";
import { formatCurrency, formatNumber, titleCase } from "@/lib/utils";

const PALETTE = ["#a78bfa", "#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#818cf8", "#22d3ee"];

const AXIS_STYLE = {
  fontSize: 11,
  fill: "hsl(222 16% 64%)",
} as const;

const GRID_STROKE = "hsl(226 26% 18%)";

function formatValue(key: string, value: number): string {
  if (/(revenue|value|amount)/i.test(key)) return formatCurrency(value, true);
  return formatNumber(value);
}

interface Props {
  component: ChartComponent;
  rows: RecordRow[];
}

export function ChartWidget({ component, rows }: Props) {
  const meta = CHART_DATASETS[component.dataset];
  const xKey = meta.x;
  const yKey = meta.y;
  const secondaryKey = "secondary" in meta ? (meta.secondary as string | undefined) : undefined;

  const data = rows.map((row) => ({
    ...row,
    [xKey]: String(row[xKey] ?? ""),
    [yKey]: Number(row[yKey] ?? 0),
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
        No data for this chart yet.
      </div>
    );
  }

  const tooltipStyle = {
    background: "hsl(227 34% 10%)",
    border: "1px solid hsl(226 26% 18%)",
    borderRadius: 10,
    fontSize: 12,
    color: "hsl(220 33% 96%)",
    padding: "8px 10px",
  } as const;

  if (component.chartType === "pie") {
    const pieData = data.map((row) => ({ name: String(row[xKey]), value: Number(row[yKey]) }));
    return (
      <ResponsiveContainer width="100%" height={component.height}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="hsl(226 40% 7%)"
            strokeWidth={2}
          >
            {pieData.map((entry, index) => (
              <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown) => formatNumber(Number(value))} />
          {component.showLegend ? (
            <Legend
              verticalAlign="bottom"
              height={28}
              formatter={(value) => <span className="text-[11px] text-muted-foreground">{value}</span>}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (component.chartType === "funnel") {
    const funnelData = data.map((row, index) => ({
      name: String(row[xKey]),
      value: Number(row[yKey]),
      fill: PALETTE[index % PALETTE.length],
    }));
    return (
      <ResponsiveContainer width="100%" height={component.height}>
        <FunnelChart>
          <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown) => formatNumber(Number(value))} />
          <Funnel dataKey="value" data={funnelData} isAnimationActive={false}>
            <LabelList position="right" fill="hsl(220 33% 96%)" stroke="none" dataKey="name" fontSize={11} />
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
    );
  }

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
      <XAxis dataKey={xKey} tick={AXIS_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
      <YAxis
        tick={AXIS_STYLE}
        axisLine={false}
        tickLine={false}
        width={48}
        tickFormatter={(value: number) => formatValue(yKey, value)}
      />
      <Tooltip
        contentStyle={tooltipStyle}
        cursor={{ fill: "hsl(258 90% 66% / 0.08)" }}
        formatter={(value: unknown, name: unknown): [string, string] => [
          formatValue(String(name), Number(value)),
          titleCase(String(name)),
        ]}
        labelStyle={{ color: "hsl(220 33% 96%)", fontWeight: 500 }}
      />
      {component.showLegend ? (
        <Legend
          verticalAlign="top"
          height={26}
          formatter={(value) => <span className="text-[11px] text-muted-foreground">{titleCase(String(value))}</span>}
        />
      ) : null}
    </>
  );

  if (component.chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={component.height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {common}
          <Line type="monotone" dataKey={yKey} stroke={PALETTE[0]} strokeWidth={2.2} dot={false} />
          {secondaryKey ? <Line type="monotone" dataKey={secondaryKey} stroke={PALETTE[1]} strokeWidth={1.6} dot={false} /> : null}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (component.chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height={component.height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`gradient-${component.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.45} />
              <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {common}
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={PALETTE[0]}
            strokeWidth={2.2}
            fill={`url(#gradient-${component.id})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={component.height}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        {common}
        <Bar dataKey={yKey} radius={[6, 6, 0, 0]} maxBarSize={44} fill={PALETTE[0]}>
          {data.map((entry, index) => (
            <Cell key={String(entry[xKey])} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Bar>
        {secondaryKey && component.stack ? (
          <Bar dataKey={secondaryKey} radius={[6, 6, 0, 0]} maxBarSize={44} fill={PALETTE[1]} stackId="a" />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}
