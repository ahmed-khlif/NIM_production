"use client";

import { Table } from "@/components/ui/table";
import type { PieceImportPreview } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  OctagonAlert,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access/access-denied";
import { ReturnLink } from "@/components/navigation/return-navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ApiError,
  commitPieceImportRequest,
  commitOfferPieceImportRequest,
  previewPieceImportRequest,
  previewOfferPieceImportRequest,
  getOfferRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";

const MAX_FILE_SIZE = 5_000_000;

function isJarret(value: unknown): boolean {
  return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR") === "jarret";
}

const expectedColumns = [
  "Repère",
  "Profil",
  "Qté",
  "Qualité",
  "Long.",
  "Poids",
  "Pds Tot",
  "Désignation",
] as const;

function mutationMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Le serveur est indisponible. Réessayez.";
}

async function readImportFile(
  file: File,
): Promise<{ content: string; encoding: "text" | "base64" }> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") {
    if (typeof file.text === "function") return { content: await file.text(), encoding: "text" };
    if (typeof Response !== "undefined") {
      return { content: await new Response(file).text(), encoding: "text" };
    }
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
      reader.readAsText(file);
    });
    return { content, encoding: "text" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return { content: btoa(binary), encoding: "base64" };
}

function ImportSteps({ preview }: { preview: PieceImportPreview | null }): React.ReactNode {
  const steps = [
    { number: 1, label: "Fichier Excel", active: !preview, done: Boolean(preview) },
    { number: 2, label: "Validation & import", active: Boolean(preview), done: false },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label="Étapes de l’import">
      {steps.map((step, index) => (
        <div key={step.number} className="flex items-center gap-2">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              step.active
                ? "bg-nim-red text-white"
                : step.done
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-400 dark:bg-slate-800"
            }`}
          >
            {step.done ? <Check className="size-3.5" /> : step.number}
          </span>
          <span
            className={
              step.active
                ? "text-xs font-semibold text-slate-900 dark:text-slate-100"
                : "text-xs text-slate-400"
            }
          >
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span className="ml-auto hidden h-px flex-1 bg-slate-200 sm:block dark:bg-slate-800" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PreviewTable({ preview }: { preview: PieceImportPreview }): React.ReactNode {
  const [rowFilter, setRowFilter] = useState<"ALL" | "INVALID">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const filteredRows =
    rowFilter === "INVALID" ? preview.rows.filter((row) => !row.valid) : preview.rows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Filtrer l’aperçu de l’import"
        >
          <Button
            type="button"
            size="sm"
            variant={rowFilter === "ALL" ? "secondary" : "outline"}
            onClick={() => {
              setRowFilter("ALL");
              setPage(1);
            }}
          >
            Toutes ({preview.rows.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={rowFilter === "INVALID" ? "secondary" : "outline"}
            disabled={preview.invalidRows === 0}
            onClick={() => {
              setRowFilter("INVALID");
              setPage(1);
            }}
          >
            Erreurs ({preview.invalidRows})
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          {rowFilter === "INVALID" ? "Lignes à corriger uniquement" : "Aperçu paginé du fichier"}
        </p>
      </div>

      {pagedRows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <Table defaultSortByProfile={false} className="nim-data-table w-full min-w-[980px] text-left text-sm">
            <caption className="sr-only">Aperçu des lignes du fichier Tekla</caption>
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-3">Ligne</th>
                <th className="px-3 py-3">Repère</th>
                <th className="px-3 py-3">Profil</th>
                <th className="px-3 py-3 text-right">Qté</th>
                <th className="px-3 py-3">Qualité</th>
                <th className="px-3 py-3 text-right">Longueur</th>
                <th className="px-3 py-3 text-right">Poids</th>
                <th className="px-3 py-3 text-right">Pds Tot</th>
                <th className="px-3 py-3">Désignation</th>
                <th className="px-3 py-3">Résultat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagedRows.map((row) => (
                <tr key={row.row} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                  <td className="px-3 py-3 text-slate-400">{row.row}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">
                    {String(row.values.reference ?? "—")}
                  </td>
                  <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                    <span>{String(row.values.profile ?? "—")}</span>
                    {row.canonicalProfile ? (
                      <span className="mt-1 block text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Sera enregistré sous {row.canonicalProfile}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {String(row.values.quantity ?? "—")}
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                    {String(row.values.quality ?? "—")}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {String(row.values.lengthMm ?? "—")} mm
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {String(row.values.unitWeightKg ?? "—")}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                    {String(row.values.totalWeightKg ?? "—")}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-3 text-slate-600 dark:text-slate-300">
                    {String(row.values.designation ?? "—")}
                  </td>
                  <td className="px-3 py-3">
                    {row.valid ? (
                      <div className="space-y-1">
                        <StatusBadge tone="active">
                          <CheckCircle2 className="size-3 text-nim-red" />
                          Valide
                        </StatusBadge>
                        {row.warnings.length > 0 ? (
                          <p className="max-w-xs text-xs text-amber-700 dark:text-amber-300">
                            {row.warnings.join(" ")}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="max-w-xs text-xs text-red-700 dark:text-red-300">
                        <StatusBadge tone="danger">
                          <AlertTriangle className="size-3" />À corriger
                        </StatusBadge>
                        <p className="mt-1">{row.errors.join(" ")}</p>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 px-6 py-8 text-center text-sm text-slate-500 dark:border-slate-800">
          Aucune ligne ne correspond à ce filtre.
        </div>
      )}

      <Pagination
        page={safePage}
        pageCount={pageCount}
        pageSize={pageSize}
        total={filteredRows.length}
        pageSizes={[25, 50, 100]}
        itemLabel="ligne"
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPageSize(nextPageSize);
          setPage(1);
        }}
      />
    </div>
  );
}

export function PieceImportView({ offerId }: { offerId?: string } = {}): React.ReactNode {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const roleCanManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId ?? ""),
    enabled: Boolean(offerId),
    retry: false,
  });
  const offerEditable = !offerId || offerQuery.data?.offer.status === "DRAFT";
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [encoding, setEncoding] = useState<"text" | "base64">("text");
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PieceImportPreview | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [jarretAlertOpen, setJarretAlertOpen] = useState(false);
  const [jarretAcknowledged, setJarretAcknowledged] = useState(false);

  const previewMutation = useMutation({
    mutationFn: (input: { filename: string; content: string; encoding?: "text" | "base64" }) =>
      offerId ? previewOfferPieceImportRequest(offerId, input) : previewPieceImportRequest(input),
    onSuccess: (result) => {
      setPreview(result.preview);
      const foundJarret = result.preview.rows.some((row) => isJarret(row.values.designation));
      setJarretAcknowledged(false);
      setJarretAlertOpen(foundJarret);
    },
  });

  const commitMutation = useMutation({
    mutationFn: (input: { filename: string; content: string; encoding?: "text" | "base64" }) =>
      offerId ? commitOfferPieceImportRequest(offerId, input) : commitPieceImportRequest(input),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: offerId ? ["offer", offerId, "pieces"] : ["pieces"],
      });
      await queryClient.invalidateQueries({ queryKey: ["piece-facets", offerId ?? "ALL"] });
      await queryClient.invalidateQueries({
        queryKey: offerId ? ["offer", offerId, "profiles"] : ["piece-profiles"],
      });
      if (offerId) await queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      toast.success(`${result.result.rowsCreated} pièce(s) importée(s).`);
      router.push(offerId ? `/offers/${offerId}/pieces` : "/pieces");
    },
  });

  if (!roleCanManage) return <AccessDenied />;
  if (offerId && offerQuery.data?.offer && !offerEditable) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Import verrouillé</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
            Les pièces ne peuvent être importées que lorsque l’affaire est en brouillon. Repassez
            l’affaire en brouillon depuis la vue générale si un nouveau fichier Tekla doit remplacer
            le plan actuel.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <ReturnLink href={`/offers/${offerId}/pieces`}>Retour aux pièces</ReturnLink>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const chooseFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension || !["csv", "xls", "xlsx"].includes(extension)) {
      setFileError("Sélectionnez un fichier Tekla XLS ou XLSX.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("Le fichier ne doit pas dépasser 5 Mo.");
      return;
    }

    try {
      setFileError(null);
      const payload = await readImportFile(file);
      setFilename(file.name);
      setContent(payload.content);
      setEncoding(payload.encoding);
      setPreview(null);
      setJarretAlertOpen(false);
      setJarretAcknowledged(false);
      previewMutation.reset();
      commitMutation.reset();
    } catch {
      setFileError("Impossible de lire ce fichier. Sélectionnez un autre fichier Tekla.");
    }
  };

  const clearFile = (): void => {
    setFilename("");
    setContent("");
    setEncoding("text");
    setPreview(null);
    setJarretAlertOpen(false);
    setJarretAcknowledged(false);
    setFileError(null);
    previewMutation.reset();
    commitMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const error =
    fileError ??
    (previewMutation.isError
      ? mutationMessage(previewMutation.error)
      : commitMutation.isError
        ? mutationMessage(commitMutation.error)
        : null);
  const busy = previewMutation.isPending || commitMutation.isPending;
  const hasJarretDesignation = preview?.rows.some((row) => isJarret(row.values.designation)) ?? false;
  const returnToFileSelection = (): void => {
    setPreview(null);
    setJarretAlertOpen(false);
    setJarretAcknowledged(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <ReturnLink
          href={offerId ? `/offers/${offerId}/pieces` : "/pieces"}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-nim-red"
        >
          <ArrowLeft className="size-4" />
          Retour aux pièces
        </ReturnLink>
      </div>

      <PageHeader
        eyebrow={offerId ? "Affaire" : "Production"}
        title="Importer une liste Tekla"
        description="Importez le fichier Excel, validez les données puis créez les pièces de l’affaire."
      />

      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardContent className="p-5">
          <ImportSteps preview={preview} />
        </CardContent>
      </Card>

      {error ? (
        <div
          className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      ) : null}

      {!preview ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <Card className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">1. Fichier Excel</CardTitle>
              <p className="text-sm text-slate-500">
                Formats recommandés : XLS / XLSX. Les exports CSV restent compatibles.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label
                htmlFor="piece-import-file"
                className={`flex min-h-60 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
                  dragActive
                    ? "border-nim-red bg-red-50/70 dark:bg-red-950/20"
                    : "border-slate-300 bg-slate-50/50 hover:border-nim-red hover:bg-red-50/30 dark:border-slate-700 dark:bg-slate-900/40"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  void chooseFile(event.dataTransfer.files[0]);
                }}
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-red-50 text-nim-red dark:bg-red-950/30">
                  <FileSpreadsheet className="size-6" aria-hidden="true" />
                </div>
                <span className="mt-4 font-semibold text-slate-900 dark:text-slate-100">
                  Déposez votre fichier Tekla ici
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  XLS / XLSX · 5 Mo maximum · 1000 lignes maximum
                </span>
                <span className="mt-4 inline-flex h-9 items-center rounded-md bg-nim-red px-4 text-sm font-medium text-white shadow-sm">
                  Choisir un fichier
                </span>
                <input
                  ref={fileInputRef}
                  id="piece-import-file"
                  aria-label="Fichier Tekla des pièces"
                  type="file"
                  accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(event) => void chooseFile(event.target.files?.[0])}
                />
              </label>

              {filename ? (
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-950">
                  <FileText className="size-5 shrink-0 text-nim-red" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                      {filename}
                    </p>
                    <p className="text-xs text-slate-500">Fichier prêt pour l’analyse serveur.</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    disabled={busy}
                  >
                    <X className="size-4" />
                    Retirer
                  </Button>
                </div>
              ) : null}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => previewMutation.mutate({ filename, content, encoding })}
                  disabled={busy || !content}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  Analyser et continuer
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-base">Colonnes Tekla utilisées</CardTitle>
              <p className="text-sm text-slate-500">
                NIM conserve toutes les données métier ci-dessous.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {expectedColumns.map((column) => (
                <div
                  key={column}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-red-50 text-nim-red dark:bg-red-950/30">
                    <Check className="size-3" />
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{column}</span>
                </div>
              ))}
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                <span className="flex size-5 items-center justify-center rounded-full bg-slate-200 text-slate-500 dark:bg-slate-800">
                  <X className="size-3" />
                </span>
                <span className="font-medium text-slate-500">Surface</span>
                <span className="ml-auto text-xs font-medium text-slate-400">Ignorée</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-slate-200 shadow-panel dark:border-slate-800" aria-busy={busy}>
          <CardHeader className="gap-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">2. Validation & import</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Vérifiez les lignes avant l’enregistrement. Surface n’est jamais importée.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={returnToFileSelection} disabled={busy}>
                <ArrowLeft className="size-4" />
                Changer le fichier
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-500">Lignes détectées</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">
                  {preview.rowsTotal}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs text-slate-500">Lignes valides</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">
                  {preview.validRows}
                </p>
              </div>
              <div className="rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-950 dark:bg-red-950/25">
                <p className="text-xs text-red-600 dark:text-red-300">Lignes avec erreurs</p>
                <p className="mt-1 text-2xl font-semibold text-nim-red">{preview.invalidRows}</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-5">
            {hasJarretDesignation ? (
              <div
                className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
                aria-live="assertive"
              >
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-300" />
                <span>
                  Des pièces avec la désignation « jarret » ont été identifiées. Veuillez vérifier
                  leurs quantités, longueurs et poids avant de valider l’import.
                </span>
              </div>
            ) : null}
            {preview.invalidRows > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {preview.invalidRows} ligne(s) nécessitent votre attention. Corrigez le fichier
                  puis relancez l’aperçu.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-nim-red" />
                <span>Toutes les lignes sont prêtes à être importées.</span>
              </div>
            )}

            <PreviewTable preview={preview} />

            {preview.warningRows > 0 ? (
              <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {preview.warningRows} ligne(s) présentent un écart entre Poids × Qté et Pds Tot. La
                valeur Tekla est conservée pour vérification.
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={returnToFileSelection}
                disabled={busy}
              >
                Précédent
              </Button>
              <Button
                type="button"
                onClick={() => commitMutation.mutate({ filename, content, encoding })}
                disabled={preview.invalidRows > 0 || busy || (hasJarretDesignation && !jarretAcknowledged)}
              >
                {commitMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Importer {preview.validRows} pièce{preview.validRows > 1 ? "s" : ""}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <AlertDialog
        open={jarretAlertOpen}
        onOpenChange={(open) => {
          if (open) setJarretAlertOpen(true);
        }}
      >
        <AlertDialogContent className="border-2 border-red-500 shadow-2xl shadow-red-950/20 dark:border-red-700">
          <AlertDialogHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-red-100 text-red-700 ring-4 ring-red-50 dark:bg-red-950 dark:text-red-300 dark:ring-red-950/40">
              <OctagonAlert className="size-8" aria-hidden="true" />
            </div>
            <AlertDialogTitle className="text-xl font-bold text-red-800 dark:text-red-200">
              Attention requise : pièces « jarret » détectées
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-6">
              Vérifiez soigneusement les quantités, longueurs et poids des pièces « jarret » dans l’aperçu avant de lancer l’import.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-600"
              onClick={() => {
                setJarretAcknowledged(true);
                setJarretAlertOpen(false);
              }}
            >
              J’ai vérifié les pièces « jarret »
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
