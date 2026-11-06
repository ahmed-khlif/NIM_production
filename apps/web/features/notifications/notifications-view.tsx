"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Clock3, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getNotificationsRequest, markAllNotificationsReadRequest, markNotificationReadRequest } from "@/features/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";
import { eventLabel } from "@/features/history/event-labels";

const PAGE_SIZES = [10, 20, 50] as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function NotificationsView(): React.ReactNode {
  const queryClient = useQueryClient();
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const [search, setSearch] = useState(() => getInitialListParam("search"));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [eventFilter, setEventFilter] = useState(() => getInitialListParam("eventType", "all"));
  const [unreadOnly, setUnreadOnly] = useState(() => getInitialListParam("unreadOnly") === "true");
  const [page, setPage] = useState(() => Math.max(1, Number(getInitialListParam("page", "1")) || 1));
  const [pageSize, setPageSize] = useState<number>(() => [10, 20, 50].includes(Number(getInitialListParam("pageSize", "20"))) ? Number(getInitialListParam("pageSize", "20")) : 20);
  useEffect(() => {
    setSearch(urlParams.get("search") ?? "");
    setEventFilter(urlParams.get("eventType") ?? "all");
    setUnreadOnly(urlParams.get("unreadOnly") === "true");
    setPage(Math.max(1, Number(urlParams.get("page")) || 1));
    const nextSize = Number(urlParams.get("pageSize"));
    if ([10, 20, 50].includes(nextSize)) setPageSize(nextSize);
  }, [urlParams]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    updateUrl({ search: search.trim(), eventType: eventFilter === "all" ? null : eventFilter, unreadOnly, page, pageSize });
  }, [search, eventFilter, unreadOnly, page, pageSize, updateUrl]);

  const query = useQuery({
    queryKey: ["notifications", page, pageSize, debouncedSearch, eventFilter, unreadOnly],
    queryFn: () => getNotificationsRequest({ page, pageSize, search: debouncedSearch, eventType: eventFilter === "all" ? undefined : eventFilter, unreadOnly, includeEventTypes: true }),
    retry: false,
    refetchInterval: 20_000,
  });
  const markRead = useMutation({
    mutationFn: markNotificationReadRequest,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsReadRequest,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["notifications"] }); },
  });
  const notifications = query.data?.notifications ?? [];
  const eventTypes = query.data?.eventTypes ?? [];
  const pagination = query.data?.pagination ?? { page, pageSize, total: 0, totalPages: 1 };
  const hasFilters = Boolean(search.trim()) || eventFilter !== "all" || unreadOnly;
  const resetFilters = (): void => { setSearch(""); setEventFilter("all"); setUnreadOnly(false); setPage(1); };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mon espace"
        title="Notifications"
        description="Des mises à jour qui vous concernent : affaires, affectations, fabrication et décisions qualité. L’Historique reste le journal complet de traçabilité."
        action={<Button variant="outline" size="sm" className="min-h-11 whitespace-normal" onClick={() => markAllRead.mutate()} disabled={!query.data?.unreadCount || markAllRead.isPending}><CheckCheck className="size-4" />Tout marquer comme lu</Button>}
      />
      <Card>
        <CardHeader className="nim-sticky-table-tools gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm">Boîte de réception</CardTitle>
            <StatusBadge tone={query.data?.unreadCount ? "info" : "neutral"}>{(query.data?.unreadCount ?? 0).toLocaleString("fr-FR")} non lue{query.data?.unreadCount === 1 ? "" : "s"}</StatusBadge>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Rechercher une affaire, une pièce ou une action…" aria-label="Rechercher les notifications" className="pl-9 pr-9" />
              {search ? <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-8 min-h-11 min-w-11 -translate-y-1/2" onClick={() => { setSearch(""); setPage(1); }} aria-label="Effacer la recherche"><X className="size-4" /></Button> : null}
            </div>
            <Select value={eventFilter} onValueChange={(value) => { setEventFilter(value); setPage(1); }}>
              <SelectTrigger className="min-h-11 w-full sm:w-[240px]" aria-label="Filtrer par type de notification"><SelectValue placeholder="Tous les types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Tous les types</SelectItem>{eventTypes.map((type) => <SelectItem key={type} value={type}>{eventLabel(type)}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex shrink-0 rounded-lg border p-1" aria-label="Filtrer par état">
              <Button type="button" size="sm" className="min-h-10" variant={!unreadOnly ? "secondary" : "ghost"} onClick={() => { setUnreadOnly(false); setPage(1); }}>Toutes</Button>
              <Button type="button" size="sm" className="min-h-10" variant={unreadOnly ? "secondary" : "ghost"} onClick={() => { setUnreadOnly(true); setPage(1); }}>Non lues</Button>
            </div>
            {hasFilters ? <Button type="button" variant="ghost" className="min-h-11" onClick={resetFilters}>Réinitialiser</Button> : null}
          </div>
          <p className="text-xs text-slate-500" aria-live="polite">{pagination.total.toLocaleString("fr-FR")} notification{pagination.total === 1 ? "" : "s"} dans cette vue</p>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? <div className="space-y-3 p-5" aria-busy="true">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div> : null}
          {query.isError ? <div className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300" role="alert"><p>{query.error instanceof ApiError ? query.error.message : "Impossible de charger les notifications."}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className="size-4" />Réessayer</Button></div> : null}
          {!query.isLoading && !query.isError && pagination.total === 0 ? <div className="p-6"><EmptyState title={hasFilters ? "Aucun résultat" : "Vous êtes à jour"} description={hasFilters ? "Aucune notification ne correspond à ces filtres." : "Les changements qui vous concernent apparaîtront ici. L’historique complet reste consultable séparément."} /></div> : null}
          {!query.isLoading && !query.isError && pagination.total > 0 ? <>
            <div className="divide-y divide-slate-100 dark:divide-slate-800" role="list" aria-label="Votre boîte de notifications">
              {notifications.map((item) => {
                const unread = !item.readAt;
                return <article key={item.id} role="listitem" className={`flex gap-2 px-3 py-4 sm:gap-4 sm:px-5 ${unread ? "bg-red-50/40 dark:bg-red-950/10" : ""}`}>
                  <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${unread ? "bg-red-100 text-nim-red dark:bg-red-950/60" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}><Bell className="size-4" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={item.href} onClick={() => { if (unread) markRead.mutate(item.id); }} className={`break-words font-semibold hover:text-nim-red hover:underline ${unread ? "text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>{item.title}</Link>
                        <StatusBadge tone={unread ? "info" : "neutral"}>{unread ? "Non lue" : "Lue"}</StatusBadge>
                      </div>
                      <span className="flex min-w-0 max-w-full flex-wrap items-center gap-1 text-xs tabular-nums text-slate-400 sm:flex-nowrap"><Clock3 className="size-3.5" aria-hidden="true" />{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{item.message}</p>
                    {item.actorName ? <p className="mt-1 text-xs text-slate-400">Par {item.actorName}</p> : null}
                  </div>
                  {unread ? <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" aria-label={`Marquer comme lue : ${item.title}`} onClick={() => markRead.mutate(item.id)} disabled={markRead.isPending}><Check className="size-4" /></Button> : null}
                </article>;
              })}
            </div>
            <Pagination page={pagination.page} pageCount={pagination.totalPages} pageSize={pagination.pageSize} total={pagination.total} pageSizes={PAGE_SIZES} itemLabel="notification" onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </> : null}
        </CardContent>
      </Card>
    </div>
  );
}
