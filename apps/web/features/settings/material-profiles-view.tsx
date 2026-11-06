"use client";

import { Table } from "@/components/ui/table";
import type { MaterialProfileCatalogItem } from "@nim/types";
import { materialProfileSchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AccessDenied } from "@/components/access/access-denied";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-provider";
import {
  ApiError,
  createMaterialProfileRequest,
  exportMaterialProfilesRequest,
  getMaterialProfilesRequest,
  importMaterialProfilesRequest,
  previewMaterialProfileImportRequest,
  updateMaterialProfileRequest,
  type MaterialProfileImportRow,
} from "@/features/auth/auth-client";

type ProfileForm = {
  profile: string;
  aliases: string[];
  kgPerMeter: string;
  rawLengthsMm: string[];
  isActive: boolean;
};
const emptyForm: ProfileForm = {
  profile: "",
  aliases: [],
  kgPerMeter: "",
  rawLengthsMm: [""],
  isActive: true,
};
const pageSizes = [10, 20, 50] as const;

function toForm(profile: MaterialProfileCatalogItem): ProfileForm {
  return {
    profile: profile.profile,
    aliases: profile.aliases ?? [],
    kgPerMeter: String(profile.kgPerMeter),
    rawLengthsMm: profile.rawLengthsMm.map(String),
    isActive: profile.isActive,
  };
}

