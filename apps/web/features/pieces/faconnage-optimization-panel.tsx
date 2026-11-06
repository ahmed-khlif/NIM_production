"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { ProfileFamily } from "@nim/types";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Loader2,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import {
  ApiError,
  validateCuttingPlanBarsRequest,
  optimizeFaconnageRequest,
  type FaconnageCuttingBarPlan,
  type FaconnageCuttingPlanAlternative,
  type FaconnageOptimizationBatchResult,
  type FaconnageOptimizationRequest,
  type FaconnageProfileOptimizationResult,
} from "@/features/auth/auth-client";

type Requirement = { profile: string; lengthMm: number; quantity: number };
const familyLabel: Record<ProfileFamily, string> = { IPE: "IPE", HEA: "HEA", UPN: "UPN", L: "L", ROND: "ROND", OTHER: "Autres profils" };
type RawLengthRow = { length: string; quantity: string };
type RawLengthState = Record<string, RawLengthRow[]>;
const commonRawBarLengths = [6000, 12100, 15100];
type MaterialProfileLengths = Record<string, { kgPerMeter: number; rawLengthsMm: number[] }>;

function catalogProfileKey(profile: string): string {
  return profile.trim().replace(/\s+/g, "").toLocaleUpperCase();
}

function defaultRawLengthRows(
  profile: string,
  requirements: Array<{ lengthMm: number; quantity: number }>,
  materialProfiles: MaterialProfileLengths,
): RawLengthRow[] {
  const configured = materialProfiles[catalogProfileKey(profile)]?.rawLengthsMm;
  const lengths = configured?.length
    ? configured
    : commonRawBarLengths.filter((length) => length >= Math.max(...requirements.map((item) => item.lengthMm)));
  return lengths.map((length) => ({ length: String(length), quantity: "" }));
}
type PlanProposal = NonNullable<FaconnageOptimizationBatchResult["proposals"]>[number];

function formatMm(value: number): string {
  return `${value.toLocaleString("fr-FR")} mm`;
}

function statusLabel(status: FaconnageProfileOptimizationResult["status"]): string {
  if (status === "OPTIMAL") return "Solution optimale";
  if (status === "FEASIBLE") return "Très bonne solution";
  return "Solution rapide";
}

function mutationMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Impossible de calculer la mise en barres. Réessayez.";
}

