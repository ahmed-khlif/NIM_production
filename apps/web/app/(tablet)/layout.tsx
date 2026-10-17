export default function TabletRouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return <div className="min-h-dvh bg-slate-100 text-slate-950">{children}</div>;
}
