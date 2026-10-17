export function DataTableShell({ children, empty = false }: { children: React.ReactNode; empty?: boolean }): React.ReactNode {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel" data-empty={empty}>{children}</div>;
}
