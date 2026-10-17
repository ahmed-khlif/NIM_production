import { cn } from "@nim/ui";
import type { LucideIcon } from "lucide-react";
import { Card } from "./card";

export function KpiCard({ label, value, detail, trend, icon: Icon, tone = "neutral", className }: { label: string; value: string; detail: string; trend?: string; icon: LucideIcon; tone?: "neutral" | "positive" | "warning" | "danger"; className?: string }): React.ReactNode {
  const accent = tone === "danger" ? "text-nim-red" : tone === "warning" ? "text-amber-600" : tone === "positive" ? "text-emerald-600" : "text-slate-900";
  return <Card className={cn("group p-3.5 transition-shadow hover:shadow-md sm:p-5", className)}><div className="flex items-start justify-between gap-2 sm:gap-4"><div className="min-w-0"><p className="text-xs text-slate-500 sm:text-sm">{label}</p><p className={cn("mt-2 text-2xl font-semibold tracking-tight sm:mt-3 sm:text-3xl", accent)}>{value}</p></div><div className={cn("shrink-0 rounded-lg bg-slate-50 p-2 transition-transform group-hover:scale-105 sm:p-2.5", accent)}><Icon className="size-4 sm:size-5" aria-hidden="true" /></div></div><div className="mt-3 flex items-end justify-between gap-2 text-[10px] leading-4 sm:mt-4 sm:text-xs"><span className="text-slate-500">{detail}</span>{trend ? <span className={cn("text-right font-semibold", accent)}>{trend}</span> : null}</div></Card>;
}
