"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Loader2,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
type RawLengthState = Record<string, string[]>;
type PlanProposal = NonNullable<FaconnageOptimizationBatchResult["proposals"]>[number];

function ProposalProfileGroup({
  profile,
  proposals,
  selectedProposalIds,
  onToggleProposal,
  onToggleGroup,
  disabled,
}: {
  profile: string;
  proposals: PlanProposal[];
  selectedProposalIds: string[];
  onToggleProposal: (proposalId: string, checked: boolean) => void;
  onToggleGroup: (proposalIds: string[], checked: boolean) => void;
  disabled: boolean;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const selectRef = useRef<HTMLInputElement>(null);
  const selectedCount = proposals.filter((proposal) => selectedProposalIds.includes(proposal.id)).length;
  const allSelected = proposals.length > 0 && selectedCount === proposals.length;
  useEffect(() => {
    if (selectRef.current) selectRef.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);

  return (
    <section className="border-b border-slate-100 last:border-b-0 dark:border-slate-800" data-testid={`proposal-profile-${profile}`}>
      <div className="flex items-center gap-3 bg-slate-50/70 px-4 py-3 dark:bg-slate-900/50">
        <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Masquer" : "Afficher"} les propositions ${profile}`} onClick={() => setExpanded((current) => !current)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left font-semibold hover:text-nim-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
          {expanded ? <ChevronDown aria-hidden="true" className="size-4 shrink-0" /> : <ChevronRight aria-hidden="true" className="size-4 shrink-0" />}
          <span className="truncate">{profile}</span>
          <Badge variant="outline">{proposals.length} barre(s)</Badge>
        </button>
        <span className="hidden text-xs text-slate-500 sm:inline">{selectedCount} sélectionnée(s)</span>
        <input ref={selectRef} type="checkbox" checked={allSelected} disabled={disabled || proposals.length === 0} aria-label={`Sélectionner toutes les barres ${profile}`} onChange={(event) => onToggleGroup(proposals.map((proposal) => proposal.id), event.target.checked)} className="size-4 shrink-0 accent-red-600" />
      </div>
      {expanded ? <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {proposals.map((proposal) => {
          const checked = selectedProposalIds.includes(proposal.id);
          return <label key={proposal.id} className={`flex cursor-pointer items-start gap-3 px-4 py-3 sm:px-5 ${disabled ? "opacity-60" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}>
            <input type="checkbox" className="mt-1 size-4 shrink-0 accent-red-600" checked={checked} disabled={disabled} aria-label={`Sélectionner ${proposal.reference}`} onChange={(event) => onToggleProposal(proposal.id, event.target.checked)} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{proposal.reference} · {formatMm(proposal.rawLengthMm)}<Badge variant="outline">À valider</Badge></span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><span>Pièces : {proposal.cuts.map((cut) => `${cut.lengthMm} × ${cut.quantity}`).join(" · ")}</span><ArrowRight aria-hidden="true" className="size-3 text-nim-red" /><span>Barre {proposal.reference} ({formatMm(proposal.rawLengthMm)})</span><span>· chute {formatMm(proposal.wasteMm)}</span></span>
            </span>
          </label>;
        })}
      </div> : null}
    </section>
  );
}

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

function CuttingBar({ bar, index }: { bar: FaconnageCuttingBarPlan; index: number }): React.ReactNode {
  const fills = ["bg-red-700", "bg-red-600", "bg-red-500", "bg-red-400"];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">Barre {index + 1}</p>
          <p className="text-xs text-slate-500">Brut : {formatMm(bar.rawLengthMm)}</p>
        </div>
        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {bar.utilizationRate.toLocaleString("fr-FR")} %
        </Badge>
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
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Alternatives calculées</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
            <tr>
              <th className="px-4 py-2.5">Plan</th>
              <th className="px-4 py-2.5 text-right">Barres</th>
              <th className="px-4 py-2.5 text-right">Matière brute</th>
              <th className="px-4 py-2.5 text-right">Chute</th>
              <th className="px-4 py-2.5 text-right">Rendement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {alternatives.map((alternative, index) => (
              <tr key={`${alternative.totalBars}-${alternative.totalWasteMm}-${index}`}>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">Alternative {index + 1}</td>
                <td className="px-4 py-3 text-right tabular-nums">{alternative.totalBars}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMm(alternative.totalRawLengthMm)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMm(alternative.totalWasteMm)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{alternative.utilizationRate.toLocaleString("fr-FR")} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfileResult({ result }: { result: FaconnageProfileOptimizationResult }): React.ReactNode {
  const [expanded, setExpanded] = useState(true);
  const detailsId = `profile-result-details-${result.profile.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
      <CardHeader className="border-b border-slate-200 p-0 dark:border-slate-800">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? "Masquer" : "Afficher"} le détail de ${result.profile}`}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-h-20 w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 dark:hover:bg-slate-900"
        >
          <span className="flex min-w-0 items-center gap-3">
            {expanded ? <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500" /> : <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-500" />}
            <span>
              <span className="block text-lg font-semibold text-slate-950 dark:text-slate-100">{result.profile}</span>
              <span className="mt-1 block text-sm text-slate-500">Plan recommandé · {result.totalBars} barre(s) · {result.utilizationRate.toLocaleString("fr-FR")} % rendement</span>
            </span>
          </span>
          <Badge className="bg-red-50 text-nim-red hover:bg-red-50 dark:bg-red-950/30 dark:text-red-300">
            <CheckCircle2 className="size-3" />
            {statusLabel(result.status)}
          </Badge>
        </button>
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

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div><p className="text-sm font-semibold">Correspondance besoins → barres recommandées</p><p className="text-xs text-slate-500">Chaque longueur demandée est reliée aux barres qui la produisent.</p></div>
          {result.requirementSummary.map((need) => {
            const matches = result.bars.flatMap((bar, index) => {
              const cut = bar.cuts.find((item) => item.lengthMm === need.lengthMm);
              return cut ? [{ index, quantity: cut.quantity }] : [];
            });
            return <div key={need.lengthMm} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] sm:items-center dark:border-slate-800 dark:bg-slate-950">
              <span><strong>{formatMm(need.lengthMm)}</strong><span className="ml-2 text-xs text-slate-500">Demandé {need.requestedQuantity} · planifié {need.producedQuantity}</span></span>
              <ArrowRight aria-hidden="true" className="hidden size-4 text-nim-red sm:block" />
              <span className="flex flex-wrap gap-1.5">{matches.length ? matches.map((match) => <Badge key={match.index} variant="outline">Barre {match.index + 1} · {match.quantity}×</Badge>) : <span className="text-xs text-amber-700">Aucune barre correspondante</span>}</span>
            </div>;
          })}
        </div>

        <div className="space-y-3">
          {result.bars.map((bar, index) => (
            <CuttingBar key={`${bar.rawLengthMm}-${index}-${barSignatureForKey(bar)}`} bar={bar} index={index} />
          ))}
        </div>

        <AlternativeTable alternatives={result.alternatives} />
      </CardContent> : null}
    </Card>
  );
}

function barSignatureForKey(bar: FaconnageCuttingBarPlan): string {
  return bar.cuts.map((cut) => `${cut.lengthMm}-${cut.quantity}`).join("_");
}

export function FaconnageOptimizationResultView({
  offerId,
  optimization,
  onChange,
}: {
  offerId: string;
  optimization: FaconnageOptimizationBatchResult;
  onChange?: (next: FaconnageOptimizationBatchResult) => void;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [proposalSearch, setProposalSearch] = useState("");
  const [proposalPage, setProposalPage] = useState(1);
  const [proposalPageSize, setProposalPageSize] = useState(20);
  const [proposalsExpanded, setProposalsExpanded] = useState(false);
  const proposals = optimization.proposals ?? [];
  const remainingProposals = proposals.filter((proposal) => proposal.status === "PROPOSED");
  const filteredProposals = remainingProposals.filter((proposal) =>
    `${proposal.reference} ${proposal.profile} ${proposal.rawLengthMm} ${proposal.cuts.map((cut) => cut.lengthMm).join(" ")}`
      .toLowerCase().includes(proposalSearch.trim().toLowerCase()),
  );
  const proposalPages = Math.max(1, Math.ceil(filteredProposals.length / proposalPageSize));
  const pageProposals = filteredProposals.slice((proposalPage - 1) * proposalPageSize, proposalPage * proposalPageSize);
  const proposalGroups = [...pageProposals.reduce((groups, proposal) => {
    const group = groups.get(proposal.profile) ?? [];
    group.push(proposal);
    groups.set(proposal.profile, group);
    return groups;
  }, new Map<string, PlanProposal[]>()).entries()].sort(([left], [right]) => left.localeCompare(right, "fr"));
  useEffect(() => {
    if (proposalPage > proposalPages) setProposalPage(proposalPages);
  }, [proposalPage, proposalPages]);
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
      setSelectedProposalIds([]);
      onChange?.(next);
      toast.success(`${response.plan.barsCreated} barre(s) validée(s). ${response.plan.remainingBarCount} restante(s).`);
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
      <div aria-label="Étapes du façonnage" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>Étape 3 sur 3</span><span>Vérifier les recommandations et valider les barres choisies</span></div>
        <div role="progressbar" aria-label="Progression du façonnage" aria-valuemin={1} aria-valuemax={3} aria-valuenow={3} className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full w-full rounded-full bg-nim-red" /></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span className="text-emerald-700 dark:text-emerald-300">✓ Profils sélectionnés</span><span className="text-emerald-700 dark:text-emerald-300">✓ Optimisation calculée</span><span className="font-semibold text-nim-red">3 · Vérification et validation</span></div>
      </div>
      {optimization.plan ? (
        <Card className="border-slate-200 shadow-panel dark:border-slate-800">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-950 dark:text-slate-100">Plan {optimization.plan.reference}</p>
                <Badge variant="outline">{optimization.plan.status === "VALIDATED" || optimization.plan.status === "APPROVED"
                  ? "Validé"
                  : optimization.plan.status === "PARTIALLY_VALIDATED"
                    ? "Partiellement validé"
                    : optimization.plan.status === "CANCELLED" ? "Annulé" : "Brouillon"}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {optimization.plan.status === "PARTIALLY_VALIDATED"
                  ? `${proposals.length - remainingProposals.length} barre(s) validée(s) · ${remainingProposals.length} restante(s).`
                  : "Choisissez les barres à matérialiser. Les autres pièces restent disponibles."}
              </p>
            </div>
            {(optimization.plan.status === "DRAFT" || optimization.plan.status === "PARTIALLY_VALIDATED") && remainingProposals.length > 0 ? (
              <Button
                type="button"
                onClick={() => optimization.plan && validateMutation.mutate({ planId: optimization.plan.id, proposalIds: selectedProposalIds })}
                disabled={validateMutation.isPending || selectedProposalIds.length === 0}
              >
                {validateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Valider les {selectedProposalIds.length} barre(s)
              </Button>
            ) : optimization.plan.status === "VALIDATED" || optimization.plan.status === "APPROVED" ? (
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-4" />
                Toutes les barres sont validées
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

      {optimization.plan && remainingProposals.length > 0 ? (
        <Card className="border-slate-200 shadow-panel dark:border-slate-800">
          <button type="button" aria-expanded={proposalsExpanded} onClick={() => setProposalsExpanded((current) => !current)} className="flex min-h-16 w-full items-center gap-3 border-b border-slate-200 px-5 py-4 text-left font-semibold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 dark:border-slate-800 dark:hover:bg-slate-900">
            {proposalsExpanded ? <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500" /> : <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-500" />}
            <span>Plan recommandé de mise en barres</span>
            <span className="text-sm font-normal text-slate-500">{proposals.length} barre(s) · {remainingProposals.length} à valider</span>
          </button>
          {proposalsExpanded ? <>
            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row dark:border-slate-800">
              <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input type="search" value={proposalSearch} onChange={(event) => { setProposalSearch(event.target.value); setProposalPage(1); }} placeholder="Filtrer par référence, profil ou longueur…" aria-label="Rechercher dans les barres proposées" className="pl-9" /></div>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedProposalIds((current) => [...new Set([...current, ...filteredProposals.map((proposal) => proposal.id)])])} disabled={filteredProposals.length === 0 || validateMutation.isPending}>Tout sélectionner ({filteredProposals.length})</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedProposalIds((current) => current.filter((id) => !filteredProposals.some((proposal) => proposal.id === id)))} disabled={!filteredProposals.some((proposal) => selectedProposalIds.includes(proposal.id))}>Désélectionner le filtre</Button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {proposalGroups.map(([profile, groupProposals]) => (
                <ProposalProfileGroup
                  key={profile}
                  profile={profile}
                  proposals={groupProposals}
                  selectedProposalIds={selectedProposalIds}
                  disabled={validateMutation.isPending}
                  onToggleProposal={(proposalId, checked) => setSelectedProposalIds((current) => checked ? [...new Set([...current, proposalId])] : current.filter((id) => id !== proposalId))}
                  onToggleGroup={(proposalIds, checked) => setSelectedProposalIds((current) => checked ? [...new Set([...current, ...proposalIds])] : current.filter((id) => !proposalIds.includes(id)))}
                />
              ))}
              {filteredProposals.length === 0 ? <p className="p-5 text-sm text-slate-500">Aucune barre proposée ne correspond à cette recherche.</p> : null}
            </div>
            {filteredProposals.length > 0 ? <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500"><span>{(proposalPage - 1) * proposalPageSize + 1}–{Math.min(proposalPage * proposalPageSize, filteredProposals.length)} sur {filteredProposals.length} barres</span><label className="flex items-center gap-2">Par page<select aria-label="Barres par page" value={proposalPageSize} onChange={(event) => { setProposalPageSize(Number(event.target.value)); setProposalPage(1); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label></div>
              <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={proposalPage <= 1} onClick={() => setProposalPage((current) => Math.max(1, current - 1))}><ChevronLeft className="size-4" />Précédent</Button><span aria-live="polite" className="min-w-16 text-center text-xs text-slate-500">{proposalPage} / {proposalPages}</span><Button type="button" variant="outline" size="sm" disabled={proposalPage >= proposalPages} onClick={() => setProposalPage((current) => Math.min(proposalPages, current + 1))}>Suivant<ChevronRight className="size-4" /></Button></div>
            </div> : null}
          </> : null}
        </Card>
      ) : null}

      {optimization.profiles.map((result) => (
        <ProfileResult key={result.profile} result={result} />
      ))}
    </div>
  );
}

export function FaconnageOptimizationPanel({ offerId, requirements }: { offerId?: string; requirements: Requirement[] }): React.ReactNode {
  const groupedRequirements = useMemo(() => {
    const grouped = new Map<string, Array<{ lengthMm: number; quantity: number }>>();
    for (const requirement of requirements) {
      const items = grouped.get(requirement.profile) ?? [];
      items.push({ lengthMm: requirement.lengthMm, quantity: requirement.quantity });
      grouped.set(requirement.profile, items);
    }
    return [...grouped.entries()].map(([profile, items]) => ({
      profile,
      requirements: items.sort((left, right) => right.lengthMm - left.lengthMm),
    }));
  }, [requirements]);

  const [rawLengths, setRawLengths] = useState<RawLengthState>(() =>
    Object.fromEntries(groupedRequirements.map((group) => [group.profile, [""]])),
  );
  const [optimization, setOptimization] = useState<FaconnageOptimizationBatchResult | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const optimizeMutation = useMutation({
    mutationFn: (input: FaconnageOptimizationRequest) => {
      if (!offerId) throw new Error("Cette optimisation doit être lancée depuis une offre.");
      return optimizeFaconnageRequest(offerId, input);
    },
    onSuccess: (response) => {
      setOptimization(response.optimization);
      setClientError(null);
    },
  });

  const updateRawLength = (profile: string, index: number, value: string): void => {
    setOptimization(null);
    setRawLengths((current) => ({
      ...current,
      [profile]: current[profile].map((item, itemIndex) => (itemIndex === index ? value.replace(/[^0-9]/g, "") : item)),
    }));
  };

  const addRawLength = (profile: string): void => {
    setOptimization(null);
    setRawLengths((current) => ({ ...current, [profile]: [...current[profile], ""] }));
  };

  const removeRawLength = (profile: string, index: number): void => {
    setOptimization(null);
    setRawLengths((current) => {
      const next = current[profile].filter((_, itemIndex) => itemIndex !== index);
      return { ...current, [profile]: next.length > 0 ? next : [""] };
    });
  };

  const reset = (): void => {
    setOptimization(null);
    setClientError(null);
    optimizeMutation.reset();
    setRawLengths(Object.fromEntries(groupedRequirements.map((group) => [group.profile, [""]])));
  };

  const submit = (): void => {
    const profiles: FaconnageOptimizationRequest["profiles"] = [];
    for (const group of groupedRequirements) {
      const values = [...new Set((rawLengths[group.profile] ?? []).map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
      if (values.length === 0) {
        setClientError(`Ajoutez au moins une longueur de matière brute pour ${group.profile}.`);
        return;
      }
      const longestPiece = Math.max(...group.requirements.map((item) => item.lengthMm));
      if (Math.max(...values) < longestPiece) {
        setClientError(`Pour ${group.profile}, aucune longueur brute ne peut contenir la pièce de ${formatMm(longestPiece)}.`);
        return;
      }
      profiles.push({
        profile: group.profile,
        requirements: group.requirements,
        rawLengths: values.map((lengthMm) => ({ lengthMm })),
      });
    }
    setClientError(null);
    optimizeMutation.mutate({ profiles });
  };

  const error = clientError ?? (optimizeMutation.isError ? mutationMessage(optimizeMutation.error) : null);

  return (
    <div className="space-y-5" data-testid="faconnage-optimization-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-nim-red">
            <Scissors className="size-4" />
            Mise en barres
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">Configurer les longueurs brutes</h2>
          <p className="mt-1 text-sm text-slate-500">Saisissez les longueurs de matière brute possibles pour chaque profil sélectionné.</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset} disabled={optimizeMutation.isPending}>
          <RotateCcw className="size-4" />
          Réinitialiser
        </Button>
      </div>

      {!offerId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          Ouvrez une offre avant de lancer une optimisation de façonnage.
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {groupedRequirements.map((group) => (
          <Card key={group.profile} className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardHeader className="border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{group.profile}</CardTitle>
                  <p className="mt-1 text-xs text-slate-500">{group.requirements.reduce((sum, item) => sum + item.quantity, 0)} pièce(s) à produire</p>
                </div>
                <Badge variant="outline">{group.requirements.length} longueur(s)</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
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
                  {(rawLengths[group.profile] ?? [""]).map((value, index) => (
                    <div key={`${group.profile}-${index}`} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          inputMode="numeric"
                          value={value}
                          onChange={(event) => updateRawLength(group.profile, index, event.target.value)}
                          placeholder="Longueur"
                          aria-label={`Longueur brute ${index + 1} pour ${group.profile}`}
                          className="pr-12"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">mm</span>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRawLength(group.profile, index)} aria-label={`Supprimer la longueur ${index + 1} de ${group.profile}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <BarChart3 className="size-4 text-nim-red" />
          L’optimiseur compare les longueurs brutes saisies et peut les combiner dans le même plan.
        </div>
        <Button onClick={submit} disabled={optimizeMutation.isPending || !offerId}>
          {optimizeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
          {optimizeMutation.isPending ? "Optimisation en cours..." : "Optimiser la mise en barres"}
        </Button>
      </div>

      {optimization && offerId ? (
        <FaconnageOptimizationResultView
          offerId={offerId}
          optimization={optimization}
          onChange={setOptimization}
        />
      ) : null}
    </div>
  );
}
