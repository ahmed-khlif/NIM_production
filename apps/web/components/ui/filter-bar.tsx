import { SearchField } from "./search-field";

export function FilterBar({ children, placeholder }: { children?: React.ReactNode; placeholder?: string }): React.ReactNode {
  return <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div className="w-full max-w-sm"><SearchField placeholder={placeholder} /></div><div className="flex flex-wrap gap-2">{children}</div></div>;
}
