"use client";

import { Table } from "@/components/ui/table";
import type { ManagedPiece, MaterialProfileCatalogItem, PiecePriority } from "@nim/types";
import {
  calculatePieceWeightKg,
  calculateTotalWeightKg,
  createPieceSchema,
  updatePieceSchema,
} from "@nim/validation";
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
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { PieceProductionStatusBadge } from "@/components/ui/production-status-badge";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { SuggestionInput } from "@/components/ui/suggestion-input";
import {
  ApiError,
  archivePieceRequest,
  archiveOfferPieceRequest,
  deleteUnusedOfferPiecesRequest,
  createPieceRequest,
  createOfferPieceRequest,
  createOfferPiecesBatchRequest,
  getPiecesRequest,
  getOfferPiecesRequest,
  getPieceFacetsRequest,
  getOfferPieceFacetsRequest,
  getOfferNextPieceReferenceRequest,
  getMaterialProfilesRequest,
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
type AdditionalLength = { id: number; lengthMm: string; quantity: string };
type AdditionalLengthErrors = Record<number, Partial<Record<"lengthMm" | "quantity", string>>>;

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

function unitWeightToKgPerMeter(unitWeightKg: number | null, lengthMm: number): string {
  if (unitWeightKg === null || lengthMm <= 0) return "";
  return String(Number(((unitWeightKg * 1000) / lengthMm).toPrecision(12)));
}

const productionStatusPluralLabels: Record<PieceProductionStatus, string> = {
  PENDING: "En attente",
  FACONNEE: "Façonnées",
  AFFECTEE: "Affectées",
  LANCEE: "Lancées",
  FABRIQUEE: "Fabriquées",
};

const pieceSortFields = {
  Repère: "reference",
  Profil: "profile",
  Qté: "quantity",
  "État production": "status",
  Qualité: "quality",
  Longueur: "lengthMm",
  Poids: "unitWeightKg",
  "Pds Tot": "totalWeightKg",
  Désignation: "designation",
} as const;

type PieceSortField = (typeof pieceSortFields)[keyof typeof pieceSortFields];
const pieceSortLabels: Record<PieceSortField, string> = Object.fromEntries(
  Object.entries(pieceSortFields).map(([label, field]) => [field, label]),
) as Record<PieceSortField, string>;

function normalizePieceSortField(value: string | null): PieceSortField {
  return Object.values(pieceSortFields).find((field) => field === value) ?? "profile";
}

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
      <PieceProductionStatusBadge status={status} className="whitespace-nowrap text-[10px]">
        {count}/{total} {productionStatusPluralLabels[status]}
      </PieceProductionStatusBadge>
    );
  }
  return (
    <div
      className="flex max-w-[260px] flex-wrap gap-1.5"
      aria-label={entries
        .map(([status, count]) => `${count} ${productionStatusPluralLabels[status]}`)
        .join(", ")}
    >
      {entries.map(([status, count]) => (
        <PieceProductionStatusBadge
          key={status}
          status={status}
          className="whitespace-nowrap px-2 py-0.5 text-[10px]"
        >
          {count} {productionStatusPluralLabels[status]}
        </PieceProductionStatusBadge>
      ))}
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
  offerScoped,
  suggestedReference,
  referenceLoading,
  suggestions,
  materialProfiles,
  materialProfilesLoading,
  materialProfilesError,
  onRetryMaterialProfiles,
  additionalLengths,
  additionalLengthErrors,
  onAddLength,
  onUpdateLength,
  onRemoveLength,
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
  offerScoped: boolean;
  suggestedReference?: string;
  referenceLoading: boolean;
  suggestions: { profiles: string[]; qualities: string[]; designations: string[] };
  materialProfiles: MaterialProfileCatalogItem[];
  materialProfilesLoading: boolean;
  materialProfilesError: boolean;
  onRetryMaterialProfiles: () => void;
  additionalLengths: AdditionalLength[];
  additionalLengthErrors: AdditionalLengthErrors;
  onAddLength: () => void;
  onUpdateLength: (id: number, field: "lengthMm" | "quantity", value: string) => void;
  onRemoveLength: (id: number) => void;
}): React.ReactNode {
  const { user } = useAuth();
  const [weightEdited, setWeightEdited] = useState(false);
  useEffect(() => setWeightEdited(false), [open, editing?.id]);
  const setField = <K extends keyof PieceForm>(field: K, value: PieceForm[K]): void =>
    setForm({ ...form, [field]: value });
  const updateProfileOrLength = (field: "profile" | "lengthMm", value: string): void => {
    const next = { ...form, [field]: value };
    const normalizeLookup = (profile: string): string =>
      profile.trim().replace(/\s+/g, "").toLocaleUpperCase();
    if (field === "profile") {
      const catalogProfile = materialProfiles.find(
        (item) => item.isActive && normalizeLookup(item.profile) === normalizeLookup(next.profile),
      );
      next.unitWeightKg = catalogProfile ? String(catalogProfile.kgPerMeter) : "";
      setWeightEdited(false);
    }
    setForm(next);
  };

  const quantity = Number(form.quantity);
  const normalizedProfile = form.profile.trim().replace(/\s+/g, "").toLocaleUpperCase();
  const selectedCatalogProfile = materialProfiles.find(
    (item) =>
      item.isActive &&
      item.profile.trim().replace(/\s+/g, "").toLocaleUpperCase() === normalizedProfile,
  );
  const lineWeightKgPerMeter = Number(form.unitWeightKg);
  const lengthMm = Number(form.lengthMm);
  const calculatedUnitWeight =
    form.unitWeightKg.trim() &&
    Number.isFinite(lineWeightKgPerMeter) &&
    lineWeightKgPerMeter >= 0 &&
    Number.isInteger(lengthMm) &&
    lengthMm > 0
      ? calculatePieceWeightKg(lineWeightKgPerMeter, lengthMm)
      : undefined;
  const calculatedTotalWeight =
    Number.isFinite(quantity) && quantity > 0 && calculatedUnitWeight !== undefined
      ? (calculateTotalWeightKg(calculatedUnitWeight, quantity) ?? null)
      : null;
  const additionalTotals = additionalLengths.map((row) => {
    const rowLength = Number(row.lengthMm);
    const rowQuantity = Number(row.quantity);
    if (
      !form.unitWeightKg.trim() ||
      !Number.isInteger(rowLength) ||
      rowLength <= 0 ||
      !Number.isInteger(rowQuantity) ||
      rowQuantity <= 0 ||
      !Number.isFinite(lineWeightKgPerMeter)
    )
      return null;
    return (
      calculateTotalWeightKg(
        calculatePieceWeightKg(lineWeightKgPerMeter, rowLength),
        rowQuantity,
      ) ?? null
    );
  });
  const combinedTotalWeight =
    calculatedTotalWeight !== null && additionalTotals.every((total) => total !== null)
      ? calculatedTotalWeight +
        additionalTotals.reduce<number>((sum, total) => sum + (total ?? 0), 0)
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
              Repère{" "}
              {offerScoped ? (
                <span className="text-xs font-normal text-slate-400">
                  (généré automatiquement si vide)
                </span>
              ) : (
                <span className="text-nim-red">*</span>
              )}
            </Label>
            <Input
              id="piece-reference"
              value={form.reference}
              disabled={Boolean(editing)}
              onChange={(event) => setField("reference", event.target.value)}
              placeholder={offerScoped ? (suggestedReference ?? "Proposition en cours…") : "P-001"}
              aria-invalid={Boolean(fieldErrors.reference)}
            />
            {editing ? (
              <p className="text-xs text-slate-400">Le repère est immuable après création.</p>
            ) : offerScoped ? (
              <p className="text-xs text-slate-500">
                Prochain repère proposé :{" "}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {suggestedReference ?? (referenceLoading ? "Calcul…" : "P-001")}
                </span>
                . Laissez vide pour le générer au moment de l’enregistrement.
              </p>
            ) : null}
            {fieldError("reference")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="piece-profile">
              Profil <span className="text-nim-red">*</span>
            </Label>
            <SuggestionInput
              id="piece-profile"
              value={form.profile}
              suggestions={suggestions.profiles}
              contextLabel="Dans cette affaire · profils"
              onValueSelect={(value) => updateProfileOrLength("profile", value)}
              onChange={(event) => updateProfileOrLength("profile", event.target.value)}
              placeholder="IPE200"
              aria-invalid={Boolean(fieldErrors.profile)}
            />
            <p className="text-xs text-slate-400">
              Saisissez le profil détaillé, par exemple IPE200.
            </p>
            {form.profile.trim() && materialProfilesLoading ? (
              <p className="text-xs text-slate-500" role="status">
                Vérification du catalogue des profils…
              </p>
            ) : null}
            {form.profile.trim() && materialProfilesError ? (
              <p
                className="flex flex-wrap items-center gap-1 text-xs text-amber-700 dark:text-amber-300"
                role="alert"
              >
                Le catalogue est temporairement indisponible. Le poids reste saisissable
                manuellement.
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={onRetryMaterialProfiles}
                >
                  Réessayer
                </button>
              </p>
            ) : null}
            {form.profile.trim() &&
            !materialProfilesLoading &&
            !materialProfilesError &&
            !selectedCatalogProfile ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Profil absent du catalogue : le poids devra être saisi manuellement.
                {user?.role === "ADMIN" ? (
                  <>
                    {" "}
                    <Link href="/settings/profiles" className="font-semibold underline">
                      Ajouter au catalogue
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            ) : null}
            {selectedCatalogProfile ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Catalogue matière{" "}
                  <span className="font-semibold">
                    · {formatNumber(selectedCatalogProfile.kgPerMeter, 3)} kg/m
                  </span>
                </p>
                <p className="mt-1.5 text-xs text-slate-500">
                  Longueurs brutes disponibles pour le façonnage :
                </p>
                <div
                  className="mt-2 flex flex-wrap gap-1.5"
                  aria-label={`Longueurs brutes disponibles pour ${selectedCatalogProfile.profile}`}
                >
                  {selectedCatalogProfile.rawLengthsMm.map((length) => (
                    <StatusBadge key={length} tone="info">
                      {length.toLocaleString("fr-FR")} mm
                    </StatusBadge>
                  ))}
                </div>
              </div>
            ) : null}
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
                Qualité <span className="text-xs font-normal text-slate-400">(facultative)</span>
              </Label>
              <SuggestionInput
                id="piece-quality"
                value={form.quality}
                suggestions={suggestions.qualities}
                contextLabel="Dans cette affaire · qualités"
                onValueSelect={(value) => setField("quality", value)}
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
                  onChange={(event) => updateProfileOrLength("lengthMm", event.target.value)}
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
              <Label htmlFor="piece-weight">Poids linéique (kg/m)</Label>
              <div className="relative">
                <Input
                  id="piece-weight"
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.unitWeightKg}
                  onChange={(event) => {
                    setWeightEdited(true);
                    setField("unitWeightKg", event.target.value);
                  }}
                  className="pr-10"
                  placeholder="16,7"
                  aria-invalid={Boolean(fieldErrors.unitWeightKg)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  kg/m
                </span>
              </div>
              {fieldError("unitWeightKg")}
              {form.unitWeightKg ? (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={weightEdited ? "warning" : "active"}>
                    {weightEdited
                      ? "Saisi manuellement"
                      : editing
                        ? "Valeur enregistrée"
                        : selectedCatalogProfile
                          ? "Catalogue · modifiable"
                          : "Saisi manuellement"}
                  </StatusBadge>
                  <span className="text-xs text-slate-400">Densité matière, modifiable.</span>
                </div>
              ) : null}
            </div>
          </div>

          {!editing ? (
            <section
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40"
              aria-label="Autres longueurs pour ce profil"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Autres longueurs · même profil
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chaque longueur sera enregistrée comme une pièce avec son propre repère.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAddLength}
                  disabled={busy || additionalLengths.length >= 49}
                >
                  <Plus className="size-4" /> Ajouter une longueur
                </Button>
              </div>
              {additionalLengths.map((row, index) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor={`piece-extra-length-${row.id}`}>
                      Longueur · pièce {index + 2}
                    </Label>
                    <div className="relative">
                      <Input
                        id={`piece-extra-length-${row.id}`}
                        type="number"
                        min="1"
                        step="1"
                        value={row.lengthMm}
                        onChange={(event) => onUpdateLength(row.id, "lengthMm", event.target.value)}
                        className="pr-11"
                        placeholder="5000"
                        aria-invalid={Boolean(additionalLengthErrors[row.id]?.lengthMm)}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                        mm
                      </span>
                    </div>
                    {additionalLengthErrors[row.id]?.lengthMm ? (
                      <p role="alert" className="text-xs font-medium text-nim-red">
                        {additionalLengthErrors[row.id].lengthMm}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`piece-extra-quantity-${row.id}`}>Quantité</Label>
                    <Input
                      id={`piece-extra-quantity-${row.id}`}
                      type="number"
                      min="1"
                      step="1"
                      value={row.quantity}
                      onChange={(event) => onUpdateLength(row.id, "quantity", event.target.value)}
                      aria-invalid={Boolean(additionalLengthErrors[row.id]?.quantity)}
                    />
                    {additionalLengthErrors[row.id]?.quantity ? (
                      <p role="alert" className="text-xs font-medium text-nim-red">
                        {additionalLengthErrors[row.id].quantity}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer la longueur ${index + 2}`}
                    onClick={() => onRemoveLength(row.id)}
                    disabled={busy}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <p className="col-span-3 text-xs text-slate-500">
                    Poids calculé :{" "}
                    {form.unitWeightKg.trim() &&
                    Number.isInteger(Number(row.lengthMm)) &&
                    Number(row.lengthMm) > 0 &&
                    Number.isInteger(Number(row.quantity)) &&
                    Number(row.quantity) > 0 &&
                    Number.isFinite(lineWeightKgPerMeter)
                      ? `${formatNumber(calculatePieceWeightKg(lineWeightKgPerMeter, Number(row.lengthMm)) * Number(row.quantity), 3)} kg`
                      : "complétez la longueur, la quantité et le poids linéique"}
                  </p>
                </div>
              ))}
            </section>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="piece-total-weight">Poids total</Label>
            <div className="relative">
              <Input
                id="piece-total-weight"
                value={combinedTotalWeight === null ? "—" : formatNumber(combinedTotalWeight, 3)}
                readOnly
                aria-readonly="true"
                className="bg-slate-50 pr-10 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                kg
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Calculé automatiquement : kg/m × longueur × quantité, pour toutes les longueurs
              saisies.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="piece-designation">
              Désignation <span className="text-xs font-normal text-slate-400">(facultative)</span>
            </Label>
            <SuggestionInput
              id="piece-designation"
              value={form.designation}
              suggestions={suggestions.designations}
              contextLabel="Dans cette affaire · désignations"
              onValueSelect={(value) => setField("designation", value)}
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
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedPiece | null>(null);
  const [form, setForm] = useState<PieceForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<PieceFormErrors>({});
  const [additionalLengths, setAdditionalLengths] = useState<AdditionalLength[]>([]);
  const [additionalLengthErrors, setAdditionalLengthErrors] = useState<AdditionalLengthErrors>({});
  const nextLengthRowId = useRef(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ManagedPiece | null>(null);
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(() => new Set());
  const [allFilteredDeletableIds, setAllFilteredDeletableIds] = useState<string[]>([]);
  const [selectingAllFiltered, setSelectingAllFiltered] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [profileFilter, setProfileFilter] = useState(() => searchParams.get("profile") ?? "ALL");
  const [designationFilter, setDesignationFilter] = useState(
    () => searchParams.get("designation") ?? "ALL",
  );
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [pageSize, setPageSize] = useState<number>(() => {
    const requested = Number(searchParams.get("pageSize")) || 20;
    return [10, 20, 50].includes(requested) ? requested : 20;
  });
  const [sortBy, setSortBy] = useState<PieceSortField>(() =>
    normalizePieceSortField(searchParams.get("sortBy")),
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(() =>
    searchParams.get("sortDirection") === "desc" ? "desc" : "asc",
  );
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  const piecesBasePath = offerId ? `/offers/${offerId}/pieces` : "/pieces";
  useEffect(() => {
    const params = new URLSearchParams(serializedSearchParams);
    setSearch(params.get("search") ?? "");
    setProfileFilter(params.get("profile") ?? "ALL");
    setDesignationFilter(params.get("designation") ?? "ALL");
    setPage(Math.max(1, Number(params.get("page")) || 1));
    const requestedPageSize = Number(params.get("pageSize")) || 20;
    setPageSize([10, 20, 50].includes(requestedPageSize) ? requestedPageSize : 20);
    setSortBy(normalizePieceSortField(params.get("sortBy")));
    setSortDirection(params.get("sortDirection") === "desc" ? "desc" : "asc");
  }, [serializedSearchParams]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);
  const updateListUrl = useCallback(
    (next: {
      search?: string;
      profile?: string;
      designation?: string;
      page?: number;
      pageSize?: number;
      sortBy?: PieceSortField;
      sortDirection?: "asc" | "desc";
    }): void => {
      const params = new URLSearchParams(serializedSearchParams);
      for (const key of [
        "search",
        "profile",
        "designation",
        "page",
        "pageSize",
        "sortBy",
        "sortDirection",
      ])
        params.delete(key);
      const values = {
        search: next.search ?? search,
        profile: next.profile ?? profileFilter,
        designation: next.designation ?? designationFilter,
        page: next.page ?? page,
        pageSize: next.pageSize ?? pageSize,
        sortBy: next.sortBy ?? sortBy,
        sortDirection: next.sortDirection ?? sortDirection,
      };
      if (values.search.trim()) params.set("search", values.search.trim());
      if (values.profile !== "ALL") params.set("profile", values.profile);
      if (values.designation !== "ALL") params.set("designation", values.designation);
      if (values.page > 1) params.set("page", String(values.page));
      if (values.pageSize !== 20) params.set("pageSize", String(values.pageSize));
      if (values.sortBy !== "profile") params.set("sortBy", values.sortBy);
      if (values.sortDirection !== "asc") params.set("sortDirection", values.sortDirection);
      const query = params.toString();
      router.replace(`${piecesBasePath}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [
      page,
      pageSize,
      piecesBasePath,
      profileFilter,
      designationFilter,
      router,
      search,
      serializedSearchParams,
      sortBy,
      sortDirection,
    ],
  );
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId ?? ""),
    enabled: Boolean(offerId),
    retry: false,
  });
  const nextReferenceQuery = useQuery({
    queryKey: ["offer", offerId, "next-piece-reference"],
    queryFn: () => getOfferNextPieceReferenceRequest(offerId ?? ""),
    enabled: Boolean(offerId && sheetOpen && !editing),
    retry: false,
  });
  const materialProfilesQuery = useQuery({
    queryKey: ["material-profiles"],
    queryFn: () => getMaterialProfilesRequest(),
    enabled: sheetOpen && roleCanManage,
  });
  const pieceFacetsQuery = useQuery({
    queryKey: ["piece-facets", offerId ?? "ALL"],
    queryFn: () => (offerId ? getOfferPieceFacetsRequest(offerId) : getPieceFacetsRequest()),
    enabled: sheetOpen || facetsOpen || profileFilter !== "ALL",
    retry: false,
  });
  const offerStatus = offerQuery.data?.offer.status;
  const canManageDraft = Boolean(offerId && roleCanManage && offerStatus === "DRAFT");
  const canDeletePieces = Boolean(
    offerId && roleCanManage && offerStatus && offerStatus !== "ARCHIVED",
  );
  const canAddPiece = Boolean(
    offerId && roleCanManage && (offerStatus === "DRAFT" || offerStatus === "READY"),
  );
  const canEditPieces = Boolean(
    offerId &&
    roleCanManage &&
    (offerStatus === "DRAFT" || offerStatus === "READY" || offerStatus === "IN_PRODUCTION"),
  );
  const canEditPiece = (item: ManagedPieceListItem): boolean =>
    canEditPieces && item.status !== "ARCHIVED" && item.isUnstarted;
  const piecesQuery = useQuery({
    queryKey: offerId
      ? [
          "offer",
          offerId,
          "pieces",
          page,
          pageSize,
          debouncedSearch,
          profileFilter,
          designationFilter,
          sortBy,
          sortDirection,
        ]
      : [
          "pieces",
          page,
          pageSize,
          debouncedSearch,
          profileFilter,
          designationFilter,
          sortBy,
          sortDirection,
        ],
    queryFn: () => {
      const filters = {
        page,
        pageSize,
        search: debouncedSearch,
        profile: profileFilter === "ALL" ? "" : profileFilter,
        designation: designationFilter === "ALL" ? "" : designationFilter,
        sortBy,
        sortDirection,
      };
      return offerId ? getOfferPiecesRequest(offerId, filters) : getPiecesRequest(filters);
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      target,
      values,
      additionalLengths,
    }: {
      target: ManagedPiece | null;
      values: PieceForm;
      additionalLengths: AdditionalLength[];
    }) => {
      const makePayload = (lengthMm: number, quantity: number, reference?: string) => ({
        profile: values.profile.trim(),
        quality: values.quality.trim() || undefined,
        lengthMm,
        unitWeightKg: values.unitWeightKg.trim()
          ? calculatePieceWeightKg(Number(values.unitWeightKg), lengthMm)
          : undefined,
        designation: values.designation.trim() || undefined,
        priority: (target?.priority ?? "NORMAL") as PiecePriority,
        dueDate: target?.dueDate ?? undefined,
        quantity,
        ...(reference?.trim() ? { reference: reference.trim() } : {}),
      });
      if (!target) {
        const payload = makePayload(
          Number(values.lengthMm),
          Number(values.quantity),
          values.reference,
        );
        if (additionalLengths.length > 0) {
          if (!offerId)
            throw new Error("Ouvrez une affaire pour enregistrer plusieurs longueurs ensemble.");
          const pieces = [
            payload,
            ...additionalLengths.map((row) =>
              makePayload(Number(row.lengthMm), Number(row.quantity)),
            ),
          ];
          const result = await createOfferPiecesBatchRequest(offerId, { pieces });
          return { createdCount: result.pieces.length };
        }
        if (offerId) {
          await createOfferPieceRequest(offerId, payload);
          return { createdCount: 1 };
        }
        await createPieceRequest(payload);
        return { createdCount: 1 };
      }
      const base = {
        profile: values.profile.trim(),
        quality: values.quality.trim() || undefined,
        lengthMm: Number(values.lengthMm),
        unitWeightKg: values.unitWeightKg.trim()
          ? calculatePieceWeightKg(Number(values.unitWeightKg), Number(values.lengthMm))
          : undefined,
        designation: values.designation.trim() || undefined,
        priority: (target.priority ?? "NORMAL") as PiecePriority,
        dueDate: target.dueDate ?? undefined,
      };
      if (offerId) await updateOfferPieceRequest(offerId, target.id, base);
      else await updatePieceRequest(target.id, base);
      return { createdCount: 1 };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: offerId ? ["offer", offerId, "pieces"] : ["pieces"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["piece-facets", offerId ?? "ALL"],
      });
      if (offerId) await queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      setSheetOpen(false);
      setFieldErrors({});
      setAdditionalLengths([]);
      setAdditionalLengthErrors({});
      setFormError(null);
      toast.success(
        editing
          ? "Pièce mise à jour."
          : result.createdCount > 1
            ? `${result.createdCount} pièces ajoutées à l’affaire.`
            : "Pièce ajoutée.",
      );
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
      await queryClient.invalidateQueries({
        queryKey: ["piece-facets", offerId ?? "ALL"],
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (pieceIds: string[]) => {
      let deletedCount = 0;
      for (let offset = 0; offset < pieceIds.length; offset += 100) {
        const batch = pieceIds.slice(offset, offset + 100);
        try {
          const result = await deleteUnusedOfferPiecesRequest(offerId ?? "", batch);
          deletedCount += result.deletedCount;
        } catch (error) {
          return {
            deletedCount,
            failedIds: pieceIds.slice(offset),
            errorMessage:
              error instanceof ApiError
                ? error.message
                : "La suppression a échoué. Les pièces restantes sont toujours sélectionnées.",
          };
        }
      }
      return { deletedCount, failedIds: [] as string[], errorMessage: null };
    },
    onSuccess: async ({ deletedCount, failedIds, errorMessage }) => {
      setSelectedPieceIds(new Set(failedIds));
      setAllFilteredDeletableIds((current) => current.filter((id) => failedIds.includes(id)));
      setDeleteDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["offer", offerId, "pieces"] });
      await queryClient.invalidateQueries({ queryKey: ["piece-facets", offerId ?? "ALL"] });
      await queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      if (failedIds.length > 0) {
        toast.error(
          `${deletedCount} pièce(s) supprimée(s). ${failedIds.length} restante(s) toujours sélectionnée(s). ${errorMessage ?? "Actualisez puis réessayez."}`,
        );
      } else {
        toast.success(`${deletedCount} pièce(s) supprimée(s). L’historique reste consultable.`);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Suppression impossible. Actualisez la liste et réessayez.",
      );
    },
  });

  const pieces = piecesQuery.data?.pieces ?? [];
  const profiles = pieceFacetsQuery.data?.profiles ?? [];
  const pageCount = piecesQuery.data?.totalPages ?? 1;
  const currentPage = piecesQuery.data?.page ?? page;
  const selectedCount = selectedPieceIds.size;
  const allFilteredSelected =
    allFilteredDeletableIds.length > 0 &&
    allFilteredDeletableIds.every((id) => selectedPieceIds.has(id));
  useEffect(() => {
    setSelectedPieceIds(new Set());
    setAllFilteredDeletableIds([]);
  }, [offerId, debouncedSearch, profileFilter, designationFilter]);
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
  const handleDesignationChange = (value: string): void => {
    setDesignationFilter(value);
    setPage(1);
    updateListUrl({ designation: value, page: 1 });
  };

  const handleSelectAllFiltered = async (checked: boolean): Promise<void> => {
    if (!checked) {
      const filteredIds = new Set(allFilteredDeletableIds);
      setSelectedPieceIds((current) => new Set([...current].filter((id) => !filteredIds.has(id))));
      setAllFilteredDeletableIds([]);
      return;
    }

    if (!offerId || selectingAllFiltered || search !== debouncedSearch) return;
    setSelectingAllFiltered(true);
    try {
      const filters = {
        page: 1,
        pageSize: 100,
        search: debouncedSearch,
        profile: profileFilter === "ALL" ? "" : profileFilter,
        designation: designationFilter === "ALL" ? "" : designationFilter,
        sortBy,
        sortDirection,
      } as const;
      const firstPage = await getOfferPiecesRequest(offerId, filters);
      const eligibleIds = firstPage.pieces.filter((item) => item.canDelete).map((item) => item.id);
      const pageNumbers = Array.from({ length: firstPage.totalPages - 1 }, (_, index) => index + 2);
      for (let offset = 0; offset < pageNumbers.length; offset += 5) {
        const responses = await Promise.all(
          pageNumbers
            .slice(offset, offset + 5)
            .map((nextPage) => getOfferPiecesRequest(offerId, { ...filters, page: nextPage })),
        );
        for (const response of responses) {
          eligibleIds.push(
            ...response.pieces.filter((item) => item.canDelete).map((item) => item.id),
          );
        }
      }

      const uniqueIds = [...new Set(eligibleIds)];
      if (uniqueIds.length === 0) {
        setAllFilteredDeletableIds([]);
        toast.info("Aucune pièce supprimable ne correspond aux filtres actuels.");
        return;
      }
      setAllFilteredDeletableIds(uniqueIds);
      setSelectedPieceIds((current) => new Set([...current, ...uniqueIds]));
      toast.success(
        `${uniqueIds.length} pièce(s) supprimable(s) sélectionnée(s) sur tous les résultats.`,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Impossible de charger toutes les pièces filtrées. Réessayez.",
      );
    } finally {
      setSelectingAllFiltered(false);
    }
  };

  const openCreate = (): void => {
    setEditing(null);
    setForm(emptyForm);
    setFieldErrors({});
    setAdditionalLengths([]);
    setAdditionalLengthErrors({});
    setFormError(null);
    setSheetOpen(true);
  };

  const openEdit = (target: ManagedPiece): void => {
    setEditing(target);
    setAdditionalLengths([]);
    setAdditionalLengthErrors({});
    setForm({
      reference: target.reference,
      quantity: String(target.quantity),
      profile: target.profile,
      quality: target.quality ?? "",
      lengthMm: String(target.lengthMm),
      unitWeightKg: unitWeightToKgPerMeter(target.unitWeightKg, target.lengthMm),
      designation: target.designation ?? "",
    });
    setFieldErrors({});
    setFormError(null);
    setSheetOpen(true);
  };

  const openDuplicate = (target: ManagedPiece): void => {
    setEditing(null);
    setAdditionalLengths([]);
    setAdditionalLengthErrors({});
    setForm({
      reference: "",
      quantity: String(target.quantity),
      profile: target.profile,
      quality: target.quality ?? "",
      lengthMm: String(target.lengthMm),
      unitWeightKg: unitWeightToKgPerMeter(target.unitWeightKg, target.lengthMm),
      designation: target.designation ?? "",
    });
    setFieldErrors({ reference: "Saisissez un nouveau repère pour la copie." });
    setFormError(null);
    setSheetOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: PieceFormErrors = {};
    const rowErrors: AdditionalLengthErrors = {};
    if (!editing && !offerId && !form.reference.trim()) errors.reference = "Le repère est requis.";
    if (!form.profile.trim()) errors.profile = "Le profil détaillé est requis.";

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
      reference: form.reference.trim() || undefined,
      quantity,
      profile: form.profile.trim(),
      quality: form.quality.trim(),
      lengthMm,
      unitWeightKg: form.unitWeightKg.trim()
        ? calculatePieceWeightKg(Number(form.unitWeightKg), lengthMm)
        : undefined,
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

    if (additionalLengths.length > 0 && !offerId) {
      setFormError("Ouvrez une affaire pour enregistrer plusieurs longueurs ensemble.");
      setFieldErrors(errors);
      setAdditionalLengthErrors(rowErrors);
      return false;
    }
    for (const row of additionalLengths) {
      const rowLength = Number(row.lengthMm);
      const rowQuantity = Number(row.quantity);
      const rowParsed = createPieceSchema.safeParse({
        ...candidate,
        reference: undefined,
        lengthMm: rowLength,
        quantity: rowQuantity,
      });
      if (!rowParsed.success) {
        const rowError: Partial<Record<"lengthMm" | "quantity", string>> = {};
        for (const issue of rowParsed.error.issues) {
          const path = String(issue.path[0] ?? "");
          if ((path === "lengthMm" || path === "quantity") && !rowError[path])
            rowError[path] = issue.message;
        }
        rowErrors[row.id] = rowError;
      }
    }

    setFieldErrors(errors);
    setAdditionalLengthErrors(rowErrors);
    setFormError(null);
    return (
      Object.keys(errors).length === 0 && Object.keys(rowErrors).length === 0 && parsed.success
    );
  };

  const addLength = (): void => {
    if (additionalLengths.length >= 49) return;
    const id = nextLengthRowId.current++;
    setAdditionalLengths((current) => [...current, { id, lengthMm: "", quantity: "1" }]);
    setAdditionalLengthErrors((current) => ({ ...current, [id]: {} }));
  };

  const updateAdditionalLength = (
    id: number,
    field: "lengthMm" | "quantity",
    value: string,
  ): void => {
    setAdditionalLengths((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
    setAdditionalLengthErrors((current) => ({
      ...current,
      [id]: { ...current[id], [field]: undefined },
    }));
  };

  const removeAdditionalLength = (id: number): void => {
    setAdditionalLengths((current) => current.filter((row) => row.id !== id));
    setAdditionalLengthErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const handleSave = (): void => {
    if (!validateForm()) return;
    setFormError(null);
    saveMutation.mutate({ target: editing, values: form, additionalLengths });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={offerId ? "Affaire" : "Production"}
        title="Pièces"
        description={
          offerId
            ? "Ces pièces appartiennent uniquement à cette affaire. Ajoutez-les manuellement ou importez une liste Tekla."
            : "Gérez les pièces manuellement ou importez une liste Tekla."
        }
        action={
          canAddPiece ? (
            <div className="flex flex-wrap gap-2">
              {canManageDraft ? (
                <Button variant="outline" asChild>
                  <Link href={`${piecesBasePath}/import`}>
                    <FileSpreadsheet className="size-4" />
                    Importer Excel
                  </Link>
                </Button>
              ) : null}
              <Button onClick={openCreate}>
                <Plus className="size-4" />
                Ajouter une pièce
              </Button>
            </div>
          ) : undefined
        }
      />

      {offerId && offerQuery.data?.offer && offerStatus !== "DRAFT" && offerStatus !== "READY" ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {offerStatus === "IN_PRODUCTION" ? (
            <>
              L’affaire est <span className="font-semibold">en production</span>. Vous pouvez
              modifier une pièce tant que toutes ses unités sont encore en attente. Les pièces déjà
              façonnées, affectées ou démarrées restent protégées pour préserver leur traçabilité.
            </>
          ) : offerStatus === "COMPLETED" ? (
            <>
              L’affaire est <span className="font-semibold">terminée</span>. Les pièces encore en
              attente et jamais utilisées peuvent être supprimées; le reste est en consultation.
            </>
          ) : (
            <>
              L’affaire est <span className="font-semibold">Archivée</span> : consultation
              uniquement.
            </>
          )}
        </div>
      ) : null}

      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardContent className="p-0">
          <div
            className={`${offerId ? "nim-offer-sticky-table-tools" : "nim-sticky-table-tools"} grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_auto_240px_auto] dark:border-slate-800`}
          >
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
            <Button
              type="button"
              variant={designationFilter === "Jarret" ? "default" : "outline"}
              aria-pressed={designationFilter === "Jarret"}
              onClick={() =>
                handleDesignationChange(designationFilter === "Jarret" ? "ALL" : "Jarret")
              }
              className="min-h-10"
              title="Afficher uniquement les pièces dont la désignation est Jarret"
            >
              Jarret
            </Button>
            <Select
              value={profileFilter}
              onValueChange={handleProfileChange}
              onOpenChange={setFacetsOpen}
            >
              <SelectTrigger aria-label="Filtrer par profil">
                <SelectValue placeholder="Tous les profils" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les profils</SelectItem>
                {profileFilter !== "ALL" && !profiles.includes(profileFilter) ? (
                  <SelectItem key={profileFilter} value={profileFilter}>
                    {profileFilter}
                  </SelectItem>
                ) : null}
                {profiles.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    {profile}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {search || profileFilter !== "ALL" || designationFilter !== "ALL" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setProfileFilter("ALL");
                  setDesignationFilter("ALL");
                  setPage(1);
                  updateListUrl({ search: "", profile: "ALL", designation: "ALL", page: 1 });
                }}
              >
                Réinitialiser
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>

          {canDeletePieces ? (
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 font-medium text-slate-800 hover:bg-white dark:text-slate-100 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    aria-label="Sélectionner toutes les pièces supprimables de tous les résultats filtrés"
                    checked={allFilteredSelected}
                    disabled={
                      !offerId ||
                      selectingAllFiltered ||
                      bulkDeleteMutation.isPending ||
                      search !== debouncedSearch ||
                      (piecesQuery.data?.total ?? 0) === 0
                    }
                    onChange={(event) => void handleSelectAllFiltered(event.target.checked)}
                    className="size-4 accent-red-600"
                  />
                  {selectingAllFiltered ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Sélectionner toutes les pièces supprimables (tous les résultats)
                </label>
                <span aria-live="polite">
                  {selectedCount} sélectionnée(s)
                  {allFilteredDeletableIds.length > 0
                    ? ` · ${allFilteredDeletableIds.length} dans les résultats filtrés`
                    : ""}
                </span>
              </div>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  selectedCount === 0 || selectingAllFiltered || bulkDeleteMutation.isPending
                }
                onClick={() => setDeleteDialogOpen(true)}
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Supprimer la sélection
              </Button>
            </div>
          ) : null}

          {pieceFacetsQuery.isFetching && (facetsOpen || sheetOpen) ? (
            <p role="status" className="px-4 pt-2 text-xs text-slate-500">
              Chargement des valeurs de filtre et suggestions…
            </p>
          ) : null}
          {pieceFacetsQuery.isError && (facetsOpen || sheetOpen || profileFilter !== "ALL") ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2 text-xs text-red-700"
            >
              <span>Impossible de charger les profils et suggestions.</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void pieceFacetsQuery.refetch()}
              >
                Réessayer
              </Button>
            </div>
          ) : null}

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
                <Table
                  className={`nim-data-table w-full ${canDeletePieces ? "min-w-[1280px]" : "min-w-[1240px]"} text-left text-sm`}
                  serverSorting={{ column: pieceSortLabels[sortBy], direction: sortDirection }}
                  onServerSort={(column, direction) => {
                    const field = pieceSortFields[column as keyof typeof pieceSortFields];
                    if (!field) return;
                    setSortBy(field);
                    setSortDirection(direction);
                    setPage(1);
                    updateListUrl({ sortBy: field, sortDirection: direction, page: 1 });
                  }}
                >
                  <caption className="sr-only">Liste des pièces</caption>
                  <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                    <tr>
                      {canDeletePieces ? (
                        <th className="w-12 px-3 py-3">
                          <span className="sr-only">Sélection</span>
                        </th>
                      ) : null}
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
                        {canDeletePieces ? (
                          <td
                            className="px-3 py-3"
                            title={
                              item.canDelete ? undefined : (item.deleteBlockedReason ?? undefined)
                            }
                          >
                            <input
                              type="checkbox"
                              aria-label={
                                item.canDelete
                                  ? `Sélectionner ${item.reference} pour suppression`
                                  : `${item.reference} — ${item.deleteBlockedReason ?? "Suppression non autorisée"}`
                              }
                              checked={selectedPieceIds.has(item.id)}
                              disabled={
                                !item.canDelete ||
                                selectingAllFiltered ||
                                bulkDeleteMutation.isPending
                              }
                              title={
                                item.canDelete
                                  ? "Sélectionner pour suppression définitive"
                                  : (item.deleteBlockedReason ??
                                    "Seules les pièces en attente et jamais utilisées peuvent être supprimées")
                              }
                              onChange={(event) =>
                                setSelectedPieceIds((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(item.id);
                                  else next.delete(item.id);
                                  return next;
                                })
                              }
                              className="size-4 accent-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </td>
                        ) : null}
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
                                  Certaines unités sont engagées; libérez ou annulez leur barre
                                  avant modification.
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="space-y-3 p-4 md:hidden">
                {pieces.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      {canDeletePieces ? (
                        <input
                          type="checkbox"
                          aria-label={
                            item.canDelete
                              ? `Sélectionner ${item.reference} pour suppression`
                              : `${item.reference} — ${item.deleteBlockedReason ?? "Suppression non autorisée"}`
                          }
                          checked={selectedPieceIds.has(item.id)}
                          disabled={
                            !item.canDelete || selectingAllFiltered || bulkDeleteMutation.isPending
                          }
                          title={
                            item.canDelete
                              ? "Sélectionner pour suppression définitive"
                              : (item.deleteBlockedReason ?? "Pièce déjà utilisée ou engagée")
                          }
                          onChange={(event) =>
                            setSelectedPieceIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            })
                          }
                          className="mt-1 size-4 shrink-0 accent-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
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
                              Certaines unités sont engagées; libérez ou annulez leur barre avant
                              modification.
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
            setAdditionalLengths([]);
            setAdditionalLengthErrors({});
          }
        }}
        editing={editing}
        offerScoped={Boolean(offerId)}
        suggestedReference={nextReferenceQuery.data?.reference}
        referenceLoading={nextReferenceQuery.isLoading}
        suggestions={{
          profiles: [
            ...new Set([
              ...(pieceFacetsQuery.data?.profiles ?? []),
              ...(materialProfilesQuery.data?.profiles ?? []).map((item) => item.profile),
            ]),
          ],
          qualities: pieceFacetsQuery.data?.qualities ?? [],
          designations: pieceFacetsQuery.data?.designations ?? [],
        }}
        materialProfiles={materialProfilesQuery.data?.profiles ?? []}
        materialProfilesLoading={materialProfilesQuery.isLoading}
        materialProfilesError={materialProfilesQuery.isError}
        onRetryMaterialProfiles={() => void materialProfilesQuery.refetch()}
        additionalLengths={additionalLengths}
        additionalLengthErrors={additionalLengthErrors}
        onAddLength={addLength}
        onUpdateLength={updateAdditionalLength}
        onRemoveLength={removeAdditionalLength}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ces pièces ?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCount} pièce(s) sélectionnée(s) seront retirées de cette affaire avec leurs
              unités et photos. Seules les pièces en attente qui n’ont jamais été utilisées sont
              supprimables. Un événement restera dans l’historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={selectedCount === 0 || bulkDeleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (offerId && selectedCount > 0) bulkDeleteMutation.mutate([...selectedPieceIds]);
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Supprimer {selectedCount} pièce(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
