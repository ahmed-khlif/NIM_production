"use client";

import type { MachineSessionMember, OperatorIdentity, TabletMachineOption } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Clock3,
  Factory,
  LogOut,
  Play,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  endMachineSessionRequest,
  getAvailableOperatorsRequest,
  getCurrentMachineSessionRequest,
  getCurrentTabletOperatorRequest,
  getTabletMachinesRequest,
  operatorTabletLogoutRequest,
  startMachineSessionRequest,
  updateMachineSessionTeamRequest,
} from "@/features/auth/auth-client";
import { toast } from "sonner";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";
import { TabletHeader, TabletProblem, formatTabletDate } from "./tablet-ui";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Le serveur de production est indisponible.";
}

function initials(operator: Pick<OperatorIdentity, "displayName">): string {
  return operator.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function TeamMember({ member }: { member: MachineSessionMember }): React.ReactNode {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
        {initials(member)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{member.displayName}</p>
        <p className="text-xs text-slate-500">
          {member.role === "LEAD" ? "Opérateur principal" : "Assistant"}
        </p>
      </div>
    </div>
  );
}

export function OperatorTabletSessionView(): React.ReactNode {
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [machineStep, setMachineStep] = useState<"machine" | "team">("machine");
  const [machineId, setMachineId] = useState("");
  const [helperIds, setHelperIds] = useState<string[]>([]);
  const [helperSearch, setHelperSearch] = useState("");
  const [sessionEndOpen, setSessionEndOpen] = useState(false);
  const [teamEditOpen, setTeamEditOpen] = useState(false);
  const [teamDraftIds, setTeamDraftIds] = useState<string[]>([]);
  const [teamHelperSearch, setTeamHelperSearch] = useState("");
  const [queueSearch, setQueueSearch] = useState(() => getInitialListParam("search"));
  const [queueSearchDebounced, setQueueSearchDebounced] = useState("");
  const [queuePage, setQueuePage] = useState(() =>
    Math.max(1, Number(getInitialListParam("page", "1")) || 1),
  );
  const [queuePageSize, setQueuePageSize] = useState(() =>
    [10, 20, 50].includes(Number(getInitialListParam("pageSize", "20")))
      ? Number(getInitialListParam("pageSize", "20"))
      : 20,
  );
  const [selectedOfferId, setSelectedOfferId] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQueueSearchDebounced(queueSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [queueSearch]);
  useEffect(() => setQueuePage(1), [queueSearchDebounced, queuePageSize]);
  useEffect(() => {
    setQueueSearch(urlParams.get("search") ?? "");
    setQueuePage(Math.max(1, Number(urlParams.get("page")) || 1));
    const nextSize = Number(urlParams.get("pageSize"));
    if ([10, 20, 50].includes(nextSize)) setQueuePageSize(nextSize);
  }, [urlParams]);
  useEffect(() => {
    updateUrl({ search: queueSearch.trim(), page: queuePage, pageSize: queuePageSize });
  }, [queueSearch, queuePage, queuePageSize, updateUrl]);
  const operatorQuery = useQuery({
    queryKey: ["tablet", "operator"],
    queryFn: getCurrentTabletOperatorRequest,
    retry: false,
    staleTime: 30_000,
  });
  const currentQuery = useQuery({
    queryKey: [
      "tablet",
      "current",
      queuePage,
      queuePageSize,
      queueSearchDebounced,
      selectedOfferId,
    ],
    queryFn: () =>
      getCurrentMachineSessionRequest({
        page: queuePage,
        pageSize: queuePageSize,
        search: queueSearchDebounced,
        ...(selectedOfferId ? { offerId: selectedOfferId } : {}),
      }),
    enabled: Boolean(operatorQuery.data?.operator),
    retry: false,
    refetchInterval: 12000,
  });
  const machinesQuery = useQuery({
    queryKey: ["tablet", "machines"],
    queryFn: getTabletMachinesRequest,
    enabled: Boolean(
      operatorQuery.data?.operator && currentQuery.data && !currentQuery.data.session,
    ),
    retry: false,
  });
  const helpersQuery = useQuery({
    queryKey: ["tablet", "available-operators"],
    queryFn: getAvailableOperatorsRequest,
    enabled: Boolean(
      operatorQuery.data?.operator &&
      currentQuery.data &&
      (!currentQuery.data.session ||
        currentQuery.data.session.leadOperatorId === operatorQuery.data.operator.id),
    ),
    retry: false,
    refetchInterval:
      machineStep === "team" || teamEditOpen || currentQuery.data?.session ? 15_000 : false,
    staleTime: 10_000,
  });
  const startMutation = useMutation({
    mutationFn: startMachineSessionRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tablet", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["tablet", "available-operators"] });
      toast.success("Session machine démarrée");
      setMachineId("");
      setHelperIds([]);
      setHelperSearch("");
      setMachineStep("machine");
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        ["OPERATOR_SESSION_CONFLICT", "OPERATOR_UNAVAILABLE"].includes(error.code)
      ) {
        void helpersQuery.refetch().then(({ data }) => {
          const availableIds = new Set(
            data?.operators.filter((helper) => helper.isAvailable).map((helper) => helper.id) ?? [],
          );
          setHelperIds((current) => current.filter((id) => availableIds.has(id)));
        });
      }
    },
  });
  const endMutation = useMutation({
    mutationFn: endMachineSessionRequest,
    onSuccess: async () => {
      setSessionEndOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["tablet", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["tablet", "machines"] });
      await queryClient.invalidateQueries({ queryKey: ["tablet", "available-operators"] });
      toast.success("Session machine terminée");
    },
  });
  const updateTeamMutation = useMutation({
    mutationFn: (input: { sessionId: string; helperOperatorIds: string[] }) =>
      updateMachineSessionTeamRequest(input.sessionId, {
        helperOperatorIds: input.helperOperatorIds,
      }),
    onSuccess: async (result) => {
      setTeamEditOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["tablet", "current"] });
      await queryClient.invalidateQueries({ queryKey: ["tablet", "available-operators"] });
      if (result.addedCount || result.removedCount) {
        toast.success(
          `Équipe mise à jour · ${result.addedCount} ajouté(s), ${result.removedCount} retiré(s)`,
        );
      } else {
        toast.info("Aucun changement dans l’équipe");
      }
    },
  });
  const logoutMutation = useMutation({
    mutationFn: operatorTabletLogoutRequest,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["tablet"] });
      queryClient.setQueryData(["auth", "me"], null);
      router.replace("/login");
    },
  });
  useEffect(() => {
    if (operatorQuery.error instanceof ApiError && operatorQuery.error.status === 401)
      router.replace("/login");
    if (currentQuery.error instanceof ApiError && currentQuery.error.status === 401)
      router.replace("/login");
  }, [currentQuery.error, operatorQuery.error, router]);

  if (operatorQuery.isLoading || currentQuery.isLoading)
    return (
      <>
        <TabletHeader />
        <main className="mx-auto max-w-4xl p-4 sm:p-6">
          <div className="space-y-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </main>
      </>
    );
  if (
    operatorQuery.isError &&
    !(operatorQuery.error instanceof ApiError && operatorQuery.error.status === 401)
  )
    return (
      <>
        <TabletHeader />
        <main className="p-4 pt-8">
          <TabletProblem
            error={operatorQuery.error}
            onRetry={() => void operatorQuery.refetch()}
            retrying={operatorQuery.isFetching}
          />
        </main>
      </>
    );
  if (!operatorQuery.data?.operator)
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        Redirection vers la connexion opérateur…
      </div>
    );
  const operator = operatorQuery.data.operator;
  const projection = currentQuery.data;
  if (
    currentQuery.isError &&
    !(currentQuery.error instanceof ApiError && currentQuery.error.status === 401)
  )
    return (
      <>
        <TabletHeader operator={operator} />
        <main className="p-4 pt-8">
          <TabletProblem
            error={currentQuery.error}
            onRetry={() => void currentQuery.refetch()}
            retrying={currentQuery.isFetching}
          />
        </main>
      </>
    );

  if (projection?.session) {
    const { session, bars, activeRun, offers } = projection;
    const isSessionLead = session.leadOperatorId === operator.id;
    const operatorsWithUnfinishedProduction = new Set(
      projection.operatorsWithUnfinishedProduction ?? [],
    );
    const availableHelpers = (helpersQuery.data?.operators ?? []).filter(
      (helper) => helper.isAvailable,
    );
    const filteredAvailableHelpers = availableHelpers.filter((helper) =>
      helper.displayName
        .toLocaleLowerCase("fr")
        .includes(teamHelperSearch.trim().toLocaleLowerCase("fr")),
    );
    const activeHelperIds = session.team
      .filter((member) => member.role === "HELPER")
      .map((member) => member.id);
    const selectedOffer = offers.find((offer) => offer.id === selectedOfferId);
    const barsByProfile = bars.reduce<Record<string, typeof bars>>((groups, bar) => {
      (groups[bar.profile] ??= []).push(bar);
      return groups;
    }, {});
    return (
      <div className="min-h-dvh pb-10">
        <TabletHeader
          operator={operator}
          machineName={session.machineName}
          action={
            isSessionLead ? (
              <Button
                variant="ghost"
                className="min-h-11 text-slate-300 hover:text-white"
                aria-label="Terminer la session machine"
                onClick={() => setSessionEndOpen(true)}
                disabled={Boolean(activeRun)}
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Terminer la session</span>
              </Button>
            ) : (
              <span className="px-2 text-xs text-slate-400">
                Session gérée par{" "}
                {session.team.find((member) => member.id === session.leadOperatorId)?.displayName ??
                  "l’opérateur principal"}
              </span>
            )
          }
        />
        <main className="mx-auto max-w-4xl space-y-5 p-4 pt-5 sm:p-6 sm:pt-7">
          <section className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Session machine active
              </p>
              <h1 className="mt-1 text-2xl font-semibold">{session.machineName}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {session.machineInternalNumber} · démarrée à {formatTabletDate(session.startedAt)}
              </p>
            </div>
            <Button
              variant="outline"
              className="min-h-12"
              onClick={() => void currentQuery.refetch()}
              disabled={currentQuery.isFetching}
            >
              <RefreshCw className={`size-4 ${currentQuery.isFetching ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </section>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-5 text-slate-500" />
                  Équipe de la session
                  <Badge variant="secondary">{session.team.length} membre(s)</Badge>
                </CardTitle>
                {isSessionLead ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    onClick={() => {
                      setTeamDraftIds(activeHelperIds);
                      setTeamHelperSearch("");
                      updateTeamMutation.reset();
                      setTeamEditOpen((open) => !open);
                    }}
                  >
                    {teamEditOpen ? "Fermer" : "Modifier l’équipe"}
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {session.team.map((member) => {
                  const hasUnfinishedRun = operatorsWithUnfinishedProduction.has(member.id);
                  const isMarkedForRemoval =
                    member.role === "HELPER" && !teamDraftIds.includes(member.id);
                  return (
                    <div key={member.id} className="relative">
                      <TeamMember member={member} />
                      {teamEditOpen && member.role === "HELPER" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1 min-h-9 text-red-700 hover:bg-red-50 hover:text-red-800"
                          disabled={hasUnfinishedRun && !isMarkedForRemoval}
                          aria-label={`${isMarkedForRemoval ? "Garder" : "Retirer"} ${member.displayName} ${isMarkedForRemoval ? "dans" : "de"} l’équipe`}
                          title={
                            hasUnfinishedRun
                              ? "Cet opérateur doit terminer ou annuler sa barre en cours avant d’être retiré"
                              : undefined
                          }
                          onClick={() =>
                            setTeamDraftIds((ids) =>
                              ids.includes(member.id)
                                ? ids.filter((id) => id !== member.id)
                                : [...ids, member.id],
                            )
                          }
                        >
                          {isMarkedForRemoval ? "Garder" : "Retirer"}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {teamEditOpen ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <div>
                    <p className="font-semibold">Gérer les assistants</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Vous pouvez ajouter ou retirer les assistants à tout moment, sauf celui qui a
                      lancé une barre encore en cours.
                    </p>
                  </div>
                  {operatorsWithUnfinishedProduction.size ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {session.team
                        .filter((member) => operatorsWithUnfinishedProduction.has(member.id))
                        .map((member) => member.displayName)
                        .join(", ")}{" "}
                      doit terminer ou annuler sa barre en cours avant de pouvoir être retiré. Les
                      autres assistants restent modifiables.
                    </p>
                  ) : null}
                  {helpersQuery.isLoading ? (
                    <Skeleton className="h-12" />
                  ) : helpersQuery.isError ? (
                    <TabletProblem
                      error={helpersQuery.error}
                      onRetry={() => void helpersQuery.refetch()}
                      retrying={helpersQuery.isFetching}
                    />
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={teamHelperSearch}
                          onChange={(event) => setTeamHelperSearch(event.target.value)}
                          placeholder="Rechercher un opérateur disponible…"
                          aria-label="Rechercher un assistant à ajouter"
                          className="pl-9"
                        />
                      </div>
                      {filteredAvailableHelpers.length ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {filteredAvailableHelpers.map((helper) => {
                            const checked = teamDraftIds.includes(helper.id);
                            return (
                              <label
                                key={helper.id}
                                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 has-[:checked]:border-nim-red has-[:checked]:bg-red-50/50"
                              >
                                <input
                                  type="checkbox"
                                  className="size-5 accent-[#E10600]"
                                  checked={checked}
                                  onChange={() =>
                                    setTeamDraftIds((ids) =>
                                      checked
                                        ? ids.filter((id) => id !== helper.id)
                                        : ids.length < 100
                                          ? [...ids, helper.id]
                                          : ids,
                                    )
                                  }
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {helper.displayName}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {helper.isOnline
                                      ? "En ligne"
                                      : "Hors ligne · sélection possible"}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-lg bg-white px-3 py-3 text-sm text-slate-500">
                          {availableHelpers.length
                            ? "Aucun opérateur ne correspond à cette recherche."
                            : "Aucun autre opérateur disponible pour le moment."}
                        </p>
                      )}
                    </>
                  )}
                  {updateTeamMutation.isError ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                    >
                      {errorMessage(updateTeamMutation.error)}
                    </p>
                  ) : null}
                  <div className="flex flex-col-reverse justify-between gap-2 sm:flex-row sm:items-center">
                    <p className="text-xs text-slate-500" aria-live="polite">
                      {teamDraftIds.length} assistant(s) prévu(s)
                    </p>
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={updateTeamMutation.isPending || helpersQuery.isError}
                      onClick={() =>
                        updateTeamMutation.mutate({
                          sessionId: session.id,
                          helperOperatorIds: teamDraftIds,
                        })
                      }
                    >
                      {updateTeamMutation.isPending ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : null}
                      Enregistrer l’équipe
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {activeRun ? (
            <Card className="border-nim-red/30 bg-red-50/40">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 animate-pulse rounded-full bg-nim-red" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-nim-red">
                      Fabrication en cours
                    </p>
                  </div>
                  <p className="mt-1 text-xl font-semibold">{activeRun.barReference}</p>
                  <p className="text-sm text-slate-600">
                    {activeRun.profile} · {activeRun.pieceCount} pièce(s) · depuis{" "}
                    {formatTabletDate(activeRun.startedAt)}
                  </p>
                </div>
                <Button asChild className="min-h-14 text-base">
                  <Link href={`/production/tablet/runs/${activeRun.id}`}>
                    Reprendre la fabrication
                    <ArrowRight className="size-5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <section className="space-y-4">
            {!selectedOffer ? (
              <div className="nim-tablet-sticky-tools -mx-4 px-4 py-3 sm:-mx-6 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Choisissez une affaire</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Affaires avec barres en attente sur {session.machineName}.
                    </p>
                  </div>
                  <Badge variant="outline" className="min-h-8 px-3">
                    {offers.length} affaire(s)
                  </Badge>
                </div>
                {offers.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {offers.map((offer) => (
                      <button
                        key={offer.id}
                        type="button"
                        aria-pressed={offer.id === selectedOfferId}
                        onClick={() => {
                          setSelectedOfferId(offer.id);
                          setQueuePage(1);
                          setQueueSearch("");
                        }}
                        className={
                          "flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nim-red " +
                          (offer.id === selectedOfferId
                            ? "border-nim-red bg-red-50/70 ring-1 ring-nim-red/20"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{offer.reference}</span>
                          <span className="mt-0.5 block truncate text-sm text-slate-500">
                            {offer.name}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Badge variant="secondary">{offer.barCount} barre(s)</Badge>
                          <ArrowRight className="size-4" />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-5">
                    <EmptyState
                      title="Aucune affaire en attente"
                      description="Les affaires apparaîtront ici dès que des barres seront affectées à cette machine."
                    />
                  </div>
                )}
              </div>
            ) : null}
            {selectedOffer ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <Button
                      variant="ghost"
                      className="min-h-11 px-0"
                      onClick={() => {
                        setSelectedOfferId("");
                        setQueuePage(1);
                      }}
                    >
                      ← Retour aux affaires
                    </Button>
                    <h3 className="text-xl font-semibold">
                      {selectedOffer.reference} · {selectedOffer.name}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">Barres regroupées par profil</p>
                    <div className="relative mt-3 w-full sm:max-w-sm">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={queueSearch}
                        onChange={(event) => setQueueSearch(event.target.value)}
                        placeholder="Rechercher barre ou profil"
                        aria-label="Rechercher les barres de cette affaire"
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <Badge variant="outline" className="min-h-8 px-3">
                    {(projection.pagination?.total ?? selectedOffer.barCount).toLocaleString(
                      "fr-FR",
                    )}{" "}
                    barre(s)
                  </Badge>
                </div>
                {(projection.pagination?.total ?? bars.length) === 0 ? (
                  <Card>
                    <CardContent className="p-6">
                      <EmptyState
                        title="Aucune barre trouvée"
                        description="Changez la recherche ou choisissez une autre affaire."
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-5">
                    {Object.entries(barsByProfile)
                      .sort(([left], [right]) => left.localeCompare(right, "fr", { numeric: true }))
                      .map(([profile, profileBars]) => (
                        <section
                          key={profile}
                          className="space-y-2"
                          aria-label={"Profil " + profile}
                        >
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <h4 className="text-base font-semibold">Profil {profile}</h4>
                            <Badge variant="outline">{profileBars.length} barre(s)</Badge>
                          </div>
                          <div className="grid gap-2">
                            {profileBars.map((bar) => (
                              <Link
                                key={bar.id}
                                href={`/production/tablet/bars/${bar.id}`}
                                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nim-red sm:p-5"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                                      <Factory className="size-5" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-lg font-semibold">
                                        {bar.reference}
                                      </p>
                                      <p className="text-sm text-slate-500">
                                        {bar.rawLengthMm.toLocaleString("fr-FR")} mm ·{" "}
                                        {bar.items.length} pièce(s)
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <StatusBadge tone="info">Affectée</StatusBadge>
                                    <ArrowRight className="size-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-nim-red" />
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
                                  <span>
                                    {bar.items
                                      .reduce((sum, item) => sum + item.lengthMm, 0)
                                      .toLocaleString("fr-FR")}{" "}
                                    mm à couper
                                  </span>
                                  <span>
                                    {
                                      bar.items.filter(
                                        (item) => item.qualityStatus === "NON_CONFORME",
                                      ).length
                                    }{" "}
                                    alerte(s) qualité
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </section>
                      ))}
                  </div>
                )}
                {projection.pagination && projection.pagination.total > 0 ? (
                  <Pagination
                    page={projection.pagination.page}
                    pageCount={projection.pagination.totalPages}
                    pageSize={projection.pagination.pageSize}
                    total={projection.pagination.total}
                    pageSizes={[10, 20, 50]}
                    itemLabel="barre"
                    onPageChange={setQueuePage}
                    onPageSizeChange={setQueuePageSize}
                  />
                ) : null}
              </>
            ) : null}
          </section>{" "}
          {startMutation.isError ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
              {errorMessage(startMutation.error)}
            </p>
          ) : null}
        </main>
        <AlertDialog
          open={sessionEndOpen}
          onOpenChange={(open) => {
            if (!endMutation.isPending) setSessionEndOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terminer la session machine ?</AlertDialogTitle>
              <AlertDialogDescription>
                La machine et chaque membre de l’équipe redeviendront disponibles. L’historique de
                cette session sera conservé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {activeRun ? (
              <p className="text-sm font-medium text-amber-800">
                Une fabrication est encore en cours. Terminez la barre avant de fermer la session.
              </p>
            ) : null}
            {endMutation.isError ? (
              <p className="text-sm text-red-700" role="alert">
                {errorMessage(endMutation.error)}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={endMutation.isPending}>
                Continuer la session
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={Boolean(activeRun) || endMutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  endMutation.mutate(session.id);
                }}
              >
                {endMutation.isPending ? "Fermeture…" : "Terminer la session"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  const machines = machinesQuery.data?.machines ?? [];
  const helpers = (helpersQuery.data?.operators ?? []).filter((helper) => helper.isAvailable);
  const filteredHelpers = helpers.filter((helper) =>
    helper.displayName
      .toLocaleLowerCase("fr")
      .includes(helperSearch.trim().toLocaleLowerCase("fr")),
  );
  const allVisibleHelpersSelected =
    filteredHelpers.length > 0 && filteredHelpers.every((helper) => helperIds.includes(helper.id));
  const selectedMachine = machines.find((machine) => machine.id === machineId);
  const startSession = (): void => {
    if (!machineId) return;
    startMutation.mutate({ machineId, helperOperatorIds: helperIds });
  };
  const toggleHelper = (id: string): void => {
    startMutation.reset();
    setHelperIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 100
          ? [...current, id]
          : current,
    );
  };
  const toggleVisibleHelpers = (): void => {
    const visibleIds = new Set(filteredHelpers.map((helper) => helper.id));
    setHelperIds((current) => {
      if (allVisibleHelpersSelected) return current.filter((id) => !visibleIds.has(id));
      return [...new Set([...current, ...filteredHelpers.map((helper) => helper.id)])].slice(
        0,
        100,
      );
    });
  };

  return (
    <div className="min-h-dvh pb-10">
      <TabletHeader
        operator={operator}
        action={
          <Button
            variant="ghost"
            className="min-h-11 text-slate-300 hover:text-white"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="size-4" />
            Déconnexion
          </Button>
        }
      />
      <main className="mx-auto max-w-4xl space-y-5 p-4 pt-6 sm:p-6 sm:pt-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Bonjour {operator.displayName.split(" ")[0]}
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            {machineStep === "machine" ? "Choisissez votre machine" : "Composez votre équipe"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {machineStep === "machine"
              ? "Seules les machines actuellement actives peuvent démarrer une session."
              : `Machine sélectionnée : ${selectedMachine?.name ?? "—"}. Ajoutez les opérateurs qui vous assistent.`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <span
            className={`flex size-7 items-center justify-center rounded-full ${machineStep === "machine" ? "bg-nim-red text-white" : "bg-emerald-100 text-emerald-700"}`}
          >
            {machineStep === "team" ? <Check className="size-4" /> : "1"}
          </span>
          <span className={machineStep === "machine" ? "text-slate-900" : "text-slate-500"}>
            Machine
          </span>
          <span className="mx-1 h-px w-10 bg-slate-300" />
          <span
            className={`flex size-7 items-center justify-center rounded-full ${machineStep === "team" ? "bg-nim-red text-white" : "bg-slate-200 text-slate-500"}`}
          >
            2
          </span>
          <span className={machineStep === "team" ? "text-slate-900" : "text-slate-500"}>
            Équipe
          </span>
        </div>
        {machineStep === "machine" ? (
          <>
            {machinesQuery.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : machinesQuery.isError ? (
              <TabletProblem
                error={machinesQuery.error}
                onRetry={() => void machinesQuery.refetch()}
                retrying={machinesQuery.isFetching}
              />
            ) : machines.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <EmptyState
                    title="Aucune machine active"
                    description="Demandez au responsable de production de vérifier l’état des machines."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {machines.map((machine) => (
                  <MachineCard
                    key={machine.id}
                    machine={machine}
                    selected={machine.id === machineId}
                    onSelect={() => setMachineId(machine.id)}
                  />
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                className="min-h-14 min-w-48 text-base"
                onClick={() => setMachineStep("team")}
                disabled={!machineId || machinesQuery.isError}
              >
                Continuer
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              className="min-h-11 px-0"
              onClick={() => setMachineStep("machine")}
            >
              ← Changer de machine
            </Button>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-5 text-slate-500" />
                  Opérateurs assistants{" "}
                  <span className="ml-auto text-xs font-normal text-slate-500">
                    Facultatif · {helperIds.length} sélectionné(s)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {helpersQuery.isLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((item) => (
                      <Skeleton key={item} className="h-16" />
                    ))}
                  </div>
                ) : helpersQuery.isError ? (
                  <TabletProblem
                    error={helpersQuery.error}
                    onRetry={() => void helpersQuery.refetch()}
                    retrying={helpersQuery.isFetching}
                  />
                ) : helpers.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                    Aucun autre opérateur disponible. Vous pouvez démarrer seul.
                  </p>
                ) : (
                  <>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {helpers.length} opérateur(s) disponible(s) ·{" "}
                      {helpers.filter((helper) => helper.isOnline).length} en ligne. Les opérateurs
                      hors ligne restent sélectionnables.
                    </p>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={helperSearch}
                        onChange={(event) => setHelperSearch(event.target.value)}
                        placeholder="Rechercher un opérateur…"
                        aria-label="Rechercher un opérateur"
                        className="pl-9"
                      />
                    </div>
                    {filteredHelpers.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-500" aria-live="polite">
                          {filteredHelpers.length} résultat(s) · {helperIds.length} sélectionné(s)
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleVisibleHelpers}
                        >
                          {allVisibleHelpersSelected
                            ? "Désélectionner la liste"
                            : "Tout sélectionner"}
                        </Button>
                      </div>
                    ) : null}
                    {filteredHelpers.length === 0 ? (
                      <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                        Aucun opérateur ne correspond à cette recherche.
                      </p>
                    ) : null}
                    {filteredHelpers.map((helper) => (
                      <label
                        key={helper.id}
                        className="flex min-h-16 cursor-pointer items-center gap-4 rounded-lg border border-slate-200 px-4 py-3 transition hover:bg-slate-50 has-[:checked]:border-nim-red has-[:checked]:bg-red-50/50"
                      >
                        <input
                          type="checkbox"
                          className="size-5 accent-[#E10600]"
                          checked={helperIds.includes(helper.id)}
                          onChange={() => toggleHelper(helper.id)}
                        />
                        <span className="flex size-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                          {initials(helper)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{helper.displayName}</span>
                          <span
                            className={`text-xs ${helper.isOnline ? "font-medium text-emerald-700" : "text-slate-500"}`}
                          >
                            {helper.isOnline
                              ? "En ligne · tablette active"
                              : helper.lastSeenAt
                                ? `Hors ligne · vu à ${formatTabletDate(helper.lastSeenAt)} · sélection possible`
                                : "Hors ligne · sélection possible"}
                          </span>
                        </span>
                        {helperIds.includes(helper.id) ? (
                          <Check className="size-5 text-nim-red" />
                        ) : null}
                      </label>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
            {startMutation.isError ? (
              <p
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
              >
                {errorMessage(startMutation.error)}
              </p>
            ) : null}
            {logoutMutation.isError ? (
              <p
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
              >
                {errorMessage(logoutMutation.error)}
              </p>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="min-h-14"
                onClick={() => setMachineStep("machine")}
                disabled={startMutation.isPending}
              >
                Retour
              </Button>
              <Button
                className="min-h-14 text-base"
                onClick={startSession}
                disabled={!selectedMachine || startMutation.isPending || helpersQuery.isError}
              >
                {startMutation.isPending ? (
                  <RefreshCw className="size-5 animate-spin" />
                ) : (
                  <Play className="size-5" />
                )}
                Démarrer la session
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function MachineCard({
  machine,
  selected,
  onSelect,
}: {
  machine: TabletMachineOption;
  selected: boolean;
  onSelect: () => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-28 w-full items-center justify-between gap-4 rounded-xl border bg-white p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nim-red ${selected ? "border-nim-red ring-2 ring-nim-red/15" : "border-slate-200 hover:border-slate-300"}`}
    >
      <span className="flex min-w-0 items-center gap-4">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-red-50 text-nim-red" : "bg-slate-100 text-slate-600"}`}
        >
          <Factory className="size-6" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold">{machine.name}</span>
          <span className="mt-1 block text-sm text-slate-500">
            {machine.internalNumber} · {machine.type}
          </span>
          <span className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <Clock3 className="size-3.5" />
            {machine.waitingBars} barre(s) en attente
          </span>
        </span>
      </span>
      {selected ? (
        <span className="flex size-8 items-center justify-center rounded-full bg-nim-red text-white">
          <Check className="size-5" />
        </span>
      ) : null}
    </button>
  );
}
