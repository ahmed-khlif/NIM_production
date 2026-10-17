"use client";

import { AlertTriangle, ArrowLeft, WifiOff } from "lucide-react";
import Link from "next/link";
import { NimLogo } from "@/components/brand/nim-logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/features/auth/auth-client";
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
              {machineName ??
                (operator ? operator.displayName : "Espace tablette")}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
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
      <Link href={href}>
        <ArrowLeft className="size-5" />
        {children}
      </Link>
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
