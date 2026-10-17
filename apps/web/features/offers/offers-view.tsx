"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  archiveOfferRequest,
  createOfferRequest,
  deleteOfferRequest,
  getOffersRequest,
  restoreOfferRequest,
  updateOfferRequest,
  type ManagedOffer,
  type OfferStatus,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { OfferFormSheet, type OfferFormValue } from "./offer-form-sheet";
import { formatDateTime, OfferStatusBadge, offerStatusLabels } from "./offer-ui";

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Une erreur est survenue.";
}

export function OffersView(): React.ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const canDelete = user?.role === "ADMIN";
  const [search, setSearch] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("search") ?? ""),
  );
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [status, setStatus] = useState<"ALL" | OfferStatus>("ALL");
  const [clientFilter, setClientFilter] = useState("ALL");
  const [siteFilter, setSiteFilter] = useState("ALL");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedOffer | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ManagedOffer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedOffer | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const offersQuery = useQuery({
    queryKey: ["offers", includeArchived, page, pageSize, debouncedSearch, status, clientFilter, siteFilter],
    queryFn: () => getOffersRequest({
      includeArchived,
      page,
      pageSize,
      search: debouncedSearch,
      status,
      clientName: clientFilter,
      site: siteFilter,
    }),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: createOfferRequest,
    onSuccess: async ({ offer }) => {
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
      setFormOpen(false);
      setFormError(null);
      toast.success("Offre créée.");
      router.push(`/offers/${offer.id}`);
    },
    onError: (error) => setFormError(message(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: OfferFormValue }) =>
      updateOfferRequest(id, {
        revision: value.revision,
        name: value.name,
        clientName: value.clientName,
        site: value.site,
        description: value.description,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
      setFormOpen(false);
      setEditing(null);
      setFormError(null);
      toast.success("Offre mise à jour.");
    },
    onError: (error) => setFormError(message(error)),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveOfferRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
      setArchiveTarget(null);
      toast.success("Offre archivée.");
    },
    onError: (error) => toast.error(message(error)),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreOfferRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Offre restaurée en brouillon.");
    },
    onError: (error) => toast.error(message(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOfferRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["offers"] });
      setDeleteTarget(null);
      toast.success("Offre vide supprimée.");
    },
    onError: (error) => toast.error(message(error)),
  });

  const offers = offersQuery.data?.offers ?? [];
  const pagination = offersQuery.data?.pagination ?? { page, pageSize, total: offers.length, totalPages: 1 };
  const clients = offersQuery.data?.facets.clients ?? [];
  const sites = offersQuery.data?.facets.sites ?? [];
  const hasFilters = Boolean(search.trim()) || status !== "ALL" || clientFilter !== "ALL" || siteFilter !== "ALL" || includeArchived;

  useEffect(() => {
    setPage(1);
  }, [clientFilter, includeArchived, debouncedSearch, siteFilter, status, pageSize]);

  const resetFilters = (): void => {
    setSearch("");
    setStatus("ALL");
    setClientFilter("ALL");
    setSiteFilter("ALL");
    setIncludeArchived(false);
    setPage(1);
  };

  const openCreate = (): void => {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  };

  const submitForm = (value: OfferFormValue): void => {
    setFormError(null);
    if (editing) updateMutation.mutate({ id: editing.id, value });
    else createMutation.mutate(value);
  };

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pilotage"
        title="Offres"
        description="Chaque offre isole ses pièces, ses imports, son façonnage et son suivi de production."
        action={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Nouvelle offre
            </Button>
          ) : undefined
        }
      />

      <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
        <CardContent className="p-0">
          <div className="grid gap-3 border-b border-slate-200 p-4 xl:grid-cols-[minmax(0,1fr)_180px_190px_190px_200px_auto] dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une offre, un client, un site..." aria-label="Rechercher une offre" className="pl-9 pr-9" />
              {search ? <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-8 -translate-y-1/2" onClick={() => setSearch("")} aria-label="Effacer la recherche"><X className="size-4" /></Button> : null}
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as "ALL" | OfferStatus)}>
              <SelectTrigger aria-label="Filtrer les offres par statut"><SelectValue placeholder="Tous les statuts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                {(Object.keys(offerStatusLabels) as OfferStatus[]).map((value) => (
                  <SelectItem key={value} value={value}>{offerStatusLabels[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger aria-label="Filtrer les offres par client"><SelectValue placeholder="Tous les clients" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les clients</SelectItem>
                {clients.map((client) => <SelectItem key={client} value={client}>{client}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger aria-label="Filtrer les offres par site"><SelectValue placeholder="Tous les sites" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les sites</SelectItem>
                {sites.map((site) => <SelectItem key={site} value={site}>{site}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={includeArchived ? "WITH_ARCHIVED" : "ACTIVE"} onValueChange={(value) => setIncludeArchived(value === "WITH_ARCHIVED")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Offres actives</SelectItem>
                <SelectItem value="WITH_ARCHIVED">Inclure les archivées</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? <Button type="button" variant="ghost" onClick={resetFilters}>Réinitialiser</Button> : <span className="hidden xl:block" />}
          </div>

          {offersQuery.isLoading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
          ) : offersQuery.isError ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-semibold text-red-700">Impossible de charger les offres</p>
              <p className="mt-1 text-sm text-slate-500">{message(offersQuery.error)}</p>
              <Button variant="outline" className="mt-4" onClick={() => void offersQuery.refetch()}><RefreshCw className="size-4" />Réessayer</Button>
            </div>
          ) : pagination.total === 0 ? (
            <div className="p-8">
              <EmptyState
                title={offers.length === 0 ? "Aucune offre" : "Aucun résultat"}
                description={offers.length === 0 ? "Créez une offre avant d’ajouter ou d’importer ses pièces." : "Modifiez vos filtres ou votre recherche."}
                action={canManage && offers.length === 0 ? <Button onClick={openCreate}><Plus className="size-4" />Créer la première offre</Button> : undefined}
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1150px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                    <tr>
                      <th className="px-4 py-3">Référence</th>
                      <th className="px-4 py-3">Nom</th>
                      <th className="px-4 py-3">Client / Site</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3 text-right">Unités demandées</th>
                      <th className="min-w-52 px-4 py-3">Fabrication</th>
                      <th className="px-4 py-3">Modification</th>
                      <th className="w-16 px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {offers.map((offer) => (
                      <tr key={offer.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-3">
                          <Link href={`/offers/${offer.id}`} className="font-semibold text-slate-950 hover:text-nim-red dark:text-slate-100">{offer.reference}</Link>
                          <p className="mt-0.5 text-[11px] text-slate-400">Indice {offer.revision}</p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{offer.name}</td>
                        <td className="px-4 py-3 text-slate-500">
                          <p>{offer.clientName || "—"}</p>
                          <p className="text-xs text-slate-400">{offer.site || "Site non renseigné"}</p>
                        </td>
                        <td className="px-4 py-3"><OfferStatusBadge status={offer.status} /></td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{offer.totalUnits.toLocaleString("fr-FR")}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3"><Progress value={offer.progressRate} className="h-2" /><span className="min-w-24 text-right text-xs font-medium tabular-nums">{offer.manufacturedUnits.toLocaleString("fr-FR")} / {offer.totalUnits.toLocaleString("fr-FR")}</span></div>
                          <p className="mt-1 text-[11px] text-slate-400">unités fabriquées · {offer.progressRate.toLocaleString("fr-FR")} %</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(offer.updatedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions ${offer.reference}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild><Link href={`/offers/${offer.id}`}><Eye />Ouvrir</Link></DropdownMenuItem>
                              {canManage && offer.status !== "ARCHIVED" ? <DropdownMenuItem onClick={() => { setEditing(offer); setFormError(null); setFormOpen(true); }}><Pencil />Modifier</DropdownMenuItem> : null}
                              <DropdownMenuSeparator />
                              {canManage && offer.status !== "ARCHIVED" ? <DropdownMenuItem onClick={() => setArchiveTarget(offer)}><Archive />Archiver</DropdownMenuItem> : null}
                              {canManage && offer.status === "ARCHIVED" ? <DropdownMenuItem onClick={() => restoreMutation.mutate(offer.id)}><RotateCcw />Restaurer</DropdownMenuItem> : null}
                              {canDelete && offer.status === "DRAFT" && offer.totalUnits === 0 && !offer.latestPlan ? <DropdownMenuItem className="text-red-600" onClick={() => setDeleteTarget(offer)}><Trash2 />Supprimer</DropdownMenuItem> : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {offers.map((offer) => (
                  <Link key={offer.id} href={`/offers/${offer.id}`} className="block rounded-xl border border-slate-200 p-4 transition hover:border-red-200 hover:bg-red-50/30 dark:border-slate-800 dark:hover:border-red-950 dark:hover:bg-red-950/10">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-950 dark:text-slate-100">{offer.reference}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{offer.name}</p></div><OfferStatusBadge status={offer.status} /></div>
                    <div className="mt-4 flex items-center justify-between text-xs"><span className="text-slate-500">Unités fabriquées</span><span className="font-semibold tabular-nums">{offer.manufacturedUnits.toLocaleString("fr-FR")} <span className="font-normal text-slate-400">/ {offer.totalUnits.toLocaleString("fr-FR")}</span></span></div>
                    <div className="mt-2 flex items-center gap-3"><Progress value={offer.progressRate} className="h-2" /><span className="min-w-12 text-right text-xs font-semibold tabular-nums">{offer.progressRate.toLocaleString("fr-FR")} %</span></div>
                  </Link>
                ))}
              </div>
              <Pagination
                page={pagination.page}
                pageCount={pagination.totalPages}
                pageSize={pagination.pageSize}
                total={pagination.total}
                itemLabel="offre"
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <OfferFormSheet open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) { setEditing(null); setFormError(null); } }} offer={editing} busy={busy} error={formError} onSubmit={submitForm} />

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archiver cette offre ?</AlertDialogTitle><AlertDialogDescription>Les données restent conservées. Une offre avec une production active ne peut pas être archivée.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)} disabled={archiveMutation.isPending}>{archiveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Archiver</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Supprimer définitivement ?</AlertDialogTitle><AlertDialogDescription>Cette action est réservée aux brouillons totalement vides. Une offre contenant des données doit être archivée.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending}>Supprimer</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
