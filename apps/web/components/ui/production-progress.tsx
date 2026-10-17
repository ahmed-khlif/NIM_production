import { Progress } from "./progress";

export function ProductionProgress({ completed, total }: { completed: number; total: number }): React.ReactNode {
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return <div className="min-w-28"><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">{completed} / {total}</span><span className="text-slate-400">{percentage}%</span></div><Progress value={percentage} /></div>;
}
