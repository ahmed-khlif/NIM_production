export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }): React.ReactNode {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-nim-red">{eyebrow ?? "NIM Production"}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>{description ? <p className="mt-2 text-sm text-slate-500 sm:text-base">{description}</p> : null}</div>{action}</div>;
}
