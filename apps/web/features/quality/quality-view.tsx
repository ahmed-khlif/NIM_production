"use client";

import { Table } from "@/components/ui/table";
import type {
  ManagedQualityControl,
  ManagedQualityPendingUnit,
  QualityControlImage,
  QualityControlResult,
  QualityDefectCategory,
  QualityDisposition,
  ProductionNonConformity,
} from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Filter,
  ImagePlus,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { ReturnLink } from "@/components/navigation/return-navigation";
import { useSearchParams } from "next/navigation";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/auth-provider";
import {
  ApiError,
  decideQualityDeviation,
  getOfferRequest,
  getQualityHistoryRequest,
  getQualityPendingRequest,
  getProductionNonConformitiesRequest,
  getQualityDefectImageUrl,
  removeQualityDefectImageRequest,
  requestQualityDisposition,
  uploadQualityDefectImageRequest,
  validateQualityRequest,
} from "@/features/auth/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const resultLabels: Record<QualityControlResult, string> = {
  CONFORM: "Conforme",
  NON_CONFORM: "Non conforme",
};

const defectLabels: Record<QualityDefectCategory, string> = {
  DIMENSIONAL: "Dimensionnel",
  SURFACE: "Surface",
  MATERIAL: "Matière",
  WELDING: "Soudure",
  FINISH: "Finition",
  DAMAGE: "Dommage",
  OTHER: "Autre",
};

const dispositionLabels: Record<QualityDisposition["type"], string> = {
  REWORK: "Retouche",
  SCRAP: "Mise au rebut",
  REMAKE: "Refabrication",
  DEVIATION: "Dérogation",
};

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

function resultTone(result: QualityControlResult): "active" | "danger" {
  return result === "CONFORM" ? "active" : "danger";
}

