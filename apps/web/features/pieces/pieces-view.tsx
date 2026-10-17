"use client";

import type { ManagedPiece, PiecePriority } from "@nim/types";
import { createPieceSchema, updatePieceSchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronRight,
  Copy,
  Eye,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  archivePieceRequest,
  archiveOfferPieceRequest,
  createPieceRequest,
  createOfferPieceRequest,
  getPiecesRequest,
  getOfferPiecesRequest,
  type ManagedPieceListItem,
  type PieceProductionStatus,
  getOfferRequest,
  updatePieceRequest,
  updateOfferPieceRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";

type PieceForm = {
  reference: string;
  quantity: string;
  profile: string;
  quality: string;
  lengthMm: string;
  unitWeightKg: string;
  designation: string;
};

type PieceFormErrors = Partial<Record<keyof PieceForm, string>>;

const emptyForm: PieceForm = {
  reference: "",
  quantity: "1",
  profile: "",
  quality: "",
  lengthMm: "",
  unitWeightKg: "",
  designation: "",
};

function formatNumber(value: number, maximumFractionDigits = 3): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits,
  }).format(value);
}

function formatWeight(value: number | null): string {
  return value === null ? "—" : `${formatNumber(value, 3)} kg`;
}

const productionStatusLabels: Record<PieceProductionStatus, string> = {
  PENDING: "En attente",
  FACONNEE: "Façonnée",
  AFFECTEE: "Affectée",
  LANCEE: "Lancée",
  FABRIQUEE: "Fabriquée",
};

const productionStatusTone: Record<PieceProductionStatus, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-600",
  FACONNEE: "border-slate-300 bg-white text-slate-700",
  AFFECTEE: "border-red-100 bg-red-50 text-nim-red",
  LANCEE: "border-amber-200 bg-amber-50 text-amber-800",
  FABRIQUEE: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function PieceProductionSummary({ piece }: { piece: ManagedPieceListItem }): React.ReactNode {
  const counts = piece.productionStatusCounts ?? {
    PENDING: piece.quantity,
    FACONNEE: 0,
    AFFECTEE: 0,
    LANCEE: 0,
    FABRIQUEE: 0,
  };
  const entries = (Object.entries(counts) as Array<[PieceProductionStatus, number]>).filter(
    ([, count]) => count > 0,
  );
  if (entries.length === 0) return <span className="text-xs text-slate-400">—</span>;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (entries.length === 1) {
    const [status, count] = entries[0];
    return (
      <Badge
        variant="outline"
        className={`whitespace-nowrap text-[10px] ${productionStatusTone[status]}`}
      >
        {count}/{total} {productionStatusLabels[status]}
        {count > 1 ? "s" : ""}
      </Badge>
    );
  }
  return (
    <div className="flex max-w-[220px] flex-wrap gap-1">
      {entries.slice(0, 2).map(([status, count]) => (
        <Badge
          key={status}
          variant="outline"
          className={`whitespace-nowrap text-[10px] ${productionStatusTone[status]}`}
        >
          {count} {productionStatusLabels[status]}
          {count > 1 ? "s" : ""}
        </Badge>
      ))}
      {entries.length > 2 ? (
        <Badge variant="outline" className="text-[10px]">
          +{entries.length - 2}
        </Badge>
      ) : null}
    </div>
  );
}

