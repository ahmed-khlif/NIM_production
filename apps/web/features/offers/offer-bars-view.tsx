"use client";

import { Table } from "@/components/ui/table";
import type { CuttingBarStatus, ManagedCuttingBar } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Factory, Printer, RefreshCw, Search, Scissors, Trash2, Unlink, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";
import {
  ApiError,
  cancelOfferBarRequest,
  getOfferBarsRequest,
  getOfferMaterialReportRequest,
  unassignOfferBarRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { CuttingBarStatusBadge, cuttingBarStatusLabels } from "./offer-bar-ui";
import { groupCuttingBars } from "./cutting-bar-groups";

type ActionTarget = { bar: ManagedCuttingBar; action: "cancel" | "unassign" } | null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function compactReferences(references: string[]): string {
  if (references.length < 2) return references[0] ?? "—";
  const numbered = references.map((reference) => /^(.*?)(\d+)$/.exec(reference));
  const prefix = numbered[0]?.[1];
  const numbers = numbered.map((match) => Number(match?.[2]));
  const contiguous = Boolean(prefix) && numbered.every((match) => match?.[1] === prefix) &&
    numbers.every((value, index) => index === 0 || value === numbers[index - 1]! + 1);
  return contiguous
    ? `${prefix}${numbered[0]?.[2]}–${prefix}${numbered.at(-1)?.[2]}`
    : references.join(", ");
}

function printMaterialReport(report: Awaited<ReturnType<typeof getOfferMaterialReportRequest>>, popup: Window): void {
  const number = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date(report.generatedAt));
  const wasteRate = `${number(report.totals.wasteRate)} %`;
  const materials = report.materials.map((item) => `<tr><td><strong>${escapeHtml(item.profile)}</strong></td><td class="num">${number(item.rawLengthMm)} mm</td><td class="num">${number(item.quantity)}</td><td class="num">${item.netWeightKg === null ? "À renseigner" : `${number(item.netWeightKg)} kg`}</td><td class="num">${item.grossWeightKg === null ? "À renseigner" : `${number(item.grossWeightKg)} kg`}</td><td class="num">${number(item.wasteRate)} %</td></tr>`).join("");
  const cuttingDetails = groupCuttingBars(report.bars).map(({ bar, members }) => {
    const cutCounts = new Map<number, number>();
    for (const item of bar.items) cutCounts.set(item.lengthMm, (cutCounts.get(item.lengthMm) ?? 0) + 1);
    const cutPattern = [...cutCounts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([lengthMm, quantity]) => `${number(lengthMm)} mm${quantity > 1 ? ` × ${quantity}` : ""}`)
      .join(" · ");
    const barReferences = compactReferences(
      members.map((member) => member.reference).sort((left, right) => left.localeCompare(right, "fr", { numeric: true })),
    );
    const pieceReferences = members.flatMap((member) => member.items)
      .map((item) => `${item.reference} × ${item.sequenceNumber}`);
    const totalWaste = bar.wasteMm * members.length;
    const wasteRate = bar.rawLengthMm ? (bar.wasteMm / bar.rawLengthMm) * 100 : 0;
    const machine = bar.machine ? ` · ${escapeHtml(bar.machine.name)}` : "";
    return `<tr class="cut-row"><td><strong>${escapeHtml(bar.profile)}</strong><br><span class="muted">${number(bar.rawLengthMm)} mm brut</span></td><td><strong>${members.length} barre${members.length > 1 ? "s" : ""}</strong><br><span class="refs">${escapeHtml(barReferences)}</span><br><span class="muted">${escapeHtml(cuttingBarStatusLabels[bar.status])}${machine}</span><br><span class="muted">Plan ${escapeHtml(bar.cuttingPlanReference)}</span></td><td class="cut">${cutPattern || "Aucune pièce active"}</td><td class="refs">${pieceReferences.length ? pieceReferences.map(escapeHtml).join(", ") : "—"}</td><td class="num">${bar.netWeightKg === null ? "À renseigner" : `${number(bar.netWeightKg * members.length)} kg net`}<br>${bar.grossWeightKg === null ? "À renseigner" : `${number(bar.grossWeightKg * members.length)} kg brut`}<br>${number(totalWaste)} mm chute · ${number(wasteRate)} %</td></tr>`;
  }).join("");
  const missingWeightNote = [
    report.totals.profilesWithoutWeight.length
      ? `<p class="note">Poids brut indisponible sans poids linéique au catalogue pour : ${report.totals.profilesWithoutWeight.map(escapeHtml).join(", ")}.</p>`
      : "",
    report.totals.profilesWithoutNetWeight.length
      ? `<p class="note">Poids net incomplet : ajoutez un poids par pièce ou un poids linéique au catalogue pour : ${report.totals.profilesWithoutNetWeight.map(escapeHtml).join(", ")}.</p>`
      : "",
  ].join("");
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Besoins matière — ${escapeHtml(report.offer.reference)}</title><style>
    :root{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#172033;background:#fff;font-size:10px}*{box-sizing:border-box}body{margin:0;padding:14mm}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e30613;padding-bottom:12px;margin-bottom:14px}.brand{font-size:11px;font-weight:800;letter-spacing:.16em;color:#e30613}.eyebrow{margin:4px 0;color:#748198;text-transform:uppercase;letter-spacing:.1em;font-size:8px}h1{font-size:20px;margin:5px 0 4px;color:#101827}.meta{color:#5c687a;font-size:10px}.date{text-align:right;color:#667085;line-height:1.6;font-size:9px}.cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:14px 0 18px}.card{border:1px solid #dce2eb;border-radius:6px;padding:9px 10px;background:#f8fafc}.card span{display:block;font-size:8px;color:#718096;text-transform:uppercase;letter-spacing:.07em}.card strong{display:block;font-size:15px;margin-top:4px;color:#111827}h2{font-size:13px;margin:18px 0 5px;color:#172033}p.sub{color:#667085;margin:0 0 8px;line-height:1.45}.note{margin:9px 0;color:#667085;font-size:9px;line-height:1.45}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#f1f4f8;color:#435067;text-align:left;text-transform:uppercase;font-size:8px;letter-spacing:.04em}th,td{padding:6px 7px;border:1px solid #e2e7ef;vertical-align:top}tr{break-inside:avoid}td{line-height:1.35;font-size:9px}.num{text-align:right;font-variant-numeric:tabular-nums}footer{margin-top:14px;padding-top:7px;border-top:1px solid #dce2eb;color:#7a8494;font-size:8px;line-height:1.4}.empty{padding:20px;border:1px dashed #ccd4df;text-align:center;color:#687588;border-radius:6px}@page{size:A4 portrait;margin:9mm}@media print{body{padding:0}thead{display:table-header-group}}
    .muted{color:#667085;font-size:8px}.refs,.cut{overflow-wrap:anywhere;line-height:1.45}.cut-row{break-inside:avoid}.cut-table th:nth-child(1){width:14%}.cut-table th:nth-child(2){width:21%}.cut-table th:nth-child(3){width:22%}.cut-table th:nth-child(4){width:27%}.cut-table th:nth-child(5){width:16%}</style></head><body><header><div><div class="brand">NIM · PRODUCTION</div><p class="eyebrow">Approvisionnement · Façonnage validé</p><h1>Rapport des besoins matière</h1><div class="meta"><strong>${escapeHtml(report.offer.revision)} · ${escapeHtml(report.offer.reference)}</strong> — ${escapeHtml(report.offer.name)}${report.offer.clientName ? ` · ${escapeHtml(report.offer.clientName)}` : ""}${report.offer.site ? ` · ${escapeHtml(report.offer.site)}` : ""}</div></div><div class="date">Édité le<br><strong>${escapeHtml(date)}</strong></div></header>
    <section class="cards"><div class="card"><span>Barres validées</span><strong>${number(report.totals.barCount)}</strong></div><div class="card"><span>Profils concernés</span><strong>${number(report.totals.profileCount)}</strong></div><div class="card"><span>${report.totals.profilesWithoutNetWeight.length ? "Poids net · partiel" : "Poids net des pièces"}</span><strong>${number(report.totals.netWeightKg)} kg</strong></div><div class="card"><span>${report.totals.profilesWithoutWeight.length ? "Poids brut · partiel" : "Poids brut matière"}</span><strong>${number(report.totals.grossWeightKg)} kg</strong></div><div class="card"><span>Taux de chute</span><strong>${wasteRate}</strong></div></section>
    <h2>1. Besoins d’approvisionnement par profil</h2><p class="sub">Poids brut calculé avec le poids linéique du catalogue matière. Le taux de chute rapporte la chute calculée à la longueur brute totale.</p>${materials.length ? `<table><thead><tr><th style="width:17%">Profil</th><th style="width:18%">Longueur brute</th><th style="width:8%">Qté</th><th style="width:19%">Poids net pièces</th><th style="width:20%">Poids brut matière</th><th style="width:18%">Chute (%)</th></tr></thead><tbody>${materials}</tbody></table>` : `<div class="empty">Aucune barre issue d’un plan validé actif pour cette affaire.</div>`}${missingWeightNote}
    <h2>2. Détail de coupe et ressources par barre</h2><p class="sub">Les barres ayant le même profil, la même matière, le même statut et le même schéma de coupe sont regroupées. Les références et les pièces restent listées pour conserver la traçabilité.</p>${cuttingDetails ? `<table class="cut-table"><thead><tr><th>Profil / brut</th><th>Barres / statut</th><th>Schéma de coupe</th><th>Repères des pièces</th><th>Poids net / brut · chute</th></tr></thead><tbody>${cuttingDetails}</tbody></table>` : `<div class="empty">Aucun détail de coupe disponible.</div>`}<footer>Document généré depuis les barres actives des plans de façonnage validés. Le poids brut est estimé à partir du catalogue matière.</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
  popup.document.close();
}
const statuses: CuttingBarStatus[] = [
  "FACONNEE",
  "AFFECTEE",
  "LANCEE",
  "FABRIQUEE",
  "NON_CONFORME",
];

export function OfferBarsView({ offerId }: { offerId: string }): React.ReactNode {
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [search, setSearch] = useState(() => getInitialListParam("search"));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(() => statuses.includes(getInitialListParam("status") as CuttingBarStatus) ? getInitialListParam("status") : "ALL");
  const [profile, setProfile] = useState(() => getInitialListParam("profile", "ALL"));
  const [page, setPage] = useState(() => Math.max(1, Number(getInitialListParam("page", "1")) || 1));
  const [pageSize, setPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("pageSize", "20"))) ? Number(getInitialListParam("pageSize", "20")) : 20);
  const [sorting, setSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "reference", sortDirection: "asc" });
  const [target, setTarget] = useState<ActionTarget>(null);
  const [reportLoading, setReportLoading] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setSearch(urlParams.get("search") ?? "");
    const nextStatus = urlParams.get("status") ?? "ALL";
    setStatus(statuses.includes(nextStatus as CuttingBarStatus) ? nextStatus : "ALL");
    setProfile(urlParams.get("profile") ?? "ALL");
    setPage(Math.max(1, Number(urlParams.get("page")) || 1));
    const nextSize = Number(urlParams.get("pageSize"));
    if ([10, 20, 50].includes(nextSize)) setPageSize(nextSize);
  }, [urlParams]);
  useEffect(() => {
    updateUrl({ search: search.trim(), status: status === "ALL" ? null : status, profile: profile === "ALL" ? null : profile, page, pageSize });
  }, [search, status, profile, page, pageSize, updateUrl]);
  const barsQuery = useQuery({
    queryKey: ["offer", offerId, "bars", page, pageSize, debouncedSearch, status, profile, sorting],
    queryFn: () => getOfferBarsRequest(offerId, { page, pageSize, search: debouncedSearch, status, profile, ...sorting }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (value: NonNullable<ActionTarget>) =>
      value.action === "cancel"
        ? cancelOfferBarRequest(offerId, value.bar.id)
        : unassignOfferBarRequest(offerId, value.bar.id),
    onSuccess: async (_, value) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
        queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bars"] }),
      queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bar-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bar-assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["offer", offerId, "production-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["machines"] }),
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["history"] }),
      ]);
      setTarget(null);
      toast.success(
        value.action === "cancel"
          ? "Barre annulée. Les unités sont à nouveau disponibles pour le façonnage."
          : "Affectation retirée. La barre est de nouveau disponible.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de modifier cette barre.",
      ),
  });
  const bars = barsQuery.data?.bars ?? [];
  const barGroups = useMemo(() => groupCuttingBars(bars), [bars]);
  const profiles = barsQuery.data?.profiles ?? [];
  const pagination = barsQuery.data?.pagination ?? { page, pageSize, total: bars.length, totalPages: 1 };
  const hasFilters = Boolean(search.trim()) || status !== "ALL" || profile !== "ALL";

  const exportMaterialReport = async () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      toast.error("Autorisez les fenêtres contextuelles pour exporter le rapport.");
      return;
    }
    popup.opener = null;
    popup.document.write("<title>Préparation du rapport NIM…</title><p style='font:16px Arial;padding:24px'>Préparation du rapport matière…</p>");
    setReportLoading(true);
    try {
      const report = await getOfferMaterialReportRequest(offerId);
      printMaterialReport(report, popup);
    } catch (error) {
      popup.close();
      toast.error(error instanceof ApiError ? error.message : "Impossible de générer le rapport matière.");
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [pageSize, profile, debouncedSearch, status]);

  if (barsQuery.isLoading)
    return (
      <div className="space-y-4" role="status" aria-label="Chargement des barres">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (barsQuery.isError)
    return (
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-semibold text-red-700">Impossible de charger les barres</p>
          <p className="max-w-lg text-sm text-slate-500">
            {barsQuery.error instanceof ApiError
              ? barsQuery.error.message
              : "Vérifiez la connexion à l’API."}
          </p>
          <Button variant="outline" onClick={() => void barsQuery.refetch()}>
            <RefreshCw className="size-4" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );

  const count = (value: CuttingBarStatus): number =>
    barsQuery.data?.statusCounts[value] ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-nim-red">
            Atelier · Façonnage
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">
            Barres de l’affaire
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Barres générées à partir des plans validés, avec chaque unité de pièce tracée.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void barsQuery.refetch()}
            disabled={barsQuery.isFetching}
          >
            <RefreshCw className={`size-4 ${barsQuery.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button asChild>
            <Link href={`/offers/${offerId}/faconnage`}>
              <Scissors className="size-4" />
              Façonnage
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(
          ["FACONNEE", "AFFECTEE", "LANCEE", "FABRIQUEE", "NON_CONFORME"] as CuttingBarStatus[]
        ).map((value) => (
          <KpiCard
            key={value}
            label={cuttingBarStatusLabels[value]}
            value={count(value).toLocaleString("fr-FR")}
            detail="barres dans cette affaire"
            icon={value === "FABRIQUEE" ? Factory : value === "FACONNEE" ? Scissors : value === "NON_CONFORME" ? X : ArrowRight}
            tone={value === "FABRIQUEE" ? "positive" : value === "NON_CONFORME" ? "danger" : value === "FACONNEE" ? "neutral" : "warning"}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Barres</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                {pagination.total.toLocaleString("fr-FR")} barre(s) correspondent aux filtres
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void exportMaterialReport()} disabled={reportLoading}>
                <Printer className="size-4" />
                {reportLoading ? "Préparation…" : "Imprimer le rapport matière"}
              </Button>
              {canManage ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/offers/${offerId}/bar-assignments`}>
                    <Factory className="size-4" />
                    Affecter des barres
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="nim-offer-sticky-table-tools grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 pr-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher barre, profil, pièce ou machine…"
                aria-label="Rechercher une barre"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => setSearch("")}
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filtrer par statut">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {cuttingBarStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={profile} onValueChange={setProfile}>
              <SelectTrigger aria-label="Filtrer par profil">
                <SelectValue placeholder="Tous les profils" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les profils</SelectItem>
                {profiles.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters ? <Button type="button" variant="ghost" onClick={() => { setSearch(""); setStatus("ALL"); setProfile("ALL"); }}>Réinitialiser</Button> : <span className="hidden md:block" />}
          </div>
          {pagination.total === 0 ? (
            <EmptyState
              title={bars.length ? "Aucun résultat" : "Aucune barre façonnée"}
              description={
                bars.length
                  ? "Modifiez la recherche ou les filtres."
                  : "Validez un plan de façonnage pour générer les barres de cette affaire."
              }
              action={
                !bars.length && canManage ? (
                  <Button asChild>
                    <Link href={`/offers/${offerId}/faconnage`}>
                      Ouvrir le façonnage
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <Table
                  serverSorting={{ column: ({ reference: "Référence", profile: "Profil", rawLengthMm: "Longueur brute", pieces: "Pièces", wasteMm: "Chute", status: "Statut", createdAt: "Référence" } as const)[sorting.sortBy as "reference" | "profile" | "rawLengthMm" | "pieces" | "wasteMm" | "status" | "createdAt"], direction: sorting.sortDirection }}
                  onServerSort={(column, direction) => {
                    const field = ({ "Référence": "reference", Profil: "profile", "Longueur brute": "rawLengthMm", Pièces: "pieces", Chute: "wasteMm", Statut: "status" } as const)[column as "Référence" | "Profil" | "Longueur brute" | "Pièces" | "Chute" | "Statut"];
                    if (field) { setSorting({ sortBy: field, sortDirection: direction }); setPage(1); }
                  }}
                  className="nim-data-table w-full min-w-[900px] text-left text-sm"
                >
                  <caption className="sr-only">Barres façonnées de l’affaire</caption>
                  <thead className="border-b text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-3">Référence</th>
                      <th className="px-3 py-3">Profil</th>
                      <th className="px-3 py-3">Longueur brute</th>
                      <th className="px-3 py-3">Pièces</th>
                      <th className="px-3 py-3">Chute</th>
                      <th className="px-3 py-3">Statut</th>
                      <th className="px-3 py-3" data-sortable="false">Machine</th>
                      <th className="px-3 py-3 text-right" data-sortable="false">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {barGroups.map(({ bar, members }) => (
                      <tr key={bar.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900">
                        <td className="px-3 py-3 font-semibold">
                          <Link
                            href={`/offers/${offerId}/bars/${bar.id}`}
                            className="hover:text-nim-red"
                          >
                            {bar.reference}
                          </Link>
                          {members.length > 1 ? <Badge variant="outline" className="ml-2">× {members.length} identiques</Badge> : null}
                          <details className="mt-2 font-normal">
                            <summary className="cursor-pointer text-xs text-slate-500">Repères à découper · {members.length} barre(s)</summary>
                            <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-2 dark:bg-slate-900">
                              {members.map((member) => <div key={member.id} className="text-xs">
                                <Link className="font-semibold hover:text-nim-red" href={`/offers/${offerId}/bars/${member.id}`}>{member.reference}</Link>
                                <p className="mt-1 text-slate-500">{member.items.filter((item) => item.active).map((item) => `${item.reference} (${item.lengthMm.toLocaleString("fr-FR")} mm)`).join(" · ")}</p>
                              </div>)}
                            </div>
                          </details>
                        </td>
                        <td className="px-3 py-3">{bar.profile}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {bar.rawLengthMm.toLocaleString("fr-FR")} mm
                        </td>
                        <td className="px-3 py-3">
                          <p>{bar.items.filter((item) => item.active).length} pièce(s)</p>
                          <p className="mt-1 max-w-64 text-xs text-slate-500">{bar.items.filter((item) => item.active).map((item) => item.reference).join(", ")}</p>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {bar.wasteMm.toLocaleString("fr-FR")} mm
                        </td>
                        <td className="px-3 py-3">
                          <CuttingBarStatusBadge status={bar.status} />
                        </td>
                        <td className="px-3 py-3">
                          {bar.machine ? (
                            <Link
                              className="hover:text-nim-red"
                              href={`/machines/${bar.machine.id}`}
                            >
                              {bar.machine.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            {canManage && bar.status === "AFFECTEE" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setTarget({ bar, action: "unassign" })}
                              >
                                <Unlink className="size-4" />
                                Retirer
                              </Button>
                            ) : null}
                            {canManage && bar.status === "FACONNEE" ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Annuler la barre ${bar.reference}`}
                                onClick={() => setTarget({ bar, action: "cancel" })}
                              >
                                <Trash2 className="size-4 text-red-600" />
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/offers/${offerId}/bars/${bar.id}`}>Détails</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div className="space-y-3 lg:hidden">
                {barGroups.map(({ bar, members }) => (
                  <div
                    key={bar.id}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/offers/${offerId}/bars/${bar.id}`}
                          className="font-semibold hover:text-nim-red"
                        >
                          {bar.reference}
                        </Link>
                        {members.length > 1 ? <Badge variant="outline" className="ml-2">× {members.length} identiques</Badge> : null}
                        <p className="mt-1 text-xs text-slate-500">
                          {bar.profile} · {bar.rawLengthMm.toLocaleString("fr-FR")} mm ·{" "}
                          {bar.items.filter((item) => item.active).length} pièces
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{bar.items.filter((item) => item.active).map((item) => item.reference).join(", ")}</p>
                      </div>
                      <CuttingBarStatusBadge status={bar.status} />
                    </div>
                    <details className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-900">
                      <summary className="cursor-pointer text-xs font-medium">Repères à découper · {members.length} barre(s)</summary>
                      <div className="mt-2 space-y-2">{members.map((member) => <div key={member.id} className="text-xs">
                        <Link className="font-semibold hover:text-nim-red" href={`/offers/${offerId}/bars/${member.id}`}>{member.reference}</Link>
                        <p className="mt-1 text-slate-500">{member.items.filter((item) => item.active).map((item) => `${item.reference} (${item.lengthMm.toLocaleString("fr-FR")} mm)`).join(" · ")}</p>
                      </div>)}</div>
                    </details>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Chute {bar.wasteMm.toLocaleString("fr-FR")} mm</span>
                      {bar.machine ? (
                        <Link href={`/machines/${bar.machine.id}`} className="hover:text-nim-red">
                          {bar.machine.name}
                        </Link>
                      ) : (
                        <span>Non affectée</span>
                      )}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      {canManage && bar.status === "AFFECTEE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTarget({ bar, action: "unassign" })}
                        >
                          <Unlink className="size-4" />
                          Retirer
                        </Button>
                      ) : null}
                      {canManage && bar.status === "FACONNEE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTarget({ bar, action: "cancel" })}
                        >
                          <Trash2 className="size-4" />
                          Annuler
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/offers/${offerId}/bars/${bar.id}`}>Détails</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {pagination.total > 0 ? (
            <Pagination
              page={pagination.page}
              pageCount={pagination.totalPages}
              pageSize={pagination.pageSize}
              total={pagination.total}
              itemLabel="barre"
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.action === "cancel"
                ? `Annuler ${target.bar.reference} ?`
                : `Retirer ${target?.bar.reference} de ${target?.bar.machine?.name ?? "la machine"} ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.action === "cancel"
                ? "La barre sera conservée dans l’historique et ses unités redeviendront disponibles pour un prochain plan de façonnage."
                : "Cette opération est possible uniquement avant le démarrage de la production. La barre et ses pièces reviendront à l’état façonné."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || !target}
              onClick={() => target && mutation.mutate(target)}
            >
              {mutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : null}
              {target?.action === "cancel" ? "Confirmer l’annulation" : "Retirer l’affectation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
