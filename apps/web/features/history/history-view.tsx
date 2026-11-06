"use client";

import { Table } from "@/components/ui/table";
import { historyEntityTypes, historyEventTypes, type ManagedHistoryEvent } from "@nim/types";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  Database,
  History as HistoryIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, getHistoryRequest, getOfferHistoryRequest } from "@/features/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryBadge, type CategoryTone } from "@/components/ui/category-badge";
import { RoleBadge } from "@/components/ui/role-badge";
import { Pagination } from "@/components/ui/pagination";
import { entityLabel, eventLabel } from "./event-labels";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const eventOptions = historyEventTypes;
const entityOptions = historyEntityTypes;

const pageSizes = [10, 20, 50] as const;

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

const entityBadgeTones: Record<string, CategoryTone> = {
  CLIENT: "teal",
  AUTH: "violet",
  USER: "violet",
  MACHINE: "blue",
  MACHINE_SESSION: "blue",
  PIECE: "cyan",
  PIECE_UNIT: "cyan",
  ASSIGNMENT: "indigo",
  CUTTING_PLAN: "indigo",
  CUTTING_BAR: "indigo",
  PRODUCTION_OPERATION: "amber",
  PRODUCTION_RUN: "amber",
  QUALITY_CONTROL: "rose",
  NON_CONFORMITY: "rose",
  OFFER: "teal",
  FACONNAGE_PREPARATION: "teal",
  IMPORT_BATCH: "slate",
  MATERIAL_PROFILE: "slate",
};

function HistoryEntityBadge({ entityType }: { entityType: ManagedHistoryEvent["entityType"] }): React.ReactNode {
  return <CategoryBadge tone={entityBadgeTones[entityType] ?? "slate"}>{entityLabel(entityType)}</CategoryBadge>;
}

function HistoryActorRole({ role }: { role: ManagedHistoryEvent["actorRole"] }): React.ReactNode {
  return role ? <RoleBadge role={role} className="min-h-5 px-2 py-0.5 text-[10px] [&_svg]:size-3" /> : <StatusBadge tone="neutral">Système</StatusBadge>;
}

