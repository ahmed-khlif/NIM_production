export function TimelineItem({ time, title, detail, tone = "neutral" }: { time: string; title: string; detail: string; tone?: "neutral" | "danger" | "success" }): React.ReactNode {
  const dot = tone === "danger" ? "bg-nim-red" : tone === "success" ? "bg-emerald-500" : "bg-slate-400";
  return <div className="relative flex gap-3 pb-5 last:pb-0"><div className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} /><div className="min-w-0 flex-1 border-b border-slate-100 pb-4 last:border-0"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><p className="text-sm font-medium text-slate-800">{title}</p><span className="text-xs text-slate-400">{time}</span></div><p className="mt-1 text-xs text-slate-500">{detail}</p></div></div>;
}
