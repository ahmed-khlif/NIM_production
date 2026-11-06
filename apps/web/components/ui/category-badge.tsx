import { cn } from "@/lib/utils";

const categoryTones = {
  slate: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  violet: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200",
  blue: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200",
  amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200",
  teal: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-200",
} as const;

export type CategoryTone = keyof typeof categoryTones;

export function CategoryBadge({
  children,
  tone = "slate",
  className,
}: {
  children: React.ReactNode;
  tone?: CategoryTone;
  className?: string;
}): React.ReactNode {
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none", categoryTones[tone], className)}>
      {children}
    </span>
  );
}
