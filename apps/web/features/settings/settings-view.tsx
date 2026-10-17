"use client";

import type { UserSettings } from "@nim/types";
import { updateSettingsSchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Check, CheckCircle2, Loader2, MonitorCog, RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, getSettingsRequest, updateSettingsRequest } from "@/features/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export function SettingsView(): React.ReactNode {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettingsRequest, retry: false });
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
      setError(value instanceof ApiError ? value.message : "Impossible d’enregistrer les paramètres.");
    },
  });

  const isDirty = serverSettings ? density !== serverSettings.density || notificationsEnabled !== serverSettings.notificationsEnabled : false;
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

  if (settingsQuery.isLoading) return <div className="space-y-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-72 w-full" /></div>;
  if (settingsQuery.isError) return <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/40 p-8 text-center" role="alert"><p className="font-semibold text-red-800">Impossible de charger les paramètres</p><p className="mt-1 text-sm text-red-700">{settingsQuery.error instanceof ApiError ? settingsQuery.error.message : "Vérifiez la connexion à l’API."}</p><Button variant="outline" className="mt-4" onClick={() => void settingsQuery.refetch()} disabled={settingsQuery.isFetching}><RefreshCw className={`size-4 ${settingsQuery.isFetching ? "animate-spin" : ""}`} />Réessayer</Button></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-nim-red"><ArrowLeft className="size-4" />Retour au tableau de bord</Link>
        <Button variant="outline" size="sm" onClick={() => void settingsQuery.refetch()} disabled={settingsQuery.isFetching || mutation.isPending}><RefreshCw className={`size-4 ${settingsQuery.isFetching ? "animate-spin" : ""}`} />Actualiser</Button>
      </div>
      <PageHeader eyebrow="Mon espace" title="Paramètres" description="Préférences enregistrées pour votre compte NIM." />
      <Card>
        <CardHeader><CardTitle className="text-sm">Préférences d’affichage et d’activité</CardTitle><p className="text-xs text-slate-500">Ces préférences sont personnelles et ne modifient pas les règles de production.</p></CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3 rounded-lg border border-slate-100 p-4"><MonitorCog className="mt-0.5 size-5 text-slate-500" /><div className="min-w-0 flex-1"><p className="font-medium text-slate-900">Densité de l’interface</p><p className="mt-1 text-sm text-slate-500">Choisissez l’espace entre les lignes des tableaux de données.</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant={density === "comfortable" ? "default" : "outline"} size="sm" onClick={() => updatePreference(() => setDensity("comfortable"))}>{density === "comfortable" ? <Check className="size-4" /> : null}Confortable</Button><Button type="button" variant={density === "compact" ? "default" : "outline"} size="sm" onClick={() => updatePreference(() => setDensity("compact"))}>{density === "compact" ? <Check className="size-4" /> : null}Compacte</Button></div></div></div>
          <label htmlFor="notifications-enabled" className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 p-4"><Bell className="mt-0.5 size-5 text-slate-500" /><span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">Indicateur d’activité</span><span className="mt-1 block text-sm text-slate-500">Afficher un indicateur discret dans l’en-tête lorsqu’une activité récente est disponible.</span></span><input id="notifications-enabled" type="checkbox" className="mt-1 size-4 accent-red-600" checked={notificationsEnabled} onChange={(event) => updatePreference(() => setNotificationsEnabled(event.target.checked))} /></label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
          {savedAt ? <p className="flex items-center gap-2 text-sm text-emerald-700" role="status"><CheckCircle2 className="size-4" />Préférences enregistrées.</p> : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={resetPreferences} disabled={!isDirty || mutation.isPending}><RotateCcw className="size-4" />Annuler les modifications</Button><Button onClick={save} disabled={!isDirty || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Enregistrer</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
