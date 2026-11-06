"use client";

import type { UserSettings } from "@nim/types";
import { updateSettingsSchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MonitorCog,
  RefreshCw,
  RotateCcw,
  Scale,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getSettingsRequest, updateSettingsRequest } from "@/features/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/auth-provider";
import { ReturnLink } from "@/components/navigation/return-navigation";

export function SettingsView(): React.ReactNode {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettingsRequest,
    retry: false,
  });
  const [serverSettings, setServerSettings] = useState<UserSettings | null>(null);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data?.settings) return;
    const settings = settingsQuery.data.settings;
    setServerSettings(settings);
    setDensity(settings.density);
    setNotificationsEnabled(settings.notificationsEnabled);
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: updateSettingsRequest,
    onSuccess: async ({ settings }) => {
      setServerSettings(settings);
      setDensity(settings.density);
      setNotificationsEnabled(settings.notificationsEnabled);
      setSavedAt(settings.updatedAt);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (value) => {
      setSavedAt(null);
      setError(
        value instanceof ApiError ? value.message : "Impossible d’enregistrer les paramètres.",
      );
    },
  });

  const isDirty = serverSettings
    ? density !== serverSettings.density ||
      notificationsEnabled !== serverSettings.notificationsEnabled
    : false;
  const updatePreference = (update: () => void): void => {
    update();
    setError(null);
    setSavedAt(null);
  };
  const resetPreferences = (): void => {
    if (!serverSettings) return;
    setDensity(serverSettings.density);
    setNotificationsEnabled(serverSettings.notificationsEnabled);
    setError(null);
    setSavedAt(null);
  };
  const save = (): void => {
    const parsed = updateSettingsSchema.safeParse({ density, notificationsEnabled });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Paramètres invalides.");
      return;
    }
    mutation.mutate(parsed.data);
  };

  if (settingsQuery.isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (settingsQuery.isError)
    return (
      <div
        className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/40 p-8 text-center"
        role="alert"
      >
        <p className="font-semibold text-red-800">Impossible de charger les paramètres</p>
        <p className="mt-1 text-sm text-red-700">
          {settingsQuery.error instanceof ApiError
            ? settingsQuery.error.message
            : "Vérifiez la connexion à l’API."}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => void settingsQuery.refetch()}
          disabled={settingsQuery.isFetching}
        >
          <RefreshCw className={`size-4 ${settingsQuery.isFetching ? "animate-spin" : ""}`} />
          Réessayer
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReturnLink
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-nim-red"
        >
          <ArrowLeft className="size-4" />
          Retour au tableau de bord
        </ReturnLink>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void settingsQuery.refetch()}
          disabled={settingsQuery.isFetching || mutation.isPending}
        >
          <RefreshCw className={`size-4 ${settingsQuery.isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>
      <PageHeader
        eyebrow="Mon espace"
        title="Paramètres"
        description="Préférences enregistrées pour votre compte NIM."
      />
      {user?.role === "ADMIN" ? (
        <section aria-labelledby="material-catalogue-heading" className="space-y-3">
          <div>
            <h2 id="material-catalogue-heading" className="text-sm font-semibold text-slate-900">
              Référentiel matière
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Données utilisées pour les pièces et le façonnage.
            </p>
          </div>
          <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-800">
            <CardContent className="flex flex-col gap-4 bg-gradient-to-r from-slate-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between dark:from-slate-900 dark:to-card">
              <div className="flex min-w-0 items-start gap-4">
                <div className="rounded-xl bg-red-50 p-3 text-nim-red dark:bg-red-950/40">
                  <Scale aria-hidden="true" className="size-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-950 dark:text-slate-100">
                    Catalogue des profils matière
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    Gérez les désignations, références, poids linéiques et longueurs brutes
                    disponibles. Ces données alimentent le calcul du poids des pièces et les
                    suggestions de façonnage.
                  </p>
                </div>
              </div>
              <Button asChild className="w-full shrink-0 sm:w-auto">
                <Link href="/settings/profiles">
                  Ouvrir le catalogue <ChevronRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Préférences d’affichage et d’activité</CardTitle>
          <p className="text-xs text-slate-500">
            Ces préférences sont personnelles et ne modifient pas les règles de production.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-4">
            <MonitorCog className="mt-0.5 size-5 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">Densité de l’interface</p>
              <p className="mt-1 text-sm text-slate-500">
                Choisissez l’espace entre les lignes des tableaux de données.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={density === "comfortable" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePreference(() => setDensity("comfortable"))}
                >
                  {density === "comfortable" ? <Check className="size-4" /> : null}Confortable
                </Button>
                <Button
                  type="button"
                  variant={density === "compact" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePreference(() => setDensity("compact"))}
                >
                  {density === "compact" ? <Check className="size-4" /> : null}Compacte
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-4">
            <Bell className="size-5 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">Badge des notifications non lues</p>
              <p className="mt-1 text-sm text-slate-500">
                Afficher ou masquer le compteur dans l’en-tête. Les notifications restent
                enregistrées dans votre boîte.
              </p>
            </div>
            <Switch
              aria-label="Afficher le badge de notifications"
              checked={notificationsEnabled}
              onCheckedChange={(checked) =>
                updatePreference(() => setNotificationsEnabled(checked))
              }
            />
          </div>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          {savedAt ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700" role="status">
              <CheckCircle2 className="size-4" />
              Préférences enregistrées.
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={resetPreferences}
              disabled={!isDirty || mutation.isPending}
            >
              <RotateCcw className="size-4" />
              Annuler les modifications
            </Button>
            <Button onClick={save} disabled={!isDirty || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