function PieceFormSheet({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  fieldErrors,
  error,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ManagedPiece | null;
  form: PieceForm;
  setForm: (form: PieceForm) => void;
  fieldErrors: PieceFormErrors;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}): React.ReactNode {
  const setField = <K extends keyof PieceForm>(field: K, value: PieceForm[K]): void =>
    setForm({ ...form, [field]: value });

  const quantity = Number(form.quantity);
  const unitWeight = Number(form.unitWeightKg);
  const calculatedTotalWeight =
    Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitWeight) && unitWeight >= 0
      ? quantity * unitWeight
      : null;

  const fieldError = (field: keyof PieceForm): React.ReactNode =>
    fieldErrors[field] ? (
      <p className="text-xs font-medium text-nim-red" role="alert">
        {fieldErrors[field]}
      </p>
    ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col overflow-hidden border-slate-200 bg-white p-0 sm:max-w-[470px] dark:border-slate-800 dark:bg-slate-950"
      >
        <SheetHeader className="border-b border-slate-200 px-6 py-5 pr-12 dark:border-slate-800">
          <SheetTitle>{editing ? "Modifier la pièce" : "Ajouter une pièce"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Modifiez les données métier. Le repère et la quantité restent inchangés afin de préserver l’identité des unités."
              : "Renseignez les mêmes informations que celles utilisées dans la liste Tekla."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="piece-reference">
              Repère <span className="text-nim-red">*</span>
            </Label>
            <Input
              id="piece-reference"
              value={form.reference}
              disabled={Boolean(editing)}
              onChange={(event) => setField("reference", event.target.value)}
              placeholder="P-001"
              aria-invalid={Boolean(fieldErrors.reference)}
            />
            {editing ? (
              <p className="text-xs text-slate-400">Le repère est immuable après création.</p>
            ) : null}
            {fieldError("reference")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="piece-profile">
              Profil <span className="text-nim-red">*</span>
            </Label>
            <Input
              id="piece-profile"
              value={form.profile}
              onChange={(event) => setField("profile", event.target.value)}
              placeholder="IPE200"
              aria-invalid={Boolean(fieldErrors.profile)}
            />
            <p className="text-xs text-slate-400">
              Saisissez le profil détaillé, par exemple IPE200.
            </p>
            {fieldError("profile")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="piece-quantity">
                Quantité <span className="text-nim-red">*</span>
              </Label>
              <Input
                id="piece-quantity"
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                disabled={Boolean(editing)}
                onChange={(event) => setField("quantity", event.target.value)}
                aria-invalid={Boolean(fieldErrors.quantity)}
              />
              {fieldError("quantity")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="piece-quality">
                Qualité <span className="text-nim-red">*</span>
              </Label>
              <Input
                id="piece-quality"
                value={form.quality}
                onChange={(event) => setField("quality", event.target.value)}
                placeholder="S275JR"
                aria-invalid={Boolean(fieldErrors.quality)}
              />
              {fieldError("quality")}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="piece-length">
                Longueur <span className="text-nim-red">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="piece-length"
                  type="number"
                  min="1"
                  step="1"
                  value={form.lengthMm}
                  onChange={(event) => setField("lengthMm", event.target.value)}
                  className="pr-12"
                  placeholder="3200"
                  aria-invalid={Boolean(fieldErrors.lengthMm)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  mm
                </span>
              </div>
              {fieldError("lengthMm")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="piece-weight">Poids</Label>
              <div className="relative">
                <Input
                  id="piece-weight"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.unitWeightKg}
                  onChange={(event) => setField("unitWeightKg", event.target.value)}
                  className="pr-10"
                  placeholder="71.2"
                  aria-invalid={Boolean(fieldErrors.unitWeightKg)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  kg
                </span>
              </div>
              {fieldError("unitWeightKg")}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="piece-total-weight">Poids total</Label>
            <div className="relative">
              <Input
                id="piece-total-weight"
                value={
                  calculatedTotalWeight === null ? "—" : formatNumber(calculatedTotalWeight, 3)
                }
                readOnly
                aria-readonly="true"
                className="bg-slate-50 pr-10 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                kg
              </span>
            </div>
            <p className="text-xs text-slate-400">Calculé automatiquement : Poids × Quantité.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="piece-designation">
              Désignation <span className="text-nim-red">*</span>
            </Label>
            <Input
              id="piece-designation"
              value={form.designation}
              onChange={(event) => setField("designation", event.target.value)}
              placeholder="POUTRE"
              aria-invalid={Boolean(fieldErrors.designation)}
            />
            {fieldError("designation")}
          </div>

          {error ? (
            <p
              className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Annuler
          </Button>
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : editing ? <Pencil /> : <Plus />}
            {editing ? "Enregistrer" : "Ajouter la pièce"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function PiecesView({ offerId }: { offerId?: string } = {}): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serializedSearchParams = searchParams.toString();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const roleCanManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedPiece | null>(null);
  const [form, setForm] = useState<PieceForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<PieceFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ManagedPiece | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [profileFilter, setProfileFilter] = useState(() => searchParams.get("profile") ?? "ALL");
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [pageSize, setPageSize] = useState<number>(() => {
    const requested = Number(searchParams.get("pageSize")) || 20;
    return [10, 20, 50].includes(requested) ? requested : 20;
  });
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  const piecesBasePath = offerId ? `/offers/${offerId}/pieces` : "/pieces";
  useEffect(() => {
    const params = new URLSearchParams(serializedSearchParams);
    setSearch(params.get("search") ?? "");
    setProfileFilter(params.get("profile") ?? "ALL");
    setPage(Math.max(1, Number(params.get("page")) || 1));
    const requestedPageSize = Number(params.get("pageSize")) || 20;
    setPageSize([10, 20, 50].includes(requestedPageSize) ? requestedPageSize : 20);
  }, [serializedSearchParams]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const updateListUrl = useCallback(
    (next: { search?: string; profile?: string; page?: number; pageSize?: number }): void => {
      const params = new URLSearchParams(serializedSearchParams);
      for (const key of ["search", "profile", "page", "pageSize"]) params.delete(key);
      const values = {
        search: next.search ?? search,
        profile: next.profile ?? profileFilter,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
      };
      if (values.search.trim()) params.set("search", values.search.trim());
      if (values.profile !== "ALL") params.set("profile", values.profile);
      if (values.page > 1) params.set("page", String(values.page));
      if (values.pageSize !== 20) params.set("pageSize", String(values.pageSize));
      const query = params.toString();
      router.replace(`${piecesBasePath}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [page, pageSize, piecesBasePath, profileFilter, router, search, serializedSearchParams],
  );
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId ?? ""),
    enabled: Boolean(offerId),
    retry: false,
  });
  const offerStatus = offerQuery.data?.offer.status;
  const canManageDraft = Boolean(offerId && roleCanManage && offerStatus === "DRAFT");
  const canEditPieces = Boolean(
    offerId && roleCanManage && (offerStatus === "DRAFT" || offerStatus === "IN_PRODUCTION"),
  );
  const canEditPiece = (item: ManagedPieceListItem): boolean =>
    canEditPieces && item.status !== "ARCHIVED" && item.isUnstarted;
  const piecesQuery = useQuery({
    queryKey: offerId
      ? ["offer", offerId, "pieces", page, pageSize, debouncedSearch, profileFilter]
      : ["pieces", page, pageSize, debouncedSearch, profileFilter],
    queryFn: () => {
      const filters = {
        page,
        pageSize,
        search: debouncedSearch,
        profile: profileFilter === "ALL" ? "" : profileFilter,
      };
      return offerId ? getOfferPiecesRequest(offerId, filters) : getPiecesRequest(filters);
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ target, values }: { target: ManagedPiece | null; values: PieceForm }) => {
      const base = {
        profile: values.profile.trim(),
        quality: values.quality.trim(),
        lengthMm: Number(values.lengthMm),
        unitWeightKg: values.unitWeightKg.trim() ? Number(values.unitWeightKg) : undefined,
        designation: values.designation.trim(),
        priority: (target?.priority ?? "NORMAL") as PiecePriority,
        dueDate: target?.dueDate ?? undefined,
      };
      if (!target) {
        const payload = {
          ...base,
          reference: values.reference.trim(),
          quantity: Number(values.quantity),
        };
        return offerId ? createOfferPieceRequest(offerId, payload) : createPieceRequest(payload);
      }
      return offerId
        ? updateOfferPieceRequest(offerId, target.id, base)
        : updatePieceRequest(target.id, base);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: offerId ? ["offer", offerId, "pieces"] : ["pieces"],
      });
      if (offerId) await queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      setSheetOpen(false);
      setFieldErrors({});
      setFormError(null);
      toast.success(editing ? "Pièce mise à jour." : "Pièce ajoutée.");
    },
    onError: (error) =>
      setFormError(
        error instanceof ApiError ? error.message : "Impossible d’enregistrer la pièce.",
      ),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      offerId ? archiveOfferPieceRequest(offerId, id) : archivePieceRequest(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: offerId ? ["offer", offerId, "pieces"] : ["pieces"],
      });
      if (offerId) await queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      setArchiveTarget(null);
      toast.success("Pièce archivée.");
    },
    onError: (error) => {
      setArchiveTarget(null);
      toast.error(error instanceof ApiError ? error.message : "Impossible d’archiver la pièce.");
    },
  });

  const pieces = piecesQuery.data?.pieces ?? [];
  const profiles = piecesQuery.data?.profiles ?? [];
  const pageCount = piecesQuery.data?.totalPages ?? 1;
  const currentPage = piecesQuery.data?.page ?? page;
  useEffect(() => {
    if (piecesQuery.data && page > piecesQuery.data.totalPages) {
      setPage(piecesQuery.data.totalPages);
      updateListUrl({ page: piecesQuery.data.totalPages });
    }
  }, [page, piecesQuery.data, updateListUrl]);

  const handleSearchChange = (value: string): void => {
    setSearch(value);
    setPage(1);
    updateListUrl({ search: value, page: 1 });
  };
  const handleProfileChange = (value: string): void => {
    setProfileFilter(value);
    setPage(1);
    updateListUrl({ profile: value, page: 1 });
  };

  const openCreate = (): void => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError(null);
    setSheetOpen(true);
  };

  const openEdit = (target: ManagedPiece): void => {
    setEditing(target);
    setForm({
      reference: target.reference,
      quantity: String(target.quantity),
      profile: target.profile,
      quality: target.quality ?? "",
      lengthMm: String(target.lengthMm),
      unitWeightKg: target.unitWeightKg === null ? "" : String(target.unitWeightKg),
      designation: target.designation ?? "",
    });
    setFieldErrors({});
    setFormError(null);
    setSheetOpen(true);
  };

  const openDuplicate = (target: ManagedPiece): void => {
    setEditing(null);
    setForm({
      reference: "",
      quantity: String(target.quantity),
      profile: target.profile,
      quality: target.quality ?? "",
      lengthMm: String(target.lengthMm),
      unitWeightKg: target.unitWeightKg === null ? "" : String(target.unitWeightKg),
      designation: target.designation ?? "",
    });
    setFieldErrors({ reference: "Saisissez un nouveau repère pour la copie." });
    setFormError(null);
    setSheetOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: PieceFormErrors = {};
    if (!editing && !form.reference.trim()) errors.reference = "Le repère est requis.";
    if (!form.profile.trim()) errors.profile = "Le profil détaillé est requis.";
    if (!form.quality.trim()) errors.quality = "La qualité est requise.";
    if (!form.designation.trim()) errors.designation = "La désignation est requise.";

    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0)
      errors.quantity = "Saisissez une quantité supérieure à 0.";

    const lengthMm = Number(form.lengthMm);
    if (!Number.isInteger(lengthMm) || lengthMm <= 0)
      errors.lengthMm = "Saisissez une longueur valide en mm.";

    if (form.unitWeightKg.trim()) {
      const weight = Number(form.unitWeightKg);
      if (!Number.isFinite(weight) || weight < 0)
        errors.unitWeightKg = "Saisissez un poids valide.";
    }

    const candidate = {
      reference: form.reference.trim(),
      quantity,
      profile: form.profile.trim(),
      quality: form.quality.trim(),
      lengthMm,
      unitWeightKg: form.unitWeightKg.trim() ? Number(form.unitWeightKg) : undefined,
      designation: form.designation.trim(),
      priority: (editing?.priority ?? "NORMAL") as PiecePriority,
      dueDate: editing?.dueDate ?? undefined,
    };
    const parsed = editing
      ? updatePieceSchema.safeParse(candidate)
      : createPieceSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? "");
        if (path in form && !errors[path as keyof PieceForm]) {
          errors[path as keyof PieceForm] = issue.message;
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0 && parsed.success;
  };

  const handleSave = (): void => {
    if (!validateForm()) return;
    setFormError(null);
    saveMutation.mutate({ target: editing, values: form });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={offerId ? "Offre" : "Production"}
        title="Pièces"
        description={
          offerId
            ? "Ces pièces appartiennent uniquement à cette offre. Ajoutez-les manuellement ou importez une liste Tekla."
            : "Gérez les pièces manuellement ou importez une liste Tekla."
        }
        action={
          canManageDraft ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`${piecesBasePath}/import`}>
                  <FileSpreadsheet className="size-4" />
                  Importer Excel
                </Link>
              </Button>
              <Button onClick={openCreate}>
                <Plus className="size-4" />
                Ajouter une pièce
              </Button>
            </div>
          ) : undefined
        }
      />

      {offerId && offerQuery.data?.offer && offerStatus !== "DRAFT" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {offerStatus === "READY" ? (
            <>
              L’offre est <span className="font-semibold">prête</span> : le plan validé protège les
              données des pièces. Repassez l’offre en brouillon depuis la vue générale pour les
              modifier.
            </>
          ) : offerStatus === "IN_PRODUCTION" ? (
            <>
              L’offre est <span className="font-semibold">en production</span>. Vous pouvez modifier
              une pièce tant que toutes ses unités sont encore en attente. Les pièces déjà
              façonnées, affectées ou démarrées restent protégées pour préserver leur traçabilité.
            </>
          ) : (
            <>
              L’offre est{" "}
              <span className="font-semibold">
                {offerStatus === "COMPLETED" ? "terminée" : "archivée"}
              </span>{" "}
              : consultation uniquement.
            </>
          )}
        </div>
      ) : null}

      <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
        <CardContent className="p-0">
          <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_240px_auto] dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Rechercher par repère, profil, désignation..."
                aria-label="Rechercher par repère, profil ou désignation"
                className="pl-9 pr-9"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-slate-400"
                  onClick={() => handleSearchChange("")}
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            <Select value={profileFilter} onValueChange={handleProfileChange}>
              <SelectTrigger aria-label="Filtrer par profil">
                <SelectValue placeholder="Tous les profils" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les profils</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    {profile}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {search || profileFilter !== "ALL" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setProfileFilter("ALL");
                  setPage(1);
                  updateListUrl({ search: "", profile: "ALL", page: 1 });
                }}
              >
                Réinitialiser
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>

          {piecesQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : piecesQuery.isError ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-semibold text-red-700">Impossible de charger les pièces</p>
              <p className="mt-1 text-sm text-slate-500">
                {piecesQuery.error instanceof ApiError
                  ? piecesQuery.error.message
                  : "Vérifiez la connexion à l’API."}
              </p>
              <Button variant="outline" className="mt-4" onClick={() => void piecesQuery.refetch()}>
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : piecesQuery.data?.total === 0 ? (
            <div className="p-6">
              <EmptyState
                title={
                  search.trim() || profileFilter !== "ALL"
                    ? "Aucun résultat"
                    : "Aucune pièce enregistrée"
                }
                description={
                  search.trim() || profileFilter !== "ALL"
                    ? "Modifiez votre recherche ou le filtre de profil."
                    : "Ajoutez votre première pièce ou importez une liste Tekla."
                }
                action={
                  canManageDraft && !search.trim() && profileFilter === "ALL" ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="outline" asChild>
                        <Link href={`${piecesBasePath}/import`}>Importer Excel</Link>
                      </Button>
                      <Button onClick={openCreate}>Ajouter une pièce</Button>
                    </div>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1240px] text-left text-sm">
                  <caption className="sr-only">Liste des pièces</caption>
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                    <tr>
                      <th className="px-3 py-3">Repère</th>
                      <th className="px-3 py-3">Profil</th>
                      <th className="px-3 py-3 text-right">Qté</th>
                      <th className="px-3 py-3">État production</th>
                      <th className="px-3 py-3">Qualité</th>
                      <th className="px-3 py-3 text-right">Longueur</th>
                      <th className="px-3 py-3 text-right">Poids</th>
                      <th className="px-3 py-3 text-right">Pds Tot</th>
                      <th className="px-3 py-3">Désignation</th>
                      <th className="w-16 px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pieces.map((item) => (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/60 ${
                          item.status === "ARCHIVED" ? "opacity-55" : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <Link
                            href={`${piecesBasePath}/${item.id}`}
                            className="font-semibold text-slate-900 transition-colors hover:text-nim-red dark:text-slate-100"
                          >
                            {item.reference}
                          </Link>
                          {item.status === "ARCHIVED" ? (
                            <Badge variant="outline" className="ml-2 text-[10px] text-slate-400">
                              Archivée
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-200">
                          {item.profile}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-3">
                          <PieceProductionSummary piece={item} />
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                          {item.quality || "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatNumber(item.lengthMm, 0)} mm
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatWeight(item.unitWeightKg)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-700 dark:text-slate-200">
                          {formatWeight(item.totalWeightKg)}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-3 text-slate-700 dark:text-slate-200">
                          {item.designation || "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions ${item.reference}`}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem asChild>
                                <Link href={`${piecesBasePath}/${item.id}`}>
                                  <Eye />
                                  Voir le détail
                                </Link>
                              </DropdownMenuItem>
                              {canManageDraft && item.status !== "ARCHIVED" ? (
                                <>
                                  {canEditPiece(item) ? (
                                    <DropdownMenuItem onClick={() => openEdit(item)}>
                                      <Pencil />
                                      Modifier
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuItem onClick={() => openDuplicate(item)}>
                                    <Copy />
                                    Dupliquer
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-700"
                                    onClick={() => setArchiveTarget(item)}
                                  >
                                    <Archive />
                                    Archiver
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              {canEditPiece(item) && !canManageDraft ? (
                                <DropdownMenuItem onClick={() => openEdit(item)}>
                                  <Pencil />
                                  Modifier
                                </DropdownMenuItem>
                              ) : null}
                              {canEditPieces && !item.isUnstarted && item.status !== "ARCHIVED" ? (
                                <DropdownMenuItem disabled>
                                  <Pencil />
                                  Déjà engagée en production
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {pieces.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`${piecesBasePath}/${item.id}`}
                          className="font-semibold text-slate-950 hover:text-nim-red dark:text-slate-100"
                        >
                          {item.reference}
                        </Link>
                        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                          {item.profile}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions ${item.reference}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`${piecesBasePath}/${item.id}`}>
                              <Eye />
                              Voir le détail
                            </Link>
                          </DropdownMenuItem>
                          {canEditPiece(item) ? (
                            <DropdownMenuItem onClick={() => openEdit(item)}>
                              <Pencil />
                              Modifier
                            </DropdownMenuItem>
                          ) : null}
                          {canEditPieces && !item.isUnstarted && item.status !== "ARCHIVED" ? (
                            <DropdownMenuItem disabled>
                              <Pencil />
                              Déjà engagée en production
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                      <div>
                        <span className="text-slate-400">Qté</span>
                        <p className="mt-0.5 font-semibold">{item.quantity}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">État production</span>
                        <div className="mt-1">
                          <PieceProductionSummary piece={item} />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Qualité</span>
                        <p className="mt-0.5 font-semibold">{item.quality || "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Longueur</span>
                        <p className="mt-0.5 font-semibold">{formatNumber(item.lengthMm, 0)} mm</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Poids</span>
                        <p className="mt-0.5 font-semibold">{formatWeight(item.unitWeightKg)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Pds Tot</span>
                        <p className="mt-0.5 font-semibold">{formatWeight(item.totalWeightKg)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Désignation</span>
                        <p className="mt-0.5 font-semibold">{item.designation || "—"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination
                page={currentPage}
                pageCount={pageCount}
                pageSize={pageSize}
                total={piecesQuery.data?.total ?? 0}
                pageSizes={[10, 20, 50]}
                itemLabel="pièce"
                onPageChange={(nextPage) => {
                  setPage(nextPage);
                  updateListUrl({ page: nextPage });
                }}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                  updateListUrl({ pageSize: nextPageSize, page: 1 });
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {canManageDraft && (piecesQuery.data?.total ?? 0) > 0 ? (
        <div className="flex justify-end">
          <Button asChild>
            <Link href={offerId ? `/offers/${offerId}/faconnage` : "/pieces/faconnage"}>
              <Scissors className="size-4" />
              Préparer le façonnage
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : null}

      <PieceFormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setFormError(null);
            setFieldErrors({});
          }
        }}
        editing={editing}
        form={form}
        setForm={setForm}
        fieldErrors={fieldErrors}
        error={formError}
        busy={saveMutation.isPending}
        onSubmit={handleSave}
      />

      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver cette pièce ?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.reference} ne sera plus proposée dans la préparation du façonnage ou
              les prochaines affectations. Son historique reste conservé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={() => {
                if (archiveTarget) archiveMutation.mutate(archiveTarget.id);
              }}
            >
              {archiveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Archive />
              )}
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
