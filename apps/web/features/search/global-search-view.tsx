"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, BriefcaseBusiness, Factory, Layers3, LoaderCircle, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-provider";
import { getMachinesPageRequest, getOffersRequest, getPiecesRequest, getProductionMonitorRequest } from "@/features/auth/auth-client";
import type { LucideIcon } from "lucide-react";

type GlobalSearchViewProps = { initialQuery: string };
type ResultRow = { id: string; title: string; description: string; href: string };

function ResultSection({ title, icon: Icon, results, total, page, totalPages, onPageChange, onOpen }: { title: string; icon: LucideIcon; results: ResultRow[]; total: number; page: number; totalPages: number; onPageChange: (page: number) => void; onOpen: (href: string) => void }): React.ReactNode {
  if (results.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <Icon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{total}</span>
      </header>
      <ul className="divide-y divide-border">
        {results.map((result) => (
          <li key={result.id}>
            <button type="button" onClick={() => onOpen(result.href)} className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{result.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.description}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
      {totalPages > 1 ? (
        <footer className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-2">
          <span className="text-xs text-muted-foreground">Page {page} sur {totalPages}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Précédent</Button>
            <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Suivant</Button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

export function GlobalSearchView({ initialQuery }: GlobalSearchViewProps): React.ReactNode {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState(initialQuery);
  const [pages, setPages] = useState({ offers: 1, pieces: 1, bars: 1, machines: 1 });
  const query = initialQuery.trim().slice(0, 80);
  const canSearchOffers = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const canSearchPieces = canSearchOffers || user?.role === "QUALITY_CONTROLLER";
  const enabled = query.length >= 2;

  useEffect(() => {
    setSearch(initialQuery);
    setPages({ offers: 1, pieces: 1, bars: 1, machines: 1 });
  }, [initialQuery]);

  const offersQuery = useQuery({
    queryKey: ["global-search", "offers", query, pages.offers],
    queryFn: () => getOffersRequest({ search: query, includeArchived: true, page: pages.offers, pageSize: 10 }),
    enabled: enabled && canSearchOffers,
    staleTime: 15_000,
    retry: false,
  });
  const piecesQuery = useQuery({
    queryKey: ["global-search", "pieces", query, pages.pieces],
    queryFn: () => getPiecesRequest({ search: query, page: pages.pieces, pageSize: 10 }),
    enabled: enabled && canSearchPieces,
    staleTime: 15_000,
    retry: false,
  });
  const machinesQuery = useQuery({
    queryKey: ["global-search", "machines", query, pages.machines],
    queryFn: () => getMachinesPageRequest({ search: query, page: pages.machines, pageSize: 10 }),
    enabled: enabled && canSearchOffers,
    staleTime: 15_000,
    retry: false,
  });
  const barsQuery = useQuery({
    queryKey: ["global-search", "bars", query, pages.bars],
    queryFn: () => getProductionMonitorRequest({ search: query, page: pages.bars, pageSize: 10 }),
    enabled: enabled && canSearchOffers,
    staleTime: 15_000,
    retry: false,
  });

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = search.trim().slice(0, 80);
    if (value) router.push("/search?q=" + encodeURIComponent(value));
  };
  const openResult = (href: string): void => router.push(href);
  const offers = (offersQuery.data?.offers ?? []).map((offer): ResultRow => ({
    id: offer.id,
    title: offer.reference + " · " + offer.name,
    description: [offer.clientName, offer.site, offer.status].filter(Boolean).join(" · "),
    href: "/offers/" + offer.id,
  }));
  const pieces = (piecesQuery.data?.pieces ?? []).map((piece): ResultRow => ({
    id: piece.id,
    title: piece.reference + " · " + piece.profile,
    description: piece.designation + " · " + piece.lengthMm.toLocaleString("fr-FR") + " mm · " + piece.quantity + " unité" + (piece.quantity > 1 ? "s" : ""),
    href: "/offers/" + piece.offerId + "/pieces/" + piece.id,
  }));
  const bars = (barsQuery.data?.bars ?? []).map(({ bar }): ResultRow => ({
    id: bar.id,
    title: bar.reference + " · " + bar.profile,
    description: "Affaire " + bar.offerReference + " · " + bar.status + (bar.machine ? " · " + bar.machine.name : ""),
    href: "/offers/" + bar.offerId + "/bars/" + bar.id,
  }));
  const machines = (machinesQuery.data?.machines ?? []).map((machine): ResultRow => ({
    id: machine.id,
    title: machine.name + " · " + machine.internalNumber,
    description: [machine.type, machine.location ?? machine.status].filter(Boolean).join(" · "),
    href: "/machines/" + machine.id,
  }));
  const resultCount = (offersQuery.data?.pagination.total ?? 0) + (piecesQuery.data?.total ?? 0) + (barsQuery.data?.pagination.total ?? 0) + (machinesQuery.data?.pagination.total ?? 0);
  const enabledQueries = [
    ...(canSearchOffers ? [offersQuery, machinesQuery, barsQuery] : []),
    ...(canSearchPieces ? [piecesQuery] : []),
  ];
  const isLoading = enabled && enabledQueries.some((item) => item.isPending);
  const hasError = enabledQueries.some((item) => item.isError);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recherche globale</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Trouvez un élément dans NIM</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Recherchez une Affaire, un repère de pièce, une barre de production ou une machine. Les résultats sont limités aux pages auxquelles votre rôle donne accès.</p>
      </header>

      <form className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm sm:flex-row" onSubmit={submit} role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="global-search-page-input" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} placeholder="Référence, profil, nom d’affaire, machine…" aria-label="Recherche globale" className="h-11 border-0 bg-muted/40 pl-9 shadow-none focus-visible:ring-1" />
        </div>
        <Button type="submit" className="h-11 sm:min-w-36"><Search className="size-4" />Rechercher</Button>
      </form>

      {!query ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <Search className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-semibold">Saisissez votre recherche</h2>
          <p className="mt-1 text-sm text-muted-foreground">Entrez au moins 2 caractères puis cliquez sur Rechercher.</p>
        </div>
      ) : query.length < 2 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Entrez au moins 2 caractères pour lancer la recherche.</p>
      ) : !canSearchPieces ? (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">La recherche des dossiers est disponible pour les rôles autorisés.</p>
      ) : (
        <div className="space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Résultats pour <strong className="font-semibold text-foreground">« {query} »</strong></span>
            {!isLoading ? <span>· {resultCount} résultat{resultCount === 1 ? "" : "s"} affiché{resultCount === 1 ? "" : "s"}</span> : null}
          </div>
          {isLoading ? <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Recherche dans les données autorisées…</div> : null}
          {hasError ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Certaines catégories n’ont pas pu être chargées. Les résultats disponibles restent affichés.</p> : null}
          <ResultSection title="Affaires" icon={BriefcaseBusiness} results={offers} total={offersQuery.data?.pagination.total ?? 0} page={pages.offers} totalPages={offersQuery.data?.pagination.totalPages ?? 0} onPageChange={(page) => setPages((current) => ({ ...current, offers: page }))} onOpen={openResult} />
          <ResultSection title="Pièces" icon={Layers3} results={pieces} total={piecesQuery.data?.total ?? 0} page={pages.pieces} totalPages={piecesQuery.data?.totalPages ?? 0} onPageChange={(page) => setPages((current) => ({ ...current, pieces: page }))} onOpen={openResult} />
          <ResultSection title="Barres de production" icon={Activity} results={bars} total={barsQuery.data?.pagination.total ?? 0} page={pages.bars} totalPages={barsQuery.data?.pagination.totalPages ?? 0} onPageChange={(page) => setPages((current) => ({ ...current, bars: page }))} onOpen={openResult} />
          <ResultSection title="Machines" icon={Factory} results={machines} total={machinesQuery.data?.pagination.total ?? 0} page={pages.machines} totalPages={machinesQuery.data?.pagination.totalPages ?? 0} onPageChange={(page) => setPages((current) => ({ ...current, machines: page }))} onOpen={openResult} />
          {!isLoading && resultCount === 0 && !hasError ? <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center"><h2 className="text-sm font-semibold">Aucun résultat</h2><p className="mt-1 text-sm text-muted-foreground">Essayez un repère, un profil, une référence d’Affaire ou un nom de machine.</p></div> : null}
        </div>
      )}
    </div>
  );
}
