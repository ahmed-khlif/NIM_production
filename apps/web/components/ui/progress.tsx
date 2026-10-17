import { cn } from "@nim/ui";

export function Progress({ value, className }: { value: number; className?: string }): React.ReactNode {
  const safeValue = Math.min(100, Math.max(0, value));
  return <div className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue}><div className="h-full rounded-full bg-nim-red transition-all" style={{ width: `${safeValue}%` }} /></div>;
}
