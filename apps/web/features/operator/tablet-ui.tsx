"use client";

import { AlertTriangle, ArrowLeft, Bell, Check, WifiOff } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { NimLogo } from "@/components/brand/nim-logo";
import { ReturnLink } from "@/components/navigation/return-navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  getTabletNotificationsRequest,
  markTabletNotificationReadRequest,
  operatorTabletHeartbeatRequest,
} from "@/features/auth/auth-client";
import type { OperatorIdentity } from "@nim/types";

export function TabletHeader({
  operator,
  machineName,
  action,
}: {
  operator?: OperatorIdentity | null;
  machineName?: string;
  action?: React.ReactNode;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const seenNotificationIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!operator?.id) return;
    const sendHeartbeat = (): void => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void operatorTabletHeartbeatRequest().catch(() => undefined);
    };
    const handleVisibility = (): void => sendHeartbeat();
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 15_000);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", sendHeartbeat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", sendHeartbeat);
    };
  }, [operator?.id]);
  const notificationsQuery = useQuery({
    queryKey: ["tablet", "notifications"],
    queryFn: getTabletNotificationsRequest,
    enabled: Boolean(operator),
    refetchInterval: 10_000,
    staleTime: 10_000,
    retry: 1,
  });
  const markReadMutation = useMutation({
    mutationFn: markTabletNotificationReadRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tablet", "notifications"] }),
  });
  const notifications = notificationsQuery.data?.notifications ?? [];
  useEffect(() => {
    if (!notificationsQuery.data) return;
    if (seenNotificationIds.current === null) {
      seenNotificationIds.current = new Set(notifications.map((notification) => notification.id));
      return;
    }
    const seen = seenNotificationIds.current;
    const invitations = notifications.filter(
      (notification) =>
        !seen.has(notification.id) &&
        ["MACHINE_SESSION_STARTED", "MACHINE_SESSION_TEAM_UPDATED"].includes(
          notification.eventType,
        ),
    );
    notifications.forEach((notification) => seen.add(notification.id));
    const latestInvitation = invitations[0];
    if (latestInvitation) {
      toast.success(latestInvitation.title, { description: latestInvitation.message });
    }
  }, [notifications, notificationsQuery.data]);
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#111] text-white shadow-sm">
      <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/production/tablet" aria-label="Accueil production tablette">
            <NimLogo compact invert />
          </Link>
          <span className="hidden h-8 w-px bg-white/15 sm:block" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              NIM Production
            </p>
            <p className="truncate text-sm font-semibold">
              {machineName ?? (operator ? operator.displayName : "Espace tablette")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {operator ? (
            <details className="group relative">
              <summary
                className="relative flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-white/15 text-slate-200 transition hover:bg-white/10 [&::-webkit-details-marker]:hidden"
                aria-label={`Notifications${notificationsQuery.data?.unreadCount ? `, ${notificationsQuery.data.unreadCount} non lues` : ""}`}
              >
                <Bell className="size-5" />
                {notificationsQuery.data?.unreadCount ? (
                  <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-nim-red px-1 text-[10px] font-bold leading-5 text-white">
                    {notificationsQuery.data.unreadCount > 9
                      ? "9+"
                      : notificationsQuery.data.unreadCount}
                  </span>
                ) : null}
              </summary>
              <div className="absolute right-0 top-13 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-semibold">Notifications atelier</p>
                    <p className="text-xs text-slate-500">
                      {notificationsQuery.data?.unreadCount ?? 0} non lue(s)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void notificationsQuery.refetch()}
                    className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Actualiser
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notificationsQuery.isLoading ? (
                    <p className="p-4 text-sm text-slate-500">Chargement des notifications…</p>
                  ) : null}
                  {notificationsQuery.isError ? (
                    <div className="p-4 text-sm text-red-700" role="alert">
                      Notifications indisponibles.{" "}
                      <button
                        type="button"
                        onClick={() => void notificationsQuery.refetch()}
                        className="font-semibold underline"
                      >
                        Réessayer
                      </button>
                    </div>
                  ) : null}
                  {!notificationsQuery.isLoading &&
                  !notificationsQuery.isError &&
                  notifications.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">
                      Aucune notification pour le moment.
                    </p>
                  ) : null}
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800 ${notification.readAt ? "" : "bg-red-50/60 dark:bg-red-950/20"}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-1 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-slate-300" : "bg-nim-red"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{notification.title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {notification.actorName ? `${notification.actorName} · ` : ""}
                            {new Intl.DateTimeFormat("fr-FR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            }).format(new Date(notification.createdAt))}
                          </p>
                        </div>
                        {!notification.readAt ? (
                          <button
                            type="button"
                            aria-label="Marquer comme lue"
                            title="Marquer comme lue"
                            disabled={markReadMutation.isPending}
                            onClick={() => markReadMutation.mutate(notification.id)}
                            className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-emerald-700 disabled:opacity-50 dark:hover:bg-slate-800"
                          >
                            <Check className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {markReadMutation.isError ? (
                  <p
                    className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
                    role="alert"
                  >
                    Impossible d’actualiser cette notification. Vérifiez le réseau et réessayez.
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
          {action}
        </div>
      </div>
    </header>
  );
}

export function TabletLoading({
  label = "Chargement de votre espace de production…",
}: {
  label?: string;
}): React.ReactNode {
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 pt-8 sm:p-6">
      <div className="flex items-center gap-3" role="status">
        <div className="size-5 animate-spin rounded-full border-2 border-nim-red border-r-transparent" />
        <p className="text-sm text-slate-600">{label}</p>
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </main>
  );
}

export function TabletProblem({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}): React.ReactNode {
  const offline = error instanceof ApiError && (error.code === "OFFLINE" || error.status === 0);
  const message =
    error instanceof ApiError
      ? error.message
      : "Le service de production ne répond pas. Vérifiez le réseau.";
  return (
    <div
      className="mx-auto flex min-h-56 max-w-lg flex-col items-center justify-center rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm"
      role="alert"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        {offline ? <WifiOff className="size-6" /> : <AlertTriangle className="size-6" />}
      </div>
      <h2 className="mt-4 text-lg font-semibold">Action non confirmée</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      <Button className="mt-5 min-h-12" variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying ? "Actualisation…" : "Réessayer"}
      </Button>
    </div>
  );
}

export function TabletBackButton({
  href,
  children = "Retour",
}: {
  href: string;
  children?: React.ReactNode;
}): React.ReactNode {
  return (
    <Button asChild variant="ghost" className="min-h-12 px-2 text-slate-600">
      <ReturnLink href={href}>
        <ArrowLeft className="size-5" />
        {children}
      </ReturnLink>
    </Button>
  );
}

export function formatTabletDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

export function elapsedTimeLabel(startedAt: string, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}
