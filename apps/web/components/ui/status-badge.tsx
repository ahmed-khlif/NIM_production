import { cn } from "@nim/ui";

const tones = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  info: "bg-blue-50 text-blue-700 ring-blue-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: keyof typeof tones }): React.ReactNode {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", tones[tone])}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{children}</span>;
}
