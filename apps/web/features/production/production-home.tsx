"use client";

import { Table } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Factory, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PieceProductionStatusBadge } from "@/components/ui/production-status-badge";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, getProductionMonitorRequest } from "@/features/auth/auth-client";

const statusOptions = [
  { value: "ALL", label: "Tous les états" },
  { value: "FACONNEE", label: "Façonnée" },
  { value: "AFFECTEE", label: "Affectée" },
  { value: "LANCEE", label: "En cours" },
  { value: "FABRIQUEE", label: "Fabriquée" },
];

function Status({ value }: { value: string }): React.ReactNode {
  if (value === "NON_CONFORME") return <StatusBadge tone="danger" className="min-h-7 px-3">Non conforme</StatusBadge>;
  if (value === "FACONNEE" || value === "AFFECTEE" || value === "LANCEE" || value === "FABRIQUEE") return <PieceProductionStatusBadge status={value} className="min-h-7 px-3" />;
  return <StatusBadge tone="neutral" className="min-h-7 px-3">{value}</StatusBadge>;
}

export function ProductionHome(): React.ReactNode {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "status", sortDirection: "asc" });

  useEffect(() => {
    if (isLoading || !user) return;
    if (user.role === "OPERATOR") router.replace("/production/tablet");
    else if (user.role === "PRODUCTION_MANAGER") router.replace("/offers?status=IN_PRODUCTION");
    else if (user.role !== "ADMIN") router.replace("/unauthorized");
  }, [isLoading, router, user]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [debouncedSearch, status, pageSize]);

  const query = useQuery({
    queryKey: ["production", "global-monitor", page, pageSize, debouncedSearch, status, sorting],
    queryFn: () => getProductionMonitorRequest({ page, pageSize, search: debouncedSearch, ...sorting, ...(status !== "ALL" ? { status: status as "FACONNEE" | "AFFECTEE" | "LANCEE" | "FABRIQUEE" } : {}) }),
    enabled: user?.role === "ADMIN",
    refetchInterval: 15_000,
  });
  if (isLoading || !user || user.role !== "ADMIN") return <div className="flex min-h-64 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Ouverture du suivi de production…</div>;
  const data = query.data;
  const counts = data?.counts;
  const error = query.error instanceof ApiError ? query.error.message : "Vérifiez la connexion au serveur puis réessayez.";

  return (
    <div className="min-w-0 w-full max-w-full space-y-6">
      <PageHeader className="w-full flex-wrap" eyebrow="Atelier" title="Suivi de production" description="Vue globale des barres façonnées, affectées et fabriquées. Actualisation automatique toutes les 15 secondes." action={<Button variant="outline" className="max-w-full" onClick={() => void query.refetch()} disabled={query.isFetching}><Activity className={`size-4 ${query.isFetching ? "animate-pulse" : ""}`} />Actualiser</Button>} />
      <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
        {[
          { label: "Façonnées", value: counts?.shaped ?? 0, icon: Factory, tone: "text-slate-700 bg-slate-100" },
          { label: "Affectées", value: counts?.assigned ?? 0, icon: Activity, tone: "text-blue-700 bg-blue-50" },
          { label: "En cours", value: counts?.inProgress ?? 0, icon: Activity, tone: "text-amber-700 bg-amber-50" },
          { label: "Fabriquées", value: counts?.fabricated ?? 0, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
          { label: "NC ouvertes", value: counts?.openNonConformities ?? 0, icon: AlertTriangle, tone: "text-red-700 bg-red-50" },
        ].map(({ label, value, icon: Icon, tone }) => <Card key={label} className="min-w-0"><CardContent className="flex min-w-0 items-center gap-3 p-4"><div className={`shrink-0 rounded-lg p-2.5 ${tone}`}><Icon className="size-4" /></div><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString("fr-FR")}</p></div></CardContent></Card>)}
      </div>
      <Card className="min-w-0 w-full">
        <div className="nim-sticky-table-tools flex flex-col gap-3 border-b bg-card p-4 md:flex-row">
          <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une barre, un profil, une Affaire ou une machine…" className="pl-9" aria-label="Rechercher dans la production" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full md:w-52" aria-label="Filtrer par état"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
        </div>
        {query.isLoading ? <div className="space-y-3 p-5" aria-busy="true">{Array.from({ length: 5 }, (_, i) => <Skeleton className="h-14 w-full" key={i} />)}</div> : query.isError ? <div className="p-8 text-center"><p className="text-sm font-medium text-destructive">Impossible de charger le suivi de production</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Réessayer</Button></div> : !data?.bars.length ? <EmptyState title="Aucune barre à afficher" description={search || status !== "ALL" ? "Aucune barre ne correspond aux filtres. Modifiez ou réinitialisez la recherche." : "Les barres apparaîtront ici dès qu’un plan sera validé."} /> : <>
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <Table
              serverSorting={{ column: ({ reference: "Barre / Affaire", offer: "Barre / Affaire", status: "État", profile: "Machine / équipe" } as const)[sorting.sortBy as "reference" | "offer" | "status" | "profile"], direction: sorting.sortDirection }}
              onServerSort={(column, direction) => {
                const field = ({ "Barre / Affaire": "reference", "État": "status" } as const)[column as "Barre / Affaire" | "État"];
                if (field) { setSorting({ sortBy: field, sortDirection: direction }); setPage(1); }
              }}
              className="nim-data-table w-full min-w-[880px] text-left text-sm"
            >
              <thead className="sticky top-0 z-10 bg-muted/90 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr><th className="px-4 py-3 font-semibold">Barre / Affaire</th><th className="px-4 py-3 font-semibold" data-sortable="false">Machine / équipe</th><th className="px-4 py-3 font-semibold">État</th><th className="px-4 py-3 font-semibold" data-sortable="false">Fabrication</th><th className="px-4 py-3 font-semibold" data-sortable="false">NC ouvertes</th></tr>
              </thead>
              <tbody>
                {data.bars.map(({ bar, machineSession, run, openNonConformities }) => (
                  <tr key={bar.id} className="border-b odd:bg-background even:bg-muted/20 hover:bg-muted/40">
                    <td className="px-4 py-3"><Link href={`/offers/${bar.offerId}/production`} className="font-semibold text-foreground hover:text-primary hover:underline">{bar.reference}</Link><p className="mt-1 text-xs text-muted-foreground">{bar.profile} · {bar.items.length} pièce(s)</p><p className="text-xs text-muted-foreground">Affaire {bar.offerReference}</p></td>
                    <td className="px-4 py-3">{run?.machineName ?? machineSession?.machineName ?? bar.machine?.name ? <CategoryBadge tone="blue" className="max-w-full truncate">{run?.machineName ?? machineSession?.machineName ?? bar.machine?.name}</CategoryBadge> : <StatusBadge tone="neutral" className="min-h-7 px-3">Non affectée</StatusBadge>}<p className="mt-1 text-xs text-muted-foreground">{(run?.team ?? machineSession?.team ?? []).map((member) => member.displayName).join(", ") || "Aucune équipe active"}</p></td>
                    <td className="px-4 py-3"><Status value={bar.status} /></td>
                    <td className="px-4 py-3">{run?.status === "RUNNING" ? <StatusBadge tone="warning" className="min-h-7 px-3">En cours</StatusBadge> : run?.status === "COMPLETED" ? <StatusBadge tone="active" className="min-h-7 px-3">Terminée</StatusBadge> : run?.status === "CANCELLED" ? <StatusBadge tone="neutral" className="min-h-7 px-3">Annulée</StatusBadge> : <StatusBadge tone="neutral" className="min-h-7 px-3">Non démarrée</StatusBadge>}{run ? <p className="mt-1 text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString("fr-FR")}</p> : null}</td>
                    <td className="px-4 py-3"><StatusBadge tone={openNonConformities.length ? "danger" : "active"} className="min-h-7 px-3">{openNonConformities.length} NC</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <Pagination page={data.pagination.page} pageCount={data.pagination.totalPages} pageSize={data.pagination.pageSize} total={data.pagination.total} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="barre" />
        </>}
      </Card>
    </div>
  );
}