function CuttingBar({
  bar,
  index,
  proposal,
  checked,
  disabled,
  onToggle,
}: {
  bar: FaconnageCuttingBarPlan;
  index: number;
  proposal?: PlanProposal;
  checked?: boolean;
  disabled?: boolean;
  onToggle?: (checked: boolean) => void;
}): React.ReactNode {
  const fills = ["bg-red-700", "bg-red-600", "bg-red-500", "bg-red-400"];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          {proposal ? <input type="checkbox" className="size-5 shrink-0 accent-red-600" checked={checked} disabled={disabled} aria-label={`Sélectionner ${proposal.reference}`} onChange={(event) => onToggle?.(event.target.checked)} /> : null}
          <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{proposal?.reference ?? `Barre ${index + 1}`}</p>
          <p className="text-xs text-slate-500">Brut : {formatMm(bar.rawLengthMm)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {proposal ? <StatusBadge tone={proposal.status === "VALIDATED" ? "active" : "info"}>{proposal.status === "VALIDATED" ? "Créée" : "À créer"}</StatusBadge> : null}
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{bar.utilizationRate.toLocaleString("fr-FR")} %</Badge>
        </div>
      </div>

      <div className="flex h-12 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900" aria-label={`Plan de coupe de la barre ${index + 1}`}>
        {bar.cuts.map((cut, cutIndex) => {
          const total = cut.lengthMm * cut.quantity;
          const width = (total / bar.rawLengthMm) * 100;
          return (
            <div
              key={`${cut.lengthMm}-${cutIndex}`}
              className={`flex min-w-0 items-center justify-center border-r border-white/40 px-1 text-[10px] font-semibold text-white ${fills[cutIndex % fills.length]}`}
              style={{ width: `${width}%` }}
              title={`${formatMm(cut.lengthMm)} × ${cut.quantity}`}
            >
              <span className="truncate">{cut.quantity > 1 ? `${cut.lengthMm} × ${cut.quantity}` : cut.lengthMm}</span>
            </div>
          );
        })}
        {bar.wasteMm > 0 ? (
          <div
            className="flex min-w-0 items-center justify-center bg-slate-300 px-1 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
            style={{ width: `${(bar.wasteMm / bar.rawLengthMm) * 100}%` }}
            title={`Chute : ${formatMm(bar.wasteMm)}`}
          >
            <span className="truncate">{bar.wasteMm}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-slate-400">Utilisé</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{formatMm(bar.usedLengthMm)}</p>
        </div>
        <div>
          <p className="text-slate-400">Chute</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{formatMm(bar.wasteMm)}</p>
        </div>
        <div>
          <p className="text-slate-400">Coupes</p>
          <p className="font-semibold text-slate-700 dark:text-slate-200">{bar.cuts.reduce((sum, cut) => sum + cut.quantity, 0)}</p>
        </div>
      </div>
    </div>
  );
}

function AlternativeTable({ alternatives }: { alternatives: FaconnageCuttingPlanAlternative[] }): React.ReactNode {
  if (alternatives.length === 0) return null;
  const columns: ColumnDef<FaconnageCuttingPlanAlternative>[] = [
    {
      id: "plan",
      header: "Plan",
      enableSorting: false,
      cell: ({ row }) => `Alternative ${row.index + 1}`,
    },
    { accessorKey: "totalBars", header: "Barres" },
    { accessorKey: "totalRawLengthMm", header: "Matière brute", cell: ({ getValue }) => formatMm(getValue<number>()) },
    { accessorKey: "totalWasteMm", header: "Chute", cell: ({ getValue }) => formatMm(getValue<number>()) },
    { accessorKey: "utilizationRate", header: "Rendement", cell: ({ getValue }) => `${getValue<number>().toLocaleString("fr-FR")} %` },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Alternatives calculées</p>
      </div>
      <DataTable columns={columns} data={alternatives} caption="Alternatives de plans de coupe" getRowId={(row, index) => `${row.totalBars}-${row.totalWasteMm}-${index}`} />
    </div>
  );
}

function ProfileResult({
  result,
  proposals,
  selectedProposalIds,
  disabled,
  onToggleProposal,
  onToggleGroup,
}: {
  result: FaconnageProfileOptimizationResult;
  proposals: PlanProposal[];
  selectedProposalIds: string[];
  disabled: boolean;
  onToggleProposal: (proposalId: string, checked: boolean) => void;
  onToggleGroup: (proposalIds: string[], checked: boolean) => void;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const selectRef = useRef<HTMLInputElement>(null);
  const pendingProposals = proposals.filter((proposal) => proposal.status === "PROPOSED");
  const selectedCount = pendingProposals.filter((proposal) => selectedProposalIds.includes(proposal.id)).length;
  const allSelected = pendingProposals.length > 0 && selectedCount === pendingProposals.length;
  useEffect(() => {
    if (selectRef.current) selectRef.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);
  const detailsId = `profile-result-details-${result.profile.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
      <CardHeader className="border-b border-slate-200 p-0 dark:border-slate-800">
        <div className="flex items-center gap-3 px-4 sm:px-5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? "Masquer" : "Afficher"} le détail de ${result.profile}`}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-h-20 min-w-0 flex-1 flex-wrap items-center justify-between gap-3 py-4 text-left transition-colors hover:text-nim-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600"
        >
          <span className="flex min-w-0 items-center gap-3">
            {expanded ? <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500" /> : <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-500" />}
            <span>
              <span className="block text-lg font-semibold text-slate-950 dark:text-slate-100">{result.profile}</span>
              <span className="mt-1 block text-sm text-slate-500">Plan recommandé · {result.totalBars} barre(s) · {result.utilizationRate.toLocaleString("fr-FR")} % rendement</span>
            </span>
          </span>
          <StatusBadge tone="active">
            <CheckCircle2 className="size-3" />
            {statusLabel(result.status)}
          </StatusBadge>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">{selectedCount}/{pendingProposals.length} sélectionnées</span>
          <input ref={selectRef} type="checkbox" className="size-5 accent-red-600" checked={allSelected} disabled={disabled || pendingProposals.length === 0} aria-label={`Sélectionner toutes les barres ${result.profile}`} onChange={(event) => onToggleGroup(pendingProposals.map((proposal) => proposal.id), event.target.checked)} />
        </div>
        </div>
      </CardHeader>
      {expanded ? <CardContent id={detailsId} data-testid={detailsId} className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Barres", result.totalBars.toLocaleString("fr-FR")],
            ["Matière brute", formatMm(result.totalRawLengthMm)],
            ["Longueur utile", formatMm(result.totalUsedLengthMm)],
            ["Chute totale", formatMm(result.totalWasteMm)],
            ["Rendement", `${result.utilizationRate.toLocaleString("fr-FR")} %`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-1 font-semibold text-slate-950 dark:text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {proposals.map((proposal, index) => <CuttingBar
            key={proposal.id}
            index={index}
            proposal={proposal}
            bar={{
              rawLengthMm: proposal.rawLengthMm,
              cuts: proposal.cuts,
              usedLengthMm: proposal.usedLengthMm,
              wasteMm: proposal.wasteMm,
              utilizationRate: proposal.rawLengthMm > 0 ? (proposal.usedLengthMm / proposal.rawLengthMm) * 100 : 0,
            }}
            checked={proposal.status === "VALIDATED" || selectedProposalIds.includes(proposal.id)}
            disabled={disabled || proposal.status !== "PROPOSED"}
            onToggle={(checked) => onToggleProposal(proposal.id, checked)}
          />)}
        </div>

        <AlternativeTable alternatives={result.alternatives} />
      </CardContent> : null}
    </Card>
  );
}

export function FaconnageOptimizationResultView({
  offerId,
  optimization,
  onChange,
  onEditConfiguration,
}: {
  offerId: string;
  optimization: FaconnageOptimizationBatchResult;
  onChange?: (next: FaconnageOptimizationBatchResult) => void;
  onEditConfiguration?: () => void;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>(() =>
    (optimization.proposals ?? [])
      .filter((proposal) => proposal.status === "PROPOSED")
      .map((proposal) => proposal.id),
  );
  const [proposalSearch, setProposalSearch] = useState("");
  const proposals = optimization.proposals ?? [];
  const remainingProposals = proposals.filter((proposal) => proposal.status === "PROPOSED");
  const filteredProposals = proposals.filter((proposal) =>
    `${proposal.reference} ${proposal.profile} ${proposal.rawLengthMm} ${proposal.cuts.map((cut) => cut.lengthMm).join(" ")}`
      .toLowerCase().includes(proposalSearch.trim().toLowerCase()),
  );
  const filteredPendingProposals = filteredProposals.filter((proposal) => proposal.status === "PROPOSED");
  const allFilteredSelected = filteredPendingProposals.length > 0 &&
    filteredPendingProposals.every((proposal) => selectedProposalIds.includes(proposal.id));
  const validateMutation = useMutation({
    mutationFn: ({ planId, proposalIds }: { planId: string; proposalIds: string[] }) =>
      validateCuttingPlanBarsRequest(offerId, planId, proposalIds),
    onSuccess: (response) => {
      const validatedIds = new Set(selectedProposalIds);
      const next = {
        ...optimization,
        plan: optimization.plan
          ? { ...optimization.plan, status: response.plan.status }
          : optimization.plan,
        proposals: proposals.map((proposal) => validatedIds.has(proposal.id)
          ? { ...proposal, status: "VALIDATED" as const }
          : proposal),
      };
      setSelectedProposalIds(proposals
        .filter((proposal) => proposal.status === "PROPOSED" && !validatedIds.has(proposal.id))
        .map((proposal) => proposal.id));
      onChange?.(next);
      toast.success(`${response.plan.barsCreated} barre(s) créée(s). ${response.plan.remainingBarCount} restante(s).`);
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "cutting-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bars"] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "pieces"] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bar-assignments"] });
    },
    onError: (error) => toast.error(mutationMessage(error)),
  });

  return (
    <div className="space-y-5" data-testid="faconnage-optimization-result">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">Résultat de l’optimisation</p>
          <p className="mt-0.5 text-xs text-slate-500">Les barres proposées sont sélectionnées par défaut. Décochez celles à exclure.</p>
        </div>
        {onEditConfiguration ? <Button type="button" variant="outline" size="sm" onClick={onEditConfiguration}>Modifier la configuration</Button> : null}
      </div>
      {optimization.plan ? (
        <Card className="border-slate-200 shadow-panel dark:border-slate-800">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-950 dark:text-slate-100">Plan {optimization.plan.reference}</p>
                <StatusBadge tone={optimization.plan.status === "VALIDATED" || optimization.plan.status === "APPROVED" ? "active" : optimization.plan.status === "PARTIALLY_VALIDATED" ? "info" : optimization.plan.status === "CANCELLED" ? "warning" : "neutral"}>{optimization.plan.status === "VALIDATED" || optimization.plan.status === "APPROVED"
                  ? "Barres créées"
                  : optimization.plan.status === "PARTIALLY_VALIDATED"
                    ? "Création partielle"
                    : optimization.plan.status === "CANCELLED" ? "Annulé" : "Brouillon"}</StatusBadge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {optimization.plan.status === "PARTIALLY_VALIDATED"
                  ? `${proposals.length - remainingProposals.length} barre(s) créée(s) · ${remainingProposals.length} restante(s).`
                  : "Choisissez les barres à matérialiser. Les autres pièces restent disponibles."}
              </p>
            </div>
            {(optimization.plan.status === "DRAFT" || optimization.plan.status === "PARTIALLY_VALIDATED") && remainingProposals.length > 0 ? (
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Sélectionnez les barres à créer dans la liste ci-dessous.</p>
            ) : optimization.plan.status === "VALIDATED" || optimization.plan.status === "APPROVED" ? (
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                Toutes les barres sont créées
              </div>
            ) : (
              <span className="text-sm text-slate-500">Plan archivé</span>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-red-100 bg-red-50/40 shadow-panel dark:border-red-950 dark:bg-red-950/10">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Profils", optimization.summary.profileCount.toLocaleString("fr-FR")],
            ["Barres", optimization.summary.totalBars.toLocaleString("fr-FR")],
            ["Matière brute", formatMm(optimization.summary.totalRawLengthMm)],
            ["Chute totale", formatMm(optimization.summary.totalWasteMm)],
            ["Rendement", `${optimization.summary.utilizationRate.toLocaleString("fr-FR")} %`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {optimization.plan ? (
        <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
          <CardHeader className="border-b border-slate-200 p-0 dark:border-slate-800">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <p className="font-semibold text-slate-950 dark:text-slate-100">Plan recommand&eacute; de mise en barres</p>
                <p className="mt-1 text-sm text-slate-500">{remainingProposals.length} barre(s) restante(s) &middot; {selectedProposalIds.length} s&eacute;lectionn&eacute;e(s)</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 sm:w-72"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input type="search" value={proposalSearch} onChange={(event) => setProposalSearch(event.target.value)} placeholder="Rechercher une barre ou un profil&hellip;" aria-label="Rechercher dans les barres propos&#233;es" className="pl-9" /></div>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  const ids = new Set(filteredPendingProposals.map((proposal) => proposal.id));
                  setSelectedProposalIds((current) => allFilteredSelected
                    ? current.filter((id) => !ids.has(id))
                    : [...new Set([...current, ...ids])]);
                }} disabled={filteredPendingProposals.length === 0 || validateMutation.isPending}>
                  {allFilteredSelected ? "Tout d\u00e9s\u00e9lectionner" : "Tout s\u00e9lectionner"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {optimization.profiles.map((result) => {
              const profileProposals = filteredProposals.filter((proposal) => proposal.profile === result.profile);
              if (profileProposals.length === 0) return null;
              return <ProfileResult
                key={result.profile}
                result={result}
                proposals={profileProposals}
                selectedProposalIds={selectedProposalIds}
                disabled={validateMutation.isPending}
                onToggleProposal={(proposalId, checked) => setSelectedProposalIds((current) => checked ? [...new Set([...current, proposalId])] : current.filter((id) => id !== proposalId))}
                onToggleGroup={(proposalIds, checked) => setSelectedProposalIds((current) => checked ? [...new Set([...current, ...proposalIds])] : current.filter((id) => !proposalIds.includes(id)))}
              />;
            })}
            {filteredProposals.length === 0 ? <p className="p-5 text-sm text-slate-500">Aucune barre ne correspond &agrave; cette recherche.</p> : null}
          </div>
        </Card>
      ) : null}

      {optimization.plan && remainingProposals.length > 0 ? (
        <div className="sticky bottom-0 z-30 -mx-4 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950/95">
          <p className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
            <span className="font-semibold text-slate-950 dark:text-slate-100">{selectedProposalIds.length}</span> barre(s) sélectionnée(s) · {remainingProposals.length} restante(s)
            {proposals.length - remainingProposals.length > 0 ? ` · ${proposals.length - remainingProposals.length} déjà créée(s)` : ""}
          </p>
          <Button
            type="button"
            onClick={() => optimization.plan && validateMutation.mutate({ planId: optimization.plan.id, proposalIds: selectedProposalIds })}
            disabled={validateMutation.isPending || selectedProposalIds.length === 0}
          >
            {validateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {validateMutation.isPending ? "Création en cours…" : `Créer ${selectedProposalIds.length} barre(s)`}
          </Button>
        </div>
      ) : optimization.plan && (optimization.plan.status === "VALIDATED" || optimization.plan.status === "APPROVED") ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-900 dark:bg-emerald-950/25">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="size-5" />Toutes les barres sont créées et disponibles dans l’Affaire.</div>
          <Button asChild><Link href={`/offers/${offerId}/bar-assignments`}>Continuer vers les affectations<ArrowRight className="size-4" /></Link></Button>
        </div>
      ) : null}
    </div>
  );
}

export function FaconnageOptimizationPanel({ offerId, requirements, profileFamilies = {}, materialProfiles = {} }: { offerId?: string; requirements: Requirement[]; profileFamilies?: Record<string, ProfileFamily>; materialProfiles?: MaterialProfileLengths }): React.ReactNode {
  const groupedRequirements = useMemo(() => {
    const grouped = new Map<string, Map<number, number>>();
    for (const requirement of requirements) {
      const items = grouped.get(requirement.profile) ?? new Map<number, number>();
      items.set(requirement.lengthMm, (items.get(requirement.lengthMm) ?? 0) + requirement.quantity);
      grouped.set(requirement.profile, items);
    }
    return [...grouped.entries()].map(([profile, items]) => ({
      profile,
      requirements: [...items].map(([lengthMm, quantity]) => ({ lengthMm, quantity })).sort((left, right) => right.lengthMm - left.lengthMm),
    }));
  }, [requirements]);
  const profilesKey = groupedRequirements.map((group) => group.profile).join("|");
  const [excludedProfiles, setExcludedProfiles] = useState<string[]>([]);
  useEffect(() => setExcludedProfiles([]), [profilesKey]);
  const activeRequirements = groupedRequirements.filter((group) => !excludedProfiles.includes(group.profile));
  const [expandedProfile, setExpandedProfile] = useState<string | null>(
    () => groupedRequirements[0]?.profile ?? null,
  );

  const [rawLengths, setRawLengths] = useState<RawLengthState>(() =>
    Object.fromEntries(activeRequirements.map((group) => [group.profile, defaultRawLengthRows(group.profile, group.requirements, materialProfiles)])),
  );
  const activeProfilesKey = activeRequirements.map((group) => group.profile).join("|");
  useEffect(() => {
    const names = activeProfilesKey ? activeProfilesKey.split("|") : [];
    setExpandedProfile((current) => (current && names.includes(current) ? current : names[0] ?? null));
  }, [activeProfilesKey]);
  useEffect(() => {
    setRawLengths((current) => Object.fromEntries(activeRequirements.map((group) => [group.profile, current[group.profile] ?? defaultRawLengthRows(group.profile, group.requirements, materialProfiles)])));
  }, [activeProfilesKey, materialProfiles]);
  const [optimization, setOptimization] = useState<FaconnageOptimizationBatchResult | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const pieceBasedSuggestions = Object.fromEntries(activeRequirements.map((group) => {
    const alreadyConfigured = new Set((rawLengths[group.profile] ?? []).map((row) => Number(row.length)).filter(Boolean));
    const suggestions = [...new Set(group.requirements.map((item) => Math.ceil((item.lengthMm + 100) / 500) * 500))]
      .filter((length) => !alreadyConfigured.has(length))
      .sort((left, right) => left - right);
    return [group.profile, suggestions];
  }));

  const optimizeMutation = useMutation({
    mutationFn: (input: FaconnageOptimizationRequest) => {
      if (!offerId) throw new Error("Cette optimisation doit être lancée depuis une affaire.");
      return optimizeFaconnageRequest(offerId, input);
    },
    onSuccess: (response) => {
      setOptimization(response.optimization);
      setClientError(null);
    },
  });

  const updateRawLength = (profile: string, index: number, field: keyof RawLengthRow, value: string): void => {
    setOptimization(null);
    setRawLengths((current) => ({
      ...current,
      [profile]: (current[profile] ?? [{ length: "", quantity: "" }]).map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value.replace(/[^0-9]/g, "") } : item)),
    }));
  };

  const addRawLength = (profile: string): void => {
    setOptimization(null);
    setRawLengths((current) => ({ ...current, [profile]: [...(current[profile] ?? [{ length: "", quantity: "" }]), { length: "", quantity: "" }] }));
  };

  const addSuggestedRawLength = (profile: string, lengthMm: number): void => {
    setOptimization(null);
    setClientError(null);
    setRawLengths((current) => {
      const rows = current[profile] ?? [{ length: "", quantity: "" }];
      if (rows.some((row) => Number(row.length) === lengthMm)) return current;
      const emptyIndex = rows.findIndex((row) => !row.length.trim());
      const next = [...rows];
      if (emptyIndex >= 0) next[emptyIndex] = { length: String(lengthMm), quantity: "" };
      else next.push({ length: String(lengthMm), quantity: "" });
      return { ...current, [profile]: next };
    });
  };

  const removeRawLength = (profile: string, index: number): void => {
    setOptimization(null);
    setRawLengths((current) => {
      const next = (current[profile] ?? [{ length: "", quantity: "" }]).filter((_, itemIndex) => itemIndex !== index);
      return { ...current, [profile]: next.length > 0 ? next : [{ length: "", quantity: "" }] };
    });
  };

  const reset = (): void => {
    setOptimization(null);
    setClientError(null);
    optimizeMutation.reset();
    setRawLengths(Object.fromEntries(activeRequirements.map((group) => [group.profile, defaultRawLengthRows(group.profile, group.requirements, materialProfiles)])));
  };

  const submit = (): void => {
    const profiles: FaconnageOptimizationRequest["profiles"] = [];
    if (activeRequirements.length === 0) {
      setClientError("Conservez au moins un profil à optimiser.");
      return;
    }
    for (const group of activeRequirements) {
      const values = (rawLengths[group.profile] ?? []).map((row) => ({
        lengthMm: Number(row.length),
        quantity: row.quantity === "" ? undefined : Number(row.quantity),
      })).filter((row) => Number.isInteger(row.lengthMm) && row.lengthMm > 0 && (row.quantity === undefined || (Number.isInteger(row.quantity) && row.quantity >= 0)));
      if (values.length === 0) {
        setClientError(`Ajoutez au moins une longueur de matière brute pour ${group.profile}.`);
        return;
      }
      const longestPiece = Math.max(...group.requirements.map((item) => item.lengthMm));
      if (Math.max(...values.map((row) => row.lengthMm)) < longestPiece) {
        setClientError(`Pour ${group.profile}, aucune longueur brute ne peut contenir la pièce de ${formatMm(longestPiece)}.`);
        return;
      }
      profiles.push({
        profile: group.profile,
        requirements: group.requirements,
        rawLengths: values,
      });
    }
    setClientError(null);
    optimizeMutation.mutate({ profiles });
  };

  const error = clientError ?? (optimizeMutation.isError ? mutationMessage(optimizeMutation.error) : null);

  return (
    <div className="space-y-5" data-testid="faconnage-optimization-panel">
      {!optimization ? <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-nim-red">
            <Scissors className="size-4" />
            Mise en barres
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">Configurer les longueurs brutes</h2>
          <p className="mt-1 text-xs text-slate-500">Chaque profil garde ses propres longueurs. Les boutons proposent aussi des formats calculés depuis les pièces sélectionnées ; vérifiez qu’ils correspondent à une barre réellement disponible avant de les ajouter.</p>
          <p className="mt-1 text-sm text-slate-500">Les profils viennent des pièces sélectionnées. La quantité disponible est facultative et limite ce calcul seulement, sans réserver le stock.</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset} disabled={optimizeMutation.isPending}>
          <RotateCcw className="size-4" />
          Réinitialiser
        </Button>
      </div>

      {!offerId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          Ouvrez une affaire avant de lancer une optimisation de façonnage.
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/50">
        <span className="text-slate-600 dark:text-slate-300">Profils inclus dans ce calcul · {activeRequirements.length} / {groupedRequirements.length}</span>
        {excludedProfiles.length ? <div className="flex flex-wrap gap-1.5">{excludedProfiles.map((profile) => <Button key={profile} type="button" variant="outline" size="sm" onClick={() => setExcludedProfiles((current) => current.filter((item) => item !== profile))}>+ {profile}</Button>)}</div> : null}
      </div>
      {activeRequirements.length === 0 ? <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">Ajoutez de nouveau un profil depuis l’étape de sélection avant de lancer le calcul.</div> : null}
      <div className="grid gap-4" data-testid="faconnage-raw-length-profile-list">
        {activeRequirements.map((group) => {
          const isExpanded = expandedProfile === group.profile;
          const configuredLengths = (rawLengths[group.profile] ?? []).map((row) => row.length).filter(Boolean);
          return (
          <Card key={group.profile} className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <button type="button" aria-expanded={isExpanded} aria-label={`${isExpanded ? "Masquer" : "Configurer"} les longueurs ${group.profile}`} onClick={() => setExpandedProfile((current) => current === group.profile ? null : group.profile)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nim-red">
                  {isExpanded ? <ChevronDown className="size-4 shrink-0 text-slate-500" /> : <ChevronRight className="size-4 shrink-0 text-slate-500" />}
                  <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold text-slate-900 dark:text-slate-100">{group.profile}</span><Badge variant="outline">Famille · {familyLabel[profileFamilies[group.profile] ?? "OTHER"]}</Badge></span><span className="mt-1 block truncate text-xs text-slate-500">{group.requirements.reduce((sum, item) => sum + item.quantity, 0)} pièce(s) à produire · {configuredLengths.length ? `${configuredLengths.join(" · ")} mm configuré(s)` : "longueurs à configurer"}</span></span>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{group.requirements.length} longueur(s)</Badge>
                  <Button type="button" variant="ghost" size="icon" disabled={activeRequirements.length <= 1 || optimizeMutation.isPending} onClick={() => { setOptimization(null); setExcludedProfiles((current) => [...current, group.profile]); }} aria-label={`Retirer le profil ${group.profile} de ce calcul`}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {isExpanded ? <CardContent className="space-y-5 p-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Besoins</p>
                <div className="flex flex-wrap gap-2">
                  {group.requirements.map((item) => (
                    <span key={item.lengthMm} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                      {formatMm(item.lengthMm)} × {item.quantity}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Longueurs de matière brute possibles</p>
                  <Button type="button" variant="ghost" size="sm" onClick={() => addRawLength(group.profile)}>
                    <Plus className="size-4" />
                    Ajouter
                  </Button>
                </div>
                <div className="space-y-2">
                  {(rawLengths[group.profile] ?? [{ length: "", quantity: "" }]).map((row, index) => (
                    <div key={`${group.profile}-${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(100px,0.55fr)_40px] items-center gap-2">
                      <div className="relative">
                        <Input
                          inputMode="numeric"
                          value={row.length}
                          onChange={(event) => updateRawLength(group.profile, index, "length", event.target.value)}
                          placeholder="Longueur"
                          aria-label={`Longueur brute ${index + 1} pour ${group.profile}`}
                          className="pr-12"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">mm</span>
                      </div>
                      <Input inputMode="numeric" value={row.quantity} onChange={(event) => updateRawLength(group.profile, index, "quantity", event.target.value)} placeholder="Illimité" aria-label={`Quantité brute ${index + 1} pour ${group.profile} (facultative)`} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRawLength(group.profile, index)} aria-label={`Supprimer la longueur ${index + 1} de ${group.profile}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <details className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-200">Suggestions calculées depuis les pièces · {(pieceBasedSuggestions[group.profile] ?? []).length}</summary>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Longueur de pièce + marge de 100 mm, arrondie au 500 mm supérieur. Vérifiez que la matière est réellement disponible.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(pieceBasedSuggestions[group.profile] ?? []).length ? (pieceBasedSuggestions[group.profile] ?? []).map((length) => (
                      <Button key={length} type="button" variant="outline" size="sm" className="h-9 border-slate-200 bg-white hover:border-red-200 hover:bg-red-50 hover:text-nim-red dark:border-slate-700 dark:bg-slate-950 dark:hover:border-red-900 dark:hover:bg-red-950/30" onClick={() => addSuggestedRawLength(group.profile, length)}>
                        <Plus className="size-3.5" />{formatMm(length)}
                      </Button>
                    )) : <span className="text-xs text-slate-400">Toutes les suggestions calculées sont déjà dans cette liste.</span>}
                  </div>
                </details>
              </div>
            </CardContent> : null}
          </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <BarChart3 className="size-4 text-nim-red" />
          L’optimiseur compare les longueurs brutes saisies et peut les combiner dans le même plan.
        </div>
        <Button onClick={submit} disabled={optimizeMutation.isPending || !offerId || activeRequirements.length === 0}>
          {optimizeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
          {optimizeMutation.isPending ? "Optimisation en cours..." : "Optimiser la mise en barres"}
        </Button>
      </div>
      </> : null}

      {optimization && offerId ? (
        <FaconnageOptimizationResultView
          offerId={offerId}
          optimization={optimization}
          onChange={setOptimization}
          onEditConfiguration={() => setOptimization(null)}
        />
      ) : null}
    </div>
  );
}
