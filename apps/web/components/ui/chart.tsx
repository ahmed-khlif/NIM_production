"use client";

import * as React from "react";
import {
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
  }
>;

const ChartContext = React.createContext<ChartConfig>({});

export function ChartContainer({
  config,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  config: ChartConfig;
}): React.ReactNode {
  const chartId = React.useId().replace(/:/g, "");
  const variables = Object.entries(config).reduce<Record<string, string>>(
    (styles, [key, value]) => {
      if (value.color) styles[`--color-${key}`] = value.color;
      return styles;
    },
    {},
  );

  return (
    <ChartContext.Provider value={config}>
      <div
        data-chart={chartId}
        className={cn("h-full w-full min-w-0", className)}
        style={variables as React.CSSProperties}
        {...props}
      >
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export function ChartTooltip(props: React.ComponentProps<typeof RechartsTooltip>): React.ReactNode {
  return <RechartsTooltip cursor={{ fill: "#f8fafc" }} {...props} />;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    name?: string | number;
    value?: string | number;
  }>;
  label?: React.ReactNode;
}): React.ReactNode {
  const config = React.useContext(ChartContext);
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      {label ? <p className="mb-2 font-medium text-slate-900">{label}</p> : null}
      <div className="space-y-1.5">
        {payload.map((item) => {
          const key = String(item.name ?? "value");
          return (
            <div key={key} className="flex items-center gap-2 text-slate-600">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color ?? config[key]?.color ?? "#94a3b8" }}
              />
              <span>{config[key]?.label ?? item.name ?? "Valeur"}</span>
              <span className="ml-auto pl-4 font-semibold tabular-nums text-slate-900">
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegend(props: React.ComponentProps<typeof RechartsLegend>): React.ReactNode {
  return <RechartsLegend {...props} />;
}

export function ChartLegendContent({
  payload,
}: {
  payload?: Array<{ value?: string | number; color?: string; dataKey?: string | number }>;
}): React.ReactNode {
  const config = React.useContext(ChartContext);
  if (!payload?.length) return null;

  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? "value");
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color ?? config[key]?.color ?? "#94a3b8" }}
            />
            {config[key]?.label ?? item.value ?? key}
          </div>
        );
      })}
    </div>
  );
}