function businessStatus(value: unknown): string {
  if (typeof value !== "string") return "";
  const labels: Record<string, string> = {
    PENDING: "En attente",
    FACONNEE: "Façonnée",
    AFFECTEE: "Affectée",
    ASSIGNED: "Affectée",
    LANCEE: "Lancée",
    IN_PROGRESS: "En cours",
    FABRIQUEE: "Fabriquée",
    COMPLETED: "Terminée",
    NON_CONFORME: "Non conforme",
    REJECTED: "Rejetée",
    DRAFT: "Brouillon",
    READY: "Prête",
    IN_PRODUCTION: "En production",
    CANCELLED: "Annulée",
    ARCHIVED: "Archivée",
    ACTIVE: "Actif",
    INACTIVE: "Inactif",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function metadataSummary(metadata: ManagedHistoryEvent["metadata"]): string | null {
  if (!metadata) return null;
  const oldStatus = metadata.oldStatus ?? metadata.oldUnitStatus ?? metadata.oldPieceStatus;
  const newStatus = metadata.newStatus ?? metadata.newUnitStatus ?? metadata.newPieceStatus;
  if (typeof oldStatus === "string" && typeof newStatus === "string")
    return `${businessStatus(oldStatus)} → ${businessStatus(newStatus)}`;
  if (typeof metadata.result === "string")
    return metadata.result === "CONFORM" ? "Résultat conforme" : "Résultat non conforme";
  if (typeof metadata.internalNumber === "string") return metadata.internalNumber;
  if (typeof metadata.reference === "string") return metadata.reference;
  if (typeof metadata.offerReference === "string") return `Affaire ${metadata.offerReference}`;
  const preparation = metadata.summary;
  if (preparation && typeof preparation === "object" && !Array.isArray(preparation)) {
    const summary = preparation as Record<string, unknown>;
    const profiles = typeof summary.selectedProfileCount === "number" ? `${summary.selectedProfileCount} profils` : null;
    const units = typeof summary.totalQuantity === "number" ? `${summary.totalQuantity} unités` : null;
    const pieces = typeof summary.pieceRows === "number" ? `${summary.pieceRows} repères` : null;
    return [profiles, pieces, units].filter(Boolean).join(" · ") || null;
  }
  if (Array.isArray(metadata.selectedProfiles) && metadata.selectedProfiles.every((profile) => typeof profile === "string")) {
    return `Profils : ${metadata.selectedProfiles.slice(0, 4).join(", ")}${metadata.selectedProfiles.length > 4 ? "…" : ""}`;
  }
  return null;
}

function entityReference(event: ManagedHistoryEvent): string | null {
  const metadata = event.metadata;
  if (!metadata) return null;
  for (const key of ["reference", "internalNumber", "offerReference", "barReference", "pieceReference", "machineReference"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function traceabilityLinks(event: ManagedHistoryEvent, offerId?: string): React.ReactNode {
  const links: Array<{ href: string; label: string }> = [];
  const relatedOfferId = offerId ?? (typeof event.metadata?.offerId === "string" ? event.metadata.offerId : undefined);
  if (event.entityType === "PIECE" && relatedOfferId) links.push({ href: `/offers/${relatedOfferId}/pieces/${event.entityId}`, label: "Voir la pièce" });
  if (event.entityType === "OFFER") links.push({ href: `/offers/${event.entityId}`, label: "Voir l’offre" });
  if (event.entityType === "MACHINE") links.push({ href: `/machines/${event.entityId}`, label: "Voir la machine" });
  if (event.entityType === "CLIENT") links.push({ href: `/clients/${event.entityId}`, label: "Voir le client" });
  if (event.entityType === "CLIENT") links.push({ href: `/clients/${event.entityId}`, label: "Voir le client" });
  const pieceId = event.metadata?.pieceId;
  const machineId = event.metadata?.machineId;
  if (typeof pieceId === "string") {
    const pieceHref = offerId ? `/offers/${offerId}/pieces/${pieceId}` : "/offers";
    if (!links.some((link) => link.href === pieceHref)) links.push({ href: pieceHref, label: "Pièce" });
  }
  if (typeof machineId === "string" && !links.some((link) => link.href === `/machines/${machineId}`)) links.push({ href: `/machines/${machineId}`, label: "Machine" });
  if (!links.length) return null;
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{links.map((link) => <Link key={link.href} href={link.href} className="text-xs font-medium text-nim-red underline-offset-4 hover:underline">{link.label}</Link>)}</div>;
}

function AccessDenied(): React.ReactNode {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Traçabilité"
        title="Historique"
        description="Consultez les événements métier conservés par NIM."
      />
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-red-50 p-3 text-nim-red">
            <ShieldCheck className="size-6" />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">Accès restreint</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            L’historique complet est réservé aux administrateurs et responsables de production.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EventSkeleton(): React.ReactNode {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

function HistoryEventRow({ event, offerId }: { event: ManagedHistoryEvent; offerId?: string }): React.ReactNode {
  const summary = metadataSummary(event.metadata);
  return (
    <>
      <tr className="transition-colors hover:bg-slate-50/70">
        <td className="px-5 py-4">
          <p className="font-medium text-slate-900">{eventLabel(event.eventType)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
        </td>
        <td className="px-5 py-4">
          <HistoryEntityBadge entityType={event.entityType} />
          {entityReference(event) ? <p className="mt-1 max-w-48 truncate text-xs text-slate-500">{entityReference(event)}</p> : null}
        </td>
        <td className="px-5 py-4">
          <p className="text-sm text-slate-700">{event.actorName ?? "Système"}</p>
          <div className="mt-1"><HistoryActorRole role={event.actorRole} /></div>
        </td>
        <td className="px-5 py-4 text-sm text-slate-500">{summary ?? "—"}{traceabilityLinks(event, offerId)}</td>
      </tr>
    </>
  );
}

function HistoryEventCard({ event, offerId }: { event: ManagedHistoryEvent; offerId?: string }): React.ReactNode {
  const summary = metadataSummary(event.metadata);
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{eventLabel(event.eventType)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
        </div>
        <HistoryEntityBadge entityType={event.entityType} />
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-500">
        <span>
          Acteur :{" "}
          <strong className="font-medium text-slate-700">{event.actorName ?? "Système"}</strong>
        </span>
        <span className="flex flex-wrap items-center gap-2">Rôle : <HistoryActorRole role={event.actorRole} /></span>
        {entityReference(event) ? <span>Référence : {entityReference(event)}</span> : null}
        {traceabilityLinks(event, offerId)}
        {summary ? <StatusBadge tone="neutral">{summary}</StatusBadge> : null}
      </div>
    </div>
  );
}

export function HistoryView({ offerId }: { offerId?: string } = {}): React.ReactNode {
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const { user } = useAuth();
  const canRead = Boolean(user && ["ADMIN", "PRODUCTION_MANAGER"].includes(user.role));
  const [page, setPage] = useState(() => Math.max(1, Number(getInitialListParam("page", "1")) || 1));
  const [pageSize, setPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("pageSize", "20"))) ? Number(getInitialListParam("pageSize", "20")) : 20);
  const [search, setSearch] = useState(() => getInitialListParam("search"));
  const [eventType, setEventType] = useState(() => ["ALL", ...eventOptions].includes(getInitialListParam("eventType", "ALL")) ? getInitialListParam("eventType", "ALL") : "ALL");
  const [entityType, setEntityType] = useState(() => ["ALL", ...entityOptions].includes(getInitialListParam("entityType", "ALL")) ? getInitialListParam("entityType", "ALL") : "ALL");
  const [sorting, setSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "eventType", sortDirection: "asc" });
  useEffect(() => {
    setPage(Math.max(1, Number(urlParams.get("page")) || 1));
    const nextPageSize = Number(urlParams.get("pageSize"));
    if ([10, 20, 50].includes(nextPageSize)) setPageSize(nextPageSize);
    setSearch(urlParams.get("search") ?? "");
    const nextEvent = urlParams.get("eventType") ?? "ALL";
    setEventType(["ALL", ...eventOptions].includes(nextEvent) ? nextEvent : "ALL");
    const nextEntity = urlParams.get("entityType") ?? "ALL";
    setEntityType(["ALL", ...entityOptions].includes(nextEntity) ? nextEntity : "ALL");
  }, [urlParams]);
  useEffect(() => {
    updateUrl({ page, pageSize, search: search.trim(), eventType: eventType === "ALL" ? null : eventType, entityType: entityType === "ALL" ? null : entityType });
  }, [page, pageSize, search, eventType, entityType, updateUrl]);
  const queryInput = useMemo(
    () => ({
      page,
      pageSize,
      search,
      eventType: eventType === "ALL" ? undefined : eventType,
      entityType: entityType === "ALL" ? undefined : entityType,
      ...sorting,
    }),
    [entityType, eventType, page, pageSize, search, sorting],
  );
  const historyQuery = useQuery({
    queryKey: ["history", offerId ?? "ALL", queryInput],
    queryFn: () => offerId ? getOfferHistoryRequest(offerId, queryInput) : getHistoryRequest(queryInput),
    enabled: canRead,
    retry: false,
  });
  const data = historyQuery.data;
  const events = data?.events ?? [];
  const hasFilters = Boolean(search.trim()) || eventType !== "ALL" || entityType !== "ALL";
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) setPage(data.totalPages);
  }, [data, page]);

  if (!canRead) return <AccessDenied />;

  function resetFilters(): void {
    setPage(1);
    setSearch("");
    setEventType("ALL");
    setEntityType("ALL");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={offerId ? "Offre · Traçabilité" : "Traçabilité"}
        title="Historique"
        description={offerId ? "Événements liés uniquement à cette affaire, ses pièces, son façonnage et sa production." : "Journal complet, toutes dates confondues : suivez les changements métier avec leur acteur et leur contexte."}
        action={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void historyQuery.refetch()}
            disabled={historyQuery.isFetching}
          >
            <RefreshCw className={`size-4 ${historyQuery.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Événements"
          value={String(data?.total ?? 0)}
          detail="Résultats correspondant aux filtres"
          icon={Database}
          tone="neutral"
        />
        <KpiCard
          label="Page actuelle"
          value={`${data?.page ?? page}/${data?.totalPages ?? 1}`}
          detail="Navigation paginée"
          icon={HistoryIcon}
          tone="positive"
        />
        <KpiCard
          label="Source"
          value="PostgreSQL"
          detail="Journal append-only"
          icon={Activity}
          tone="neutral"
        />
      </div>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Journal des événements</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Historique append-only : les événements ne sont jamais supprimés par l’interface.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasFilters}>
            Réinitialiser
          </Button>
        </CardHeader>
        <CardContent className="nim-sticky-table-tools border-t border-slate-100 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher un événement, une référence ou un identifiant"
                aria-label="Rechercher dans l’historique"
                className="pl-9 pr-9"
              />
              {search ? <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2" aria-label="Effacer la recherche historique" onClick={() => { setSearch(""); setPage(1); }}><X className="size-4" /></Button> : null}
            </div>
            <Select
              value={eventType}
              onValueChange={(value) => {
                setEventType(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filtrer par événement">
                <SelectValue placeholder="Tous les événements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les événements</SelectItem>
                {eventOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {eventLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={entityType}
              onValueChange={(value) => {
                setEntityType(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filtrer par entité">
                <SelectValue placeholder="Toutes les entités" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les entités</SelectItem>
                {entityOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {entityLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-3 text-xs font-medium text-slate-600" aria-live="polite">
            {(data?.total ?? 0).toLocaleString("fr-FR")} événement{data?.total === 1 ? "" : "s"} correspondent aux filtres
          </p>
        </CardContent>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <EventSkeleton />
          ) : historyQuery.isError ? (
            <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center" role="alert">
              <p className="text-sm font-semibold text-red-700">
                Impossible de charger l’historique
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {historyQuery.error instanceof ApiError
                  ? historyQuery.error.message
                  : "Vérifiez la connexion à l’API."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void historyQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucun événement"
                description="Aucun événement ne correspond aux filtres sélectionnés."
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table
                  className="nim-data-table w-full text-left text-sm"
                  serverSorting={{ column: ({ eventType: "Événement", entityType: "Entité", actorName: "Acteur" } as Record<string, string>)[sorting.sortBy] ?? "Événement", direction: sorting.sortDirection }}
                  onServerSort={(column, direction) => {
                    const sortBy = ({ Événement: "eventType", Entité: "entityType", Acteur: "actorName" } as Record<string, string>)[column];
                    if (sortBy) { setSorting({ sortBy, sortDirection: direction }); setPage(1); }
                  }}
                >
                  <caption className="sr-only">Journal des événements de traçabilité</caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Événement</th>
                      <th className="px-5 py-3 font-medium">Entité</th>
                      <th className="px-5 py-3 font-medium">Acteur</th>
                      <th data-sortable="false" className="px-5 py-3 font-medium">Contexte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {events.map((event) => (
                      <HistoryEventRow key={event.id} event={event} offerId={offerId} />
                    ))}
                  </tbody>
                </Table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {events.map((event) => (
                  <HistoryEventCard key={event.id} event={event} offerId={offerId} />
                ))}
              </div>
            </>
          )}
        </CardContent>
        {data && data.total > 0 ? (
          <Pagination
            page={data.page}
            pageCount={data.totalPages}
            pageSize={data.pageSize}
            total={data.total}
            pageSizes={pageSizes}
            itemLabel="événement"
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        ) : null}
      </Card>
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <CalendarClock className="size-3.5" />
        Les heures sont affichées selon le fuseau du navigateur.
      </p>
    </div>
  );
}