export function MaterialProfilesView(): React.ReactNode {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [tableSorting, setTableSorting] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "profile", direction: "asc" });
  const [editing, setEditing] = useState<MaterialProfileCatalogItem | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [aliasDraft, setAliasDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<MaterialProfileImportRow[] | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [debouncedSearch, statusFilter]);

  const query = useQuery({
    queryKey: ["material-profiles", "admin", debouncedSearch],
    queryFn: () => getMaterialProfilesRequest({ search: debouncedSearch, includeInactive: true }),
    enabled: user?.role === "ADMIN",
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = materialProfileSchema.safeParse({
        profile: form.profile,
        aliases: form.aliases,
        kgPerMeter: Number(form.kgPerMeter),
        rawLengthsMm: form.rawLengthsMm.map((length) => Number(length)),
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Vérifiez les valeurs saisies.");
      return editing
        ? updateMaterialProfileRequest(editing.id, { ...parsed.data, aliases: parsed.data.aliases ?? [], isActive: form.isActive })
        : createMaterialProfileRequest({ ...parsed.data, aliases: parsed.data.aliases ?? [] });
    },
    onSuccess: async () => {
      setError(null);
      setEditing(null);
      setForm(emptyForm);
      setAliasDraft("");
      await queryClient.invalidateQueries({ queryKey: ["material-profiles"] });
    },
    onError: (reason) =>
      setError(
        reason instanceof ApiError || reason instanceof Error
          ? reason.message
          : "Impossible d’enregistrer le profil.",
      ),
  });

  const profiles = query.data?.profiles ?? [];
  const filteredProfiles = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          statusFilter === "ALL" ||
          (statusFilter === "ACTIVE" ? profile.isActive : !profile.isActive),
      ),
    [profiles, statusFilter],
  );
  const sortedProfiles = useMemo(() => {
    const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
    return [...filteredProfiles].sort((left, right) => {
      const a = tableSorting.field === "kgPerMeter" ? left.kgPerMeter : tableSorting.field === "rawLengthsMm" ? Math.min(...left.rawLengthsMm) : tableSorting.field === "isActive" ? Number(left.isActive) : tableSorting.field === "aliases" ? (left.aliases ?? []).join(" ") : left.profile;
      const b = tableSorting.field === "kgPerMeter" ? right.kgPerMeter : tableSorting.field === "rawLengthsMm" ? Math.min(...right.rawLengthsMm) : tableSorting.field === "isActive" ? Number(right.isActive) : tableSorting.field === "aliases" ? (right.aliases ?? []).join(" ") : right.profile;
      const result = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
      return (tableSorting.direction === "asc" ? result : -result) || left.id.localeCompare(right.id);
    });
  }, [filteredProfiles, tableSorting]);
  const pageCount = Math.max(1, Math.ceil(filteredProfiles.length / pageSize));
  const visibleProfiles = useMemo(
    () => sortedProfiles.slice((page - 1) * pageSize, page * pageSize),
    [sortedProfiles, page, pageSize],
  );
  const formatLengths = (lengths: number[]): string =>
    lengths.map((length) => `${length.toLocaleString("fr-FR")} mm`).join(" · ");

  if (!user || user.role !== "ADMIN") return <AccessDenied />;

  const beginEdit = (profile: MaterialProfileCatalogItem): void => {
    setEditing(profile);
    setForm(toForm(profile));
    setError(null);
    setAliasDraft("");
  };
  const resetForm = (): void => {
    setEditing(null);
    setForm(emptyForm);
    setAliasDraft("");
    setError(null);
  };
  const addAlias = (): void => {
    const alias = aliasDraft.trim().replace(/\s+/g, " ");
    if (!alias) return;
    const key = alias.replace(/\s+/g, "").toLocaleUpperCase();
    const names = [form.profile, ...form.aliases].map((name) =>
      name.replace(/\s+/g, "").toLocaleUpperCase(),
    );
    if (names.includes(key)) {
      setError("Cet alias est déjà utilisé pour ce profil.");
      return;
    }
    setError(null);
    setForm((current) => ({ ...current, aliases: [...current.aliases, alias] }));
    setAliasDraft("");
  };
  const previewFile = async (file?: File): Promise<void> => {
    if (!file) return;
    setImportBusy(true);
    setImportMessage(null);
    setImportPreview(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Le fichier ne doit pas dépasser 5 Mo.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      const result = await previewMaterialProfileImportRequest(file.name, btoa(binary));
      setImportPreview(result.preview.items);
      if (result.preview.invalid)
        setImportMessage(
          `${result.preview.valid} ligne(s) valide(s), ${result.preview.invalid} à corriger. L’import est bloqué tant que le fichier contient des erreurs.`,
        );
      else
        setImportMessage(
          `${result.preview.total} profil(s) prêts. Par défaut, les profils existants sont ignorés ; cochez l’option de remplacement pour les mettre à jour.`,
        );
    } catch (reason) {
      setImportMessage(reason instanceof Error ? reason.message : "Impossible de lire le fichier.");
    } finally {
      setImportBusy(false);
    }
  };
  const commitImport = async (): Promise<void> => {
    if (!importPreview?.length || importPreview.some((row) => row.errors.length)) return;
    setImportBusy(true);
    try {
      const result = await importMaterialProfilesRequest(importPreview, updateExisting);
      setImportMessage(
        `Import terminé : ${result.created} créé(s), ${result.updated} mis à jour, ${result.skipped} existant(s) ignoré(s).`,
      );
      setImportPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["material-profiles"] });
    } catch (reason) {
      setImportMessage(reason instanceof Error ? reason.message : "Échec de l’import.");
    } finally {
      setImportBusy(false);
    }
  };
  const exportCatalog = async (): Promise<void> => {
    setImportBusy(true);
    try {
      const blob = await exportMaterialProfilesRequest();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "nim-profils-matiere.xlsx";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setImportMessage(reason instanceof Error ? reason.message : "Échec de l’export.");
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Référentiel matière"
        title="Catalogue des profils"
        description="Poids linéique et longueurs brutes utilisés pour calculer le poids des pièces et préparer le façonnage."
        action={
          <Button
            variant="outline"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.7fr)]">
        <Card className="h-fit xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start xl:overflow-y-auto">
          <CardHeader>
            <CardTitle>{editing ? `Modifier ${editing.profile}` : "Ajouter un profil"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              La désignation est le nom canonique utilisé par les pièces. Les alias permettent de
              reconnaître les autres noms de ce profil lors des imports.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                mutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="catalog-profile">Désignation</Label>
                <Input
                  id="catalog-profile"
                  value={form.profile}
                  onChange={(event) => setForm({ ...form, profile: event.target.value })}
                  placeholder="IPE 200"
                  required
                />
                {editing ? (
                  <p className="text-xs text-muted-foreground">
                    Le nouveau nom s’applique au catalogue. Les pièces déjà enregistrées conservent
                    le profil indiqué lors de leur création.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-profile-alias">Alias et désignations alternatives</Label>
                <div className="flex gap-2">
                  <Input
                    id="catalog-profile-alias"
                    value={aliasDraft}
                    onChange={(event) => setAliasDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addAlias();
                      }
                    }}
                    placeholder="Ex. IPE 200, IPE200…"
                    aria-label="Nouvel alias de profil"
                    disabled={form.aliases.length >= 30}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addAlias}
                    disabled={!aliasDraft.trim() || form.aliases.length >= 30}
                  >
                    <Plus className="size-4" /> Ajouter
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  À l’import, ces noms seront reconnus et remplacés par la désignation canonique
                  ci-dessus. Jusqu’à 30 alias.
                </p>
                {form.aliases.length ? (
                  <div className="flex flex-wrap gap-2">
                    {form.aliases.map((alias) => (
                      <Badge key={alias} variant="secondary" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                        {alias}
                        <button
                          type="button"
                          aria-label={`Retirer l’alias ${alias}`}
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              aliases: current.aliases.filter((item) => item !== alias),
                            }))
                          }
                          className="rounded-full p-0.5 hover:bg-background/80"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>{" "}
              <div className="space-y-2">
                <Label htmlFor="catalog-kg-meter">Poids linéique (kg/m)</Label>
                <Input
                  id="catalog-kg-meter"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={form.kgPerMeter}
                  onChange={(event) => setForm({ ...form, kgPerMeter: event.target.value })}
                  placeholder="22,4"
                  required
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Longueurs brutes disponibles (mm)</legend>
                <div className="space-y-2">
                  {form.rawLengthsMm.map((length, index) => (
                    <div className="flex gap-2" key={`raw-length-${index}`}>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={length}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            rawLengthsMm: form.rawLengthsMm.map((current, itemIndex) =>
                              itemIndex === index ? event.target.value : current,
                            ),
                          })
                        }
                        aria-label={`Longueur brute ${index + 1}`}
                        placeholder="12 100"
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Supprimer la longueur brute ${index + 1}`}
                        disabled={form.rawLengthsMm.length <= 1}
                        onClick={() =>
                          setForm({
                            ...form,
                            rawLengthsMm: form.rawLengthsMm.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          })
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={form.rawLengthsMm.length >= 12}
                  onClick={() => setForm({ ...form, rawLengthsMm: [...form.rawLengthsMm, ""] })}
                >
                  <Plus className="size-4" />
                  Ajouter une longueur
                </Button>
                <p className="text-xs text-muted-foreground">
                  Jusqu’à 12 longueurs brutes différentes par profil. Elles sont proposées au
                  façonnage.
                </p>
              </fieldset>
              {editing ? (
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${form.isActive ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"}`}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {form.isActive ? "Profil actif" : "Profil inactif"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {form.isActive
                        ? "Proposé dans les pièces et le façonnage."
                        : "Masqué des suggestions, données conservées."}
                    </p>
                  </div>
                  <Switch
                    aria-label="Profil actif dans les suggestions"
                    checked={form.isActive}
                    onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                  />
                </div>
              ) : null}
              {error ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetForm}
                  disabled={mutation.isPending}
                >
                  Effacer
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : editing ? (
                    <Check className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {editing ? "Enregistrer" : "Créer le profil"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Profils enregistrés</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {filteredProfiles.length} affiché(s) sur {query.data?.total ?? 0} profil(s)
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <div className="relative min-w-0 flex-1 sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                    placeholder="Rechercher un profil ou un alias…"
                    aria-label="Rechercher dans le catalogue"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
                >
                  <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par statut">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous les statuts</SelectItem>
                    <SelectItem value="ACTIVE">Actifs</SelectItem>
                    <SelectItem value="INACTIVE">Inactifs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-3 border-b p-4">
              <details className="rounded-lg border bg-muted/20 p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Format Excel accepté · colonnes et exemple
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Première feuille du fichier · XLS/XLSX · 5 Mo maximum · jusqu’à 5 000 profils.
                  Colonnes : Désignation, Alias, Poids (kg/m) et une ou plusieurs colonnes de
                  longueur.
                </p>
                <div className="mt-3 overflow-x-auto rounded-md border bg-background">
                  <Table className="nim-data-table w-full min-w-[460px] text-left text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2">Désignation</th>
                        <th className="p-2">Alias</th>
                        <th className="p-2">Poids (kg/m)</th>
                        <th className="p-2">Longeure 1</th>
                        <th className="p-2">Longeure 2</th>
                        <th className="p-2">Longeure 3</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 font-medium">IPE200</td>
                        <td className="p-2">IPE 200</td>
                        <td className="p-2">22,4</td>
                        <td className="p-2">12100</td>
                        <td className="p-2">15100</td>
                        <td className="p-2 text-muted-foreground">(vide)</td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Poids positif en kg/m, longueurs positives en mm. Les profils déjà présents seront
                  mis à jour après confirmation de l’aperçu. En-têtes acceptés également :
                  Profil/Profile, kg/m, Longueur 1 ou Longeure 1.
                </p>
              </details>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void exportCatalog()}
                  disabled={importBusy}
                >
                  <Download className="size-4" />
                  Exporter le catalogue
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                  <FileSpreadsheet className="size-4" />
                  {importBusy ? "Traitement…" : "Aperçu Excel"}
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="sr-only"
                    disabled={importBusy}
                    onChange={(event) => {
                      void previewFile(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {importPreview?.length ? (
                  <Button
                    type="button"
                    onClick={() => void commitImport()}
                    disabled={importBusy || importPreview.some((row) => row.errors.length > 0)}
                  >
                    <Upload className="size-4" />
                    Confirmer l’import ({importPreview.length})
                  </Button>
                ) : null}
              </div>
              {importMessage ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {importMessage}
                </p>
              ) : null}
              {importPreview ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
                    <p className="text-sm">
                      {importPreview.filter((row) => row.existing).length} profil(s) déjà présents
                      dans le catalogue.
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-sm">Remplacer les données existantes</span>
                      <Switch
                        aria-label="Remplacer les données existantes"
                        checked={updateExisting}
                        onCheckedChange={setUpdateExisting}
                        className={updateExisting ? "[&>span]:bg-amber-600" : undefined}
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-auto rounded-md border">
                    <Table className="nim-data-table w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="p-2">Profil</th>
                          <th className="p-2">Alias</th>
                          <th className="p-2">kg/m importé</th>
                          <th className="p-2">Longueurs importées</th>
                          <th className="p-2">État</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 100).map((row) => (
                          <tr key={row.row} className="border-t">
                            <td className="p-2 font-medium">{row.profile || `Ligne ${row.row}`}</td>
                            <td className="p-2">{row.aliases?.join(" · ") || "—"}</td>
                            <td className="p-2">
                              {Number.isFinite(row.kgPerMeter) ? row.kgPerMeter : "—"}
                            </td>
                            <td className="p-2">{row.rawLengthsMm.join(" · ")}</td>
                            <td className="p-2">
                              {row.errors.length ? (
                                <span className="text-destructive">{row.errors.join("; ")}</span>
                              ) : row.existing ? (
                                <div>
                                  <StatusBadge tone="warning">
                                    {updateExisting ? "Sera remplacé" : "Déjà présent · ignoré"}
                                  </StatusBadge>
                                  <p className="mt-1 text-muted-foreground">
                                    Actuel : {row.existing.profile} · {row.existing.kgPerMeter} kg/m ·{" "}
                                    {row.existing.rawLengthsMm.join(" · ")} mm
                                    {row.existing.aliases.length
                                      ? ` · Alias : ${row.existing.aliases.join(", ")}`
                                      : ""}
                                  </p>
                                </div>
                              ) : (
                                <CategoryBadge tone="teal">Nouveau</CategoryBadge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    {importPreview.length > 100 ? (
                      <p className="p-2 text-muted-foreground">
                        Aperçu limité aux 100 premières lignes.
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
            {query.isLoading ? (
              <div className="space-y-3 p-5" aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : query.isError ? (
              <div className="p-8 text-center" role="alert">
                <p className="font-medium">Catalogue indisponible</p>
                <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>
                  Réessayer
                </Button>
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {search
                  ? "Aucun profil ne correspond à cette recherche et à ce statut."
                  : statusFilter !== "ALL"
                    ? "Aucun profil pour ce statut."
                    : "Le catalogue ne contient aucun profil."}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="nim-data-table w-full min-w-[780px] text-left text-sm" serverSorting={{ column: tableSorting.field === "profile" ? "Désignation" : tableSorting.field === "aliases" ? "Alias reconnus" : tableSorting.field === "kgPerMeter" ? "kg/m" : tableSorting.field === "rawLengthsMm" ? "Longueurs brutes" : "État", direction: tableSorting.direction }} onServerSort={(column, direction) => { const field = ({ "Désignation": "profile", "Alias reconnus": "aliases", "kg/m": "kgPerMeter", "Longueurs brutes": "rawLengthsMm", "État": "isActive" } as Record<string, string>)[column]; if (field) { setTableSorting({ field, direction }); setPage(1); } }}>
                    <thead>
                      <tr>
                        <th className="px-4">Désignation</th>
                        <th className="px-4">Alias reconnus</th>
                        <th className="px-4 text-right">kg/m</th>
                        <th className="px-4">Longueurs brutes</th>
                        <th className="px-4">État</th>
                        <th className="px-4 text-right" data-sortable="false">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProfiles.map((profile) => (
                        <tr key={profile.id}>
                          <td className="px-4 font-semibold">{profile.profile}</td>
                          <td className="px-4 text-muted-foreground">
                            {profile.aliases?.length ? profile.aliases.join(" · ") : "—"}
                          </td>
                          <td className="px-4 text-right tabular-nums">
                            {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(
                              profile.kgPerMeter,
                            )}
                          </td>
                          <td className="px-4 text-muted-foreground">
                            {formatLengths(profile.rawLengthsMm)}
                          </td>
                          <td className="px-4">
                            <StatusBadge tone={profile.isActive ? "active" : "neutral"}>
                              {profile.isActive ? "Actif" : "Inactif"}
                            </StatusBadge>
                          </td>
                          <td className="px-4 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => beginEdit(profile)}
                            >
                              <Pencil className="size-4" />
                              Modifier
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  pageSize={pageSize}
                  total={filteredProfiles.length}
                  pageSizes={pageSizes}
                  itemLabel="profil"
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
