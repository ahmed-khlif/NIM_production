"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ApiError, getNotificationsRequest } from "@/features/auth/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZES = [10, 20, 50] as const;

const eventLabels: Record<string, string> = {
  PIECE_CREATED: "Pièce créée",
  PIECE_UPDATED: "Pièce mise à jour",
  PIECE_ARCHIVED: "Pièce archivée",
  ASSIGNMENT_CREATED: "Affectation créée",
  ASSIGNMENT_REASSIGNED: "Affectation réassignée",
  ASSIGNMENT_REMOVED: "Affectation retirée",
  BAR_ASSIGNED_TO_MACHINE: "Barre affectée à une machine",
  BAR_UNASSIGNED_FROM_MACHINE: "Affectation de barre retirée",
  PRODUCTION_STARTED: "Production démarrée",
  PRODUCTION_COMPLETED: "Production terminée",
  QUALITY_VALIDATED: "Contrôle conforme",
  QUALITY_REJECTED: "Contrôle non conforme",
  MACHINE_STATUS_CHANGED: "État machine modifié",
  MACHINE_SESSION_STARTED: "Session machine démarrée",
  MACHINE_SESSION_ENDED: "Session machine terminée",
  NON_CONFORMITY_REPORTED: "Non-conformité signalée",
};

function date(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function eventLabel(value: string): string {
  return eventLabels[value] ?? value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

export function NotificationsView(): React.ReactNode {
  const query = useQuery({ queryKey: ["notifications"], queryFn: getNotificationsRequest, retry: false });
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const notifications = query.data?.notifications ?? [];
  const eventTypes = useMemo(() => Array.from(new Set(notifications.map((item) => item.eventType))).sort(), [notifications]);
  const filteredNotifications = useMemo(() => {
    const term = search.trim().toLowerCase();
    return notifications.filter((item) => {
      const matchesEvent = eventFilter === "all" || item.eventType === eventFilter;
      const matchesSearch = !term || `${item.title} ${item.message} ${eventLabel(item.eventType)}`.toLowerCase().includes(term);
      return matchesEvent && matchesSearch;
    });
  }, [eventFilter, notifications, search]);
  const hasFilters = Boolean(search.trim()) || eventFilter !== "all";
  const pageCount = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedNotifications = filteredNotifications.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const resetFilters = (): void => {
    setSearch("");
    setEventFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mon espace"
        title="Activité"
        description="Événements récents de votre espace de production. Ce flux est informatif et n’utilise pas de statut lu/non lu."
        action={
          <Button variant="outline" size="icon" aria-label="Actualiser l’activité" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm">Centre d’activité</CardTitle>
            <Badge variant="outline">{notifications.length} événement{notifications.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Rechercher dans l’activité"
                aria-label="Rechercher dans l’activité"
                className="pl-9 pr-9"
              />
              {search ? (
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-8 -translate-y-1/2" onClick={() => { setSearch(""); setPage(1); }} aria-label="Effacer la recherche">
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            <Select value={eventFilter} onValueChange={(value) => { setEventFilter(value); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[240px]" aria-label="Filtrer par type d’événement">
                <SelectValue placeholder="Tous les événements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les événements</SelectItem>
                {eventTypes.map((type) => <SelectItem key={type} value={type}>{eventLabel(type)}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasFilters ? <Button type="button" variant="ghost" onClick={resetFilters}>Réinitialiser</Button> : null}
          </div>
          <p className="text-xs text-slate-500" aria-live="polite">
            {filteredNotifications.length} événement{filteredNotifications.length === 1 ? "" : "s"} affiché{filteredNotifications.length === 1 ? "" : "s"}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-3 p-5" aria-busy="true">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
          ) : query.isError ? (
            <div className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
              <p>{query.error instanceof ApiError ? query.error.message : "Impossible de charger l’activité."}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className="size-4" />Réessayer</Button>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-6">
              <EmptyState title={hasFilters ? "Aucun résultat" : "Aucune activité récente"} description={hasFilters ? "Modifiez les filtres pour afficher d’autres événements." : "Les événements pertinents pour votre rôle apparaîtront ici."} />
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 px-5" role="list" aria-label="Événements récents">
                {pagedNotifications.map((item) => (
                  <article key={item.id} role="listitem" className="flex gap-3 py-4">
                    <div className="mt-0.5 rounded-full bg-slate-100 p-2 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><Activity className="size-4" aria-hidden="true" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">{eventLabel(item.eventType)}</p>
                          <Badge variant="outline" className="text-[10px]">Activité</Badge>
                        </div>
                        <span className="flex items-center gap-1 text-xs text-slate-400"><Clock3 className="size-3.5" aria-hidden="true" />{date(item.createdAt)}</span>
                      </div>
                      <p className="mt-1 break-words text-sm text-slate-500">{item.message}</p>
                    </div>
                  </article>
                ))}
              </div>
              <Pagination
                page={currentPage}
                pageCount={pageCount}
                pageSize={pageSize}
                total={filteredNotifications.length}
                pageSizes={PAGE_SIZES}
                itemLabel="événement"
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