function AccessDenied(): React.ReactNode {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Qualité"
        title="Contrôle qualité"
        description="Cette zone est réservée aux équipes autorisées."
      />
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-red-50 p-3 text-nim-red">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">Accès restreint</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Seuls les administrateurs, responsables de production et contrôleurs qualité peuvent
            consulter cette file.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductionNonConformityQueue({
  query,
  search,
  onSearchChange,
  page,
  pageSize,
  sorting,
  onSort,
  onPageChange,
  onPageSizeChange,
}: {
  query: {
    data?: { nonConformities: ProductionNonConformity[]; pagination?: { page: number; pageSize: number; total: number; totalPages: number } };
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  pageSize: number;
  sorting: { sortBy: string; sortDirection: "asc" | "desc" };
  onSort: (sortBy: string, sortDirection: "asc" | "desc") => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}): React.ReactNode {
  const rows = query.data?.nonConformities ?? [];
  const pagination = query.data?.pagination ?? { page, pageSize, total: rows.length, totalPages: 1 };
  return (
    <Card>
      <CardHeader className="nim-sticky-table-tools border-b">
        <CardTitle className="text-sm">Signalements atelier ouverts <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">{pagination.total}</span></CardTitle>
        <p className="text-xs text-slate-500">Déclarés depuis une tablette. Ils restent distincts des unités fabriquées en attente de contrôle qualité.</p>
        <div className="relative mt-3 w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Rechercher pièce, barre ou machine" aria-label="Rechercher une non-conformité atelier" className="pl-9" /></div>
      </CardHeader>
      <CardContent className="p-0">
        {query.isLoading ? <PendingSkeleton /> : query.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-5" role="alert">
            <p className="text-sm text-red-700">{query.error instanceof ApiError ? query.error.message : "Impossible de charger les signalements atelier."}</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Réessayer</Button>
          </div>
        ) : pagination.total === 0 ? (
          <div className="p-5"><EmptyState title="Aucun signalement ouvert" description="Les défauts déclarés par les opérateurs apparaîtront ici." /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="nim-data-table w-full min-w-[760px] text-left text-sm" serverSorting={{ column: sorting.sortBy === "reference" ? "Pièce / barre" : sorting.sortBy === "reason" ? "Motif" : sorting.sortBy === "machine" ? "Machine" : sorting.sortBy === "reportedBy" ? "Signalé par" : "Date", direction: sorting.sortDirection }} onServerSort={(column, direction) => { const sortBy = ({ "Pi\u00e8ce / barre": "reference", Motif: "reason", Machine: "machine", "Signal\u00e9 par": "reportedBy", Date: "reportedAt" } as Record<string, string>)[column]; if (sortBy) onSort(sortBy, direction); }}>
              <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                <th className="px-4 py-3">Pièce / barre</th><th className="px-4 py-3">Motif</th><th className="px-4 py-3">Machine</th><th className="px-4 py-3">Signalé par</th><th className="px-4 py-3">Date</th>
              </tr></thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3"><Link className="font-medium hover:text-nim-red hover:underline" href={`/offers/${row.offerId}/pieces/${row.pieceId}`}>{row.pieceReference} · U{String(row.sequenceNumber).padStart(2, "0")}</Link><p className="text-xs text-slate-500">{row.barReference} · {row.offerReference}</p></td>
                    <td className="px-4 py-3"><StatusBadge tone="danger">{row.reason.replaceAll("_", " ")}</StatusBadge>{row.comment ? <p className="mt-1 max-w-sm whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300" title={row.comment}>{row.comment}</p> : <p className="mt-1 text-xs italic text-slate-400">Aucun commentaire opérateur</p>}</td>
                    <td className="px-4 py-3">{row.machineName}</td>
                    <td className="px-4 py-3">{row.reportedBy.displayName}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(row.reportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {!query.isLoading && !query.isError && pagination.total > 0 ? <Pagination page={pagination.page} pageCount={pagination.totalPages} pageSize={pagination.pageSize} total={pagination.total} pageSizes={[10, 20, 50]} itemLabel="non-conformité" onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} /> : null}
      </CardContent>
    </Card>
  );
}

function PendingSkeleton(): React.ReactNode {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

function QualityDialog({
  target,
  result,
  defectCategory,
  comment,
  error,
  busy,
  onResultChange,
  onDefectCategoryChange,
  onCommentChange,
  onClose,
  onSubmit,
}: {
  target: ManagedQualityPendingUnit | null;
  result: QualityControlResult;
  defectCategory: QualityDefectCategory | "";
  comment: string;
  error: string | null;
  busy: boolean;
  onResultChange: (result: QualityControlResult) => void;
  onDefectCategoryChange: (category: QualityDefectCategory) => void;
  onCommentChange: (comment: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}): React.ReactNode {
  return (
    <Sheet open={Boolean(target)} onOpenChange={(open) => !open && !busy && onClose()}>
      <SheetContent side="right" className="flex h-full w-full flex-col overflow-hidden border-slate-200 bg-white p-0 sm:max-w-[520px] dark:border-slate-800 dark:bg-slate-950">
        <SheetHeader className="border-b border-slate-200 px-6 py-5 pr-12 dark:border-slate-800">
          <SheetTitle>Contrôler cette unité</SheetTitle>
          <SheetDescription>
            {target
              ? `${target.reference} · Unité ${String(target.sequenceNumber).padStart(2, "0")} · ${target.profile}`
              : "Validez le résultat du contrôle."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              aria-pressed={result === "CONFORM"}
              onClick={() => onResultChange("CONFORM")}
              className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                result === "CONFORM"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200"
              }`}
            >
              <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold">Conforme</span>
                <span className="mt-0.5 block text-xs opacity-75">L’unité peut être acceptée.</span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={result === "NON_CONFORM"}
              onClick={() => onResultChange("NON_CONFORM")}
              className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                result === "NON_CONFORM"
                  ? "border-red-300 bg-red-50 text-red-800 ring-2 ring-red-100"
                  : "border-slate-200 bg-white text-slate-600 hover:border-red-200"
              }`}
            >
              <XCircle className="size-5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-sm font-semibold">Non conforme</span>
                <span className="mt-0.5 block text-xs opacity-75">Un motif est obligatoire.</span>
              </span>
            </button>
          </div>
          {result === "NON_CONFORM" ? (
            <div className="space-y-2">
              <Label htmlFor="quality-defect-category">
                Catégorie du défaut <span className="text-nim-red">*</span>
              </Label>
              <Select
                value={defectCategory}
                onValueChange={(value) => onDefectCategoryChange(value as QualityDefectCategory)}
              >
                <SelectTrigger id="quality-defect-category" aria-label="Catégorie du défaut">
                  <SelectValue placeholder="Sélectionnez une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(defectLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="quality-comment">
              Commentaire{" "}
              {result === "NON_CONFORM" ? <span className="text-nim-red">*</span> : null}
            </Label>
            <textarea
              id="quality-comment"
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder={
                result === "NON_CONFORM" ? "Décrivez le défaut observé" : "Observation facultative"
              }
              rows={4}
              maxLength={1000}
              className="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-right text-xs text-slate-400">{comment.length}/1000</p>
          </div>
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <SheetFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            onClick={onSubmit}
            disabled={busy}
            className={result === "NON_CONFORM" ? "bg-red-600 hover:bg-red-700" : undefined}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardCheck className="size-4" />
            )}
            Confirmer {resultLabels[result].toLowerCase()}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function QualityView({ offerId: scopedOfferId }: { offerId?: string } = {}): React.ReactNode {
  const { user } = useAuth();
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const searchParams = useSearchParams();
  const offerId = scopedOfferId ?? (searchParams.get("offerId")?.trim() || undefined);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => getInitialListParam("search"));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pendingPage, setPendingPage] = useState(() => Math.max(1, Number(getInitialListParam("pendingPage", "1")) || 1));
  const [pendingPageSize, setPendingPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("pendingPageSize", "20"))) ? Number(getInitialListParam("pendingPageSize", "20")) : 20);
  const [pendingSorting, setPendingSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "manufacturedAt", sortDirection: "asc" });
  const [resultFilter, setResultFilter] = useState<QualityControlResult | "ALL">(() => ["ALL", "CONFORM", "NON_CONFORM"].includes(getInitialListParam("result", "ALL")) ? getInitialListParam("result", "ALL") as QualityControlResult | "ALL" : "ALL");
  const [target, setTarget] = useState<ManagedQualityPendingUnit | null>(null);
  const [result, setResult] = useState<QualityControlResult>("CONFORM");
  const [defectCategory, setDefectCategory] = useState<QualityDefectCategory | "">("");
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(() => Math.max(1, Number(getInitialListParam("historyPage", "1")) || 1));
  const [historyPageSize, setHistoryPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("historyPageSize", "10"))) ? Number(getInitialListParam("historyPageSize", "10")) : 10);
  const [productionNcSearch, setProductionNcSearch] = useState(() => getInitialListParam("ncSearch"));
  const [productionNcDebounced, setProductionNcDebounced] = useState("");
  const [productionNcPage, setProductionNcPage] = useState(() => Math.max(1, Number(getInitialListParam("ncPage", "1")) || 1));
  const [productionNcPageSize, setProductionNcPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("ncPageSize", "20"))) ? Number(getInitialListParam("ncPageSize", "20")) : 20);
  const [productionNcSorting, setProductionNcSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "reportedAt", sortDirection: "desc" });
  const [activeQualityTab, setActiveQualityTab] = useState("pending");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setProductionNcDebounced(productionNcSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [productionNcSearch]);
  useEffect(() => setProductionNcPage(1), [productionNcDebounced, productionNcPageSize]);
  useEffect(() => {
    setSearch(urlParams.get("search") ?? "");
    setPendingPage(Math.max(1, Number(urlParams.get("pendingPage")) || 1));
    setHistoryPage(Math.max(1, Number(urlParams.get("historyPage")) || 1));
    setProductionNcSearch(urlParams.get("ncSearch") ?? "");
    setProductionNcPage(Math.max(1, Number(urlParams.get("ncPage")) || 1));
    const pendingSize = Number(urlParams.get("pendingPageSize"));
    if ([10, 20, 50].includes(pendingSize)) setPendingPageSize(pendingSize);
    const historySize = Number(urlParams.get("historyPageSize"));
    if ([10, 20, 50].includes(historySize)) setHistoryPageSize(historySize);
    const ncSize = Number(urlParams.get("ncPageSize"));
    if ([10, 20, 50].includes(ncSize)) setProductionNcPageSize(ncSize);
    const nextResult = urlParams.get("result") ?? "ALL";
    setResultFilter(["ALL", "CONFORM", "NON_CONFORM"].includes(nextResult) ? nextResult as QualityControlResult | "ALL" : "ALL");
  }, [urlParams]);
  useEffect(() => {
    updateUrl({ search: search.trim(), pendingPage, pendingPageSize, historyPage, historyPageSize, result: resultFilter, ncSearch: productionNcSearch.trim(), ncPage: productionNcPage, ncPageSize: productionNcPageSize });
  }, [search, pendingPage, pendingPageSize, historyPage, historyPageSize, resultFilter, productionNcSearch, productionNcPage, productionNcPageSize, updateUrl]);
  const canReview = Boolean(
    user && ["ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER"].includes(user.role),
  );
  const canValidate = Boolean(user && ["ADMIN", "QUALITY_CONTROLLER"].includes(user.role));
  const canManageDisposition = Boolean(user && ["ADMIN", "PRODUCTION_MANAGER"].includes(user.role));
  const canApproveDeviation = user?.role === "ADMIN";
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId ?? ""),
    enabled: Boolean(offerId),
    retry: false,
  });

  function refreshQualityProjections(): void {
    void queryClient.invalidateQueries({ queryKey: ["quality"] });
    void queryClient.invalidateQueries({ queryKey: ["pieces"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["history"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    if (offerId) {
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "production-summary"] });
    }
  }

  const pendingQuery = useQuery({
    queryKey: ["quality", "pending", offerId ?? "ALL", pendingPage, pendingPageSize, debouncedSearch, pendingSorting],
    queryFn: () => getQualityPendingRequest(offerId, { page: pendingPage, pageSize: pendingPageSize, search: debouncedSearch, ...pendingSorting }),
    enabled: canReview,
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["quality", "history", offerId ?? "ALL", historyPage, historyPageSize, debouncedSearch, resultFilter],
    queryFn: () => getQualityHistoryRequest(offerId, { page: historyPage, pageSize: historyPageSize, search: debouncedSearch, result: resultFilter }),
    enabled: canReview,
    retry: false,
  });
  const productionNcQuery = useQuery({
    queryKey: ["quality", "production-non-conformities", offerId ?? "ALL", productionNcPage, productionNcPageSize, productionNcDebounced, productionNcSorting],
    queryFn: () => getProductionNonConformitiesRequest({ offerId, page: productionNcPage, pageSize: productionNcPageSize, search: productionNcDebounced, ...productionNcSorting }),
    enabled: canReview,
    refetchInterval: 15_000,
    retry: false,
  });
  const openWorkshopNcCount = productionNcQuery.data?.pagination?.total ?? 0;
  const validateMutation = useMutation({
    mutationFn: ({
      pieceUnitId,
      decision,
    }: {
      pieceUnitId: string;
      decision: {
        result: QualityControlResult;
        comment?: string;
        defectCategory?: QualityDefectCategory;
      };
    }) => validateQualityRequest(pieceUnitId, decision),
    onSuccess: () => {
      refreshQualityProjections();
      setTarget(null);
      setDefectCategory("");
      setComment("");
      setFormError(null);
      toast.success("Contrôle qualité enregistré");
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError ? error.message : "Impossible d’enregistrer le contrôle.",
      );
    },
  });

  const pendingUnits = pendingQuery.data?.units ?? [];
  const history = historyQuery.data?.controls ?? [];
  const filteredUnits = pendingUnits;
  const filteredHistory = history;
  const pendingPagination = pendingQuery.data?.pagination ?? { page: pendingPage, pageSize: pendingPageSize, total: pendingUnits.length, totalPages: 1 };
  const historyPagination = historyQuery.data?.pagination ?? { page: historyPage, pageSize: historyPageSize, total: history.length, totalPages: Math.max(1, Math.ceil(history.length / historyPageSize)) };
  const hasFilters = Boolean(search.trim()) || resultFilter !== "ALL";
  const historyPageCount = historyPagination.totalPages;
  const currentHistoryPage = historyPagination.page;
  const pagedHistory = filteredHistory;

  useEffect(() => {
    setHistoryPage(1);
    setPendingPage(1);
  }, [debouncedSearch, resultFilter, historyPageSize, pendingPageSize]);
  useEffect(() => {
    if (pendingPage > pendingPagination.totalPages) setPendingPage(pendingPagination.totalPages);
    if (historyPage > historyPagination.totalPages) setHistoryPage(historyPagination.totalPages);
  }, [historyPage, historyPagination.totalPages, pendingPage, pendingPagination.totalPages]);

  function openControl(unit: ManagedQualityPendingUnit): void {
    setTarget(unit);
    setResult("CONFORM");
    setDefectCategory("");
    setComment("");
    setFormError(null);
  }

  function submitControl(): void {
    if (!target || !canValidate) return;
    const normalizedComment = comment.trim();
    if (result === "NON_CONFORM" && !normalizedComment) {
      setFormError("Un commentaire est obligatoire pour une non-conformité.");
      return;
    }
    if (result === "NON_CONFORM" && !defectCategory) {
      setFormError("Choisissez une catégorie de défaut.");
      return;
    }
    validateMutation.mutate({
      pieceUnitId: target.pieceUnitId,
      decision: {
        result,
        comment: normalizedComment || undefined,
        defectCategory: defectCategory || undefined,
      },
    });
  }

  function resetFilters(): void {
    setSearch("");
    setResultFilter("ALL");
    setHistoryPage(1);
  }

  if (!canReview) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={offerId ? "Offre · Qualité" : "Production · Qualité"}
        title="Contrôle qualité"
        description={
          offerId && offerQuery.data?.offer
            ? `Contrôles limités à ${offerQuery.data.offer.reference} — ${offerQuery.data.offer.name}.`
            : "Examinez chaque unité fabriquée et conservez une décision traçable."
        }
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {offerId ? (
              <Button variant="outline" asChild>
                <ReturnLink href={`/offers/${offerId}`}>Retour à l’affaire</ReturnLink>
              </Button>
            ) : null}
            <StatusBadge tone={canValidate ? "active" : "neutral"}>
              {canValidate ? "Validation active" : "Mode consultation"}
            </StatusBadge>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                void pendingQuery.refetch();
                void historyQuery.refetch();
                void productionNcQuery.refetch();
              }}
              disabled={pendingQuery.isFetching || historyQuery.isFetching || productionNcQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${pendingQuery.isFetching || historyQuery.isFetching || productionNcQuery.isFetching ? "animate-spin" : ""}`}
              />
              Actualiser
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="À contrôler"
          value={String(pendingPagination.total)}
          detail="Unités en attente"
          icon={ClipboardCheck}
          tone={pendingPagination.total ? "warning" : "positive"}
        />
        <KpiCard
          label="Contrôles récents"
          value={String(historyPagination.total)}
          detail="Contrôles dans l’historique"
          icon={ShieldCheck}
          tone="neutral"
        />
        <KpiCard
          label="Non conformes"
          value={String(history.filter((item) => item.result === "NON_CONFORM").length)}
          detail="Non conformes sur cette page"
          icon={XCircle}
          tone="danger"
        />
      </div>

      {offerId && openWorkshopNcCount > 0 ? (
        <Card className="border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-lg bg-red-100 p-2 text-red-700 dark:bg-red-950 dark:text-red-300"><AlertTriangle className="size-4" aria-hidden="true" /></span>
              <div>
                <p className="font-semibold text-red-900 dark:text-red-200">
                  {openWorkshopNcCount} signalement{openWorkshopNcCount > 1 ? "s" : ""} ouvert{openWorkshopNcCount > 1 ? "s" : ""} pour cette Affaire
                </p>
                <p className="mt-1 text-sm text-red-800/80 dark:text-red-300/80">
                  Les alertes opérateur sont suivies dans l’atelier ; elles n’apparaissent pas dans « À contrôler » avant la fin de fabrication.
                </p>
              </div>
            </div>
            <Button variant="outline" className="shrink-0 border-red-200 bg-white text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-slate-950 dark:text-red-200" onClick={() => setActiveQualityTab("workshop")}>
              Voir les signalements
              <XCircle className="size-4" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={activeQualityTab} onValueChange={setActiveQualityTab} className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto bg-slate-100 p-1 sm:w-auto dark:bg-slate-900">
          <TabsTrigger value="pending" className="gap-2">
            À traiter
            {pendingUnits.length > 0 ? <Badge variant="outline">{pendingUnits.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="workshop" className="gap-2">
            Signalements atelier
            {(productionNcQuery.data?.pagination?.total ?? productionNcQuery.data?.nonConformities.length ?? 0) > 0 ? (
              <Badge variant="outline">{productionNcQuery.data?.pagination?.total ?? productionNcQuery.data?.nonConformities.length}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="workshop" className="mt-0">
          <ProductionNonConformityQueue query={productionNcQuery} search={productionNcSearch} onSearchChange={setProductionNcSearch} page={productionNcPage} pageSize={productionNcPageSize} sorting={productionNcSorting} onSort={(sortBy, sortDirection) => { setProductionNcSorting({ sortBy, sortDirection }); setProductionNcPage(1); }} onPageChange={setProductionNcPage} onPageSizeChange={setProductionNcPageSize} />
        </TabsContent>

        <TabsContent value="pending" className="mt-0">
      <Card>
        <CardHeader className="nim-sticky-table-tools gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Unités en attente</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Les unités sont disponibles après la fin de fabrication.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-600" aria-live="polite">
              {pendingPagination.total.toLocaleString("fr-FR")} {pendingPagination.total === 1 ? "unité correspond" : "unités correspondent"} à la recherche
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une unité"
              aria-label="Rechercher une unité"
              className="pl-9 pr-9"
            />
            {search ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                aria-label="Effacer la recherche qualité"
                onClick={() => setSearch("")}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {pendingQuery.isLoading ? (
            <PendingSkeleton />
          ) : pendingQuery.isError ? (
            <div
              className="flex min-h-48 flex-col items-center justify-center p-8 text-center"
              role="alert"
            >
              <p className="text-sm font-semibold text-red-700">
                Impossible de charger la file qualité
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {pendingQuery.error instanceof ApiError
                  ? pendingQuery.error.message
                  : "Vérifiez la connexion à l’API."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void pendingQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : pendingPagination.total === 0 ? (
            <div className="p-5">
              <EmptyState
                title={search ? "Aucun résultat" : "Aucune unité à contrôler"}
                description={
                  search
                    ? "Modifiez votre recherche."
                    : "La file qualité est à jour. Les prochaines unités fabriquées apparaîtront ici."
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <Table className="nim-data-table w-full text-left text-sm" serverSorting={{ column: pendingSorting.sortBy === "reference" ? "Unité" : pendingSorting.sortBy === "machine" ? "Machine / opérateur" : pendingSorting.sortBy === "priority" ? "Priorité" : "Fabriquée", direction: pendingSorting.sortDirection }} onServerSort={(column, direction) => { const sortBy = ({ "Unit\u00e9": "reference", "Machine / op\u00e9rateur": "machine", "Priorit\u00e9": "priority", "Fabriqu\u00e9e": "manufacturedAt" } as Record<string, string>)[column]; if (sortBy) { setPendingSorting({ sortBy, sortDirection: direction }); setPendingPage(1); } }}>
                  <caption className="sr-only">
                    File des unités en attente de contrôle qualité
                  </caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Unité</th>
                      <th className="px-5 py-3 font-medium">Machine / opérateur</th>
                      <th className="px-5 py-3 font-medium">Priorité</th>
                      <th className="px-5 py-3 font-medium">Fabriquée</th>
                      <th className="px-5 py-3 text-right font-medium" data-sortable="false">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUnits.map((unit) => (
                      <tr key={unit.pieceUnitId} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <Link
                            href={offerId ? `/offers/${offerId}/pieces/${unit.pieceId}` : "/offers"}
                            className="font-semibold text-slate-900 underline-offset-4 hover:text-nim-red hover:underline"
                          >
                            {unit.reference} · U{String(unit.sequenceNumber).padStart(2, "0")}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">
                            {unit.profile} · {unit.lengthMm} mm
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <Factory className="size-3.5" />
                              {unit.machineName ?? "Machine non renseignée"}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <UserRound className="size-3.5" />
                              {unit.operatorName ?? "Opérateur non renseigné"}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <PriorityBadge priority={unit.priority} />
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {formatDate(unit.manufacturedAt)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            size="sm"
                            onClick={() => openControl(unit)}
                            disabled={!canValidate}
                          >
                            <ClipboardCheck className="size-4" />
                            Contrôler
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {filteredUnits.map((unit) => (
                  <div key={unit.pieceUnitId} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={offerId ? `/offers/${offerId}/pieces/${unit.pieceId}` : "/offers"}
                          className="truncate font-semibold text-slate-900 underline-offset-4 hover:text-nim-red hover:underline"
                        >
                          {unit.reference} · U{String(unit.sequenceNumber).padStart(2, "0")}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {unit.profile} · {unit.lengthMm} mm
                        </p>
                      </div>
                      <PriorityBadge priority={unit.priority} />
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Factory className="size-3.5" />
                        {unit.machineName ?? "Machine non renseignée"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <UserRound className="size-3.5" />
                        {unit.operatorName ?? "Opérateur non renseigné"}
                      </span>
                      <span>Fabriquée {formatDate(unit.manufacturedAt)}</span>
                    </div>
                    <Button
                      className="mt-4 w-full"
                      onClick={() => openControl(unit)}
                      disabled={!canValidate}
                    >
                      <ClipboardCheck className="size-4" />
                      Contrôler cette unité
                    </Button>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                <Pagination
                  page={pendingPagination.page}
                  pageCount={pendingPagination.totalPages}
                  pageSize={pendingPagination.pageSize}
                  total={pendingPagination.total}
                  itemLabel="unité"
                  onPageChange={setPendingPage}
                  onPageSizeChange={(size) => { setPendingPageSize(size); setPendingPage(1); }}
                  pageSizes={[10, 20, 50]}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-0">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Historique des contrôles</CardTitle>
            <p className="mt-2 text-xs font-medium text-slate-600" aria-live="polite">
              {historyPagination.total.toLocaleString("fr-FR")} {historyPagination.total === 1 ? "décision correspond" : "décisions correspondent"} aux filtres
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Filter className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
            <Select
              value={resultFilter}
              onValueChange={(value) => setResultFilter(value as QualityControlResult | "ALL")}
            >
              <SelectTrigger
                className="w-full sm:w-[190px]"
                aria-label="Filtrer les décisions qualité"
              >
                <SelectValue placeholder="Tous les résultats" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les résultats</SelectItem>
                <SelectItem value="CONFORM">Conformes</SelectItem>
                <SelectItem value="NON_CONFORM">Non conformes</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                Réinitialiser
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <PendingSkeleton />
          ) : historyQuery.isError ? (
            <div
              className="flex min-h-36 flex-col items-center justify-center p-8 text-center"
              role="alert"
            >
              <p className="text-sm font-semibold text-red-700">
                Impossible de charger l’historique qualité
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
          ) : history.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucun contrôle enregistré"
                description="Les décisions qualité apparaîtront ici après la première validation."
              />
            </div>
          ) : historyPagination.total === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucun résultat"
                description="Aucun contrôle ne correspond au filtre sélectionné."
                action={
                  <Button type="button" variant="outline" onClick={resetFilters}>
                    Réinitialiser les filtres
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {pagedHistory.map((control) => (
                  <QualityLifecycleRow
                    key={control.id}
                    control={control}
                    offerId={offerId}
                    canManageDisposition={canManageDisposition}
                    canApproveDeviation={canApproveDeviation}
                    canManagePhotos={canValidate}
                    onChanged={refreshQualityProjections}
                  />
                ))}
              </div>
              <div className="border-t border-slate-200 p-4 dark:border-slate-800">
                <Pagination
                  page={currentHistoryPage}
                  pageCount={historyPageCount}
                  pageSize={historyPageSize}
                  total={historyPagination.total}
                  itemLabel="contrôle"
                  onPageChange={setHistoryPage}
                  onPageSizeChange={(nextPageSize) => {
                    setHistoryPageSize(nextPageSize);
                    setHistoryPage(1);
                  }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      <QualityDialog
        target={target}
        result={result}
        defectCategory={defectCategory}
        comment={comment}
        error={formError}
        busy={validateMutation.isPending}
        onResultChange={setResult}
        onDefectCategoryChange={setDefectCategory}
        onCommentChange={setComment}
        onClose={() => setTarget(null)}
        onSubmit={submitControl}
      />
    </div>
  );
}

function QualityLifecycleRow({
  control,
  offerId,
  canManageDisposition,
  canApproveDeviation,
  canManagePhotos,
  onChanged,
}: {
  control: ManagedQualityControl;
  offerId?: string;
  canManageDisposition: boolean;
  canApproveDeviation: boolean;
  canManagePhotos: boolean;
  onChanged: () => void;
}): React.ReactNode {
  const [dispositionType, setDispositionType] = useState<QualityDisposition["type"]>("REWORK");
  const [reason, setReason] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const disposition = control.disposition;

  const run = async (action: () => Promise<void>, successMessage: string) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      onChanged();
    } catch (actionError) {
      const message =
        actionError instanceof ApiError
          ? actionError.message
          : "L’opération n’a pas pu être terminée.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const submitDisposition = () => {
    if (reason.trim().length < 3) {
      setError("Expliquez la décision avant de continuer.");
      return;
    }
    void run(
      async () => {
        await requestQualityDisposition(control.pieceUnitId, {
          type: dispositionType,
          reason: reason.trim(),
        });
        setReason("");
      },
      dispositionType === "DEVIATION"
        ? "Demande de dérogation envoyée pour approbation."
        : `Décision ${dispositionLabels[dispositionType].toLowerCase()} enregistrée.`,
    );
  };

  const decideDeviation = (decision: "APPROVE" | "REJECT") => {
    if (!disposition) return;
    void run(
      async () => {
        await decideQualityDeviation(disposition.id, {
          decision,
          comment: approvalComment.trim() || undefined,
        });
        setApprovalComment("");
      },
      decision === "APPROVE" ? "Dérogation approuvée." : "Dérogation refusée.",
    );
  };

  const uploadImages = (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const invalidFile = selectedFiles.find(
      (file) =>
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024,
    );
    if (invalidFile) {
      setError("Chaque photo doit être un fichier JPG, PNG ou WebP de 5 Mo maximum.");
      return;
    }
    void run(
      async () => {
        setImageBusy(true);
        try {
          for (const file of selectedFiles) {
            await uploadQualityDefectImageRequest(control.id, file);
          }
        } finally {
          setImageBusy(false);
          if (inputRef.current) inputRef.current.value = "";
        }
      },
      selectedFiles.length === 1 ? "Photo du défaut ajoutée." : "Photos des défauts ajoutées.",
    );
  };

  const removeImage = (image: QualityControlImage) => {
    void run(
      () => removeQualityDefectImageRequest(control.id, image.id).then(() => undefined),
      "Photo du défaut supprimée.",
    );
  };

  return (
    <div className="border-b border-slate-100 p-4 last:border-b-0 sm:p-5">
      <HistoryRow control={control} offerId={offerId} />
      {control.result !== "NON_CONFORM" ? null : (
        <div className="mt-4 space-y-4 rounded-xl border border-red-100 bg-red-50/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Traitement de la non-conformité
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Cycle {control.cycle} · Catégorie :{" "}
                {control.defectCategory ? defectLabels[control.defectCategory] : "Non précisée"}
              </p>
            </div>
            {disposition ? (
              <StatusBadge
                tone={
                  disposition.status === "REJECTED"
                    ? "danger"
                    : disposition.status === "PENDING"
                      ? "warning"
                      : "active"
                }
              >
                {dispositionLabels[disposition.type]} ·{" "}
                {disposition.status === "PENDING"
                  ? "À approuver"
                  : disposition.status === "APPROVED"
                    ? "Approuvée"
                    : disposition.status === "REJECTED"
                      ? "Refusée"
                      : "Terminée"}
              </StatusBadge>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Photos du défaut
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  JPG, PNG ou WebP · 5 Mo maximum par photo · 10 photos par contrôle
                </p>
              </div>
              {canManagePhotos ? (
                <>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(event) => uploadImages(event.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => inputRef.current?.click()}
                    disabled={imageBusy || busy}
                  >
                    {imageBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ImagePlus className="size-4" />
                    )}
                    Ajouter des photos
                  </Button>
                </>
              ) : null}
            </div>
            {control.images.length === 0 ? (
              <p className="rounded-lg border border-dashed border-red-200 bg-white/70 px-3 py-4 text-center text-xs text-slate-500">
                Aucune photo attachée à ce contrôle.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {control.images.map((image) => (
                  <div
                    key={image.id}
                    className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white"
                  >
                    <img
                      src={getQualityDefectImageUrl(control.id, image.id)}
                      alt={image.originalName}
                      className="aspect-square w-full object-cover"
                    />
                    {canManagePhotos ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-1 top-1 size-8 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Supprimer ${image.originalName}`}
                        onClick={() => removeImage(image)}
                        disabled={busy}
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    ) : null}
                    <p className="truncate px-2 py-1.5 text-[11px] text-slate-500">
                      {image.originalName}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {disposition?.type === "DEVIATION" &&
          disposition.status === "PENDING" &&
          canApproveDeviation ? (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Approbation de la dérogation</p>
                <p className="mt-1 text-xs text-slate-600">
                  Une approbation admin acceptera l’unité malgré le défaut. Un refus conserve la
                  non-conformité.
                </p>
              </div>
              <textarea
                value={approvalComment}
                onChange={(event) => setApprovalComment(event.target.value)}
                placeholder="Commentaire d’approbation (optionnel)"
                className="min-h-20 w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none ring-offset-white placeholder:text-slate-400 focus:ring-2 focus:ring-amber-400"
                maxLength={1000}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => decideDeviation("REJECT")}
                  disabled={busy}
                >
                  Refuser
                </Button>
                <Button type="button" onClick={() => decideDeviation("APPROVE")} disabled={busy}>
                  <CheckCircle2 className="size-4" />
                  Approuver
                </Button>
              </div>
            </div>
          ) : null}

          {!disposition && canManageDisposition ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Décision de traitement</p>
                <p className="mt-1 text-xs text-slate-500">
                  Le retraitement et la refabrication renvoient l’unité dans la file de production.
                  La mise au rebut est définitive.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
                <Select
                  value={dispositionType}
                  onValueChange={(value) => setDispositionType(value as QualityDisposition["type"])}
                >
                  <SelectTrigger aria-label="Type de traitement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(dispositionLabels) as QualityDisposition["type"][]).map(
                      (type) => (
                        <SelectItem key={type} value={type}>
                          {dispositionLabels[type]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Motif et instruction de traitement"
                  maxLength={1000}
                />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={submitDisposition} disabled={busy || !reason.trim()}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                  Enregistrer la décision
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ control, offerId }: { control: ManagedQualityControl; offerId?: string }): React.ReactNode {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={
            control.result === "CONFORM"
              ? "rounded-full bg-emerald-50 p-2 text-emerald-600"
              : "rounded-full bg-red-50 p-2 text-red-600"
          }
        >
          {control.result === "CONFORM" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <XCircle className="size-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={offerId ? `/offers/${offerId}/pieces/${control.pieceId}` : "/offers"}
              className="font-medium text-slate-900 underline-offset-4 hover:text-nim-red hover:underline"
            >
              {control.reference} · U{String(control.sequenceNumber).padStart(2, "0")}
            </Link>
            <StatusBadge tone={resultTone(control.result)}>
              {resultLabels[control.result]}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {control.controllerName} · {formatDate(control.controlledAt)}
          </p>
          {control.comment ? (
            <p className="mt-2 text-sm text-slate-600">{control.comment}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
