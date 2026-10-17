"use client";

import { Archive, CheckCircle2, CircleDot, Clock3, FileCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OfferStatus } from "@/features/auth/auth-client";

export const offerStatusLabels: Record<OfferStatus, string> = {
  DRAFT: "Brouillon",
  READY: "Prête",
  IN_PRODUCTION: "En production",
  COMPLETED: "Terminée",
  ARCHIVED: "Archivée",
};

export function OfferStatusBadge({ status }: { status: OfferStatus }): React.ReactNode {
  const classes: Record<OfferStatus, string> = {
    DRAFT: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
    READY: "border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
    IN_PRODUCTION: "border-red-200 bg-red-50 text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300",
    COMPLETED: "border-slate-800 bg-slate-900 text-white dark:border-slate-600 dark:bg-slate-100 dark:text-slate-950",
    ARCHIVED: "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500",
  };
  const icons: Record<OfferStatus, React.ComponentType<{ className?: string }>> = {
    DRAFT: CircleDot,
    READY: FileCheck2,
    IN_PRODUCTION: Clock3,
    COMPLETED: CheckCircle2,
    ARCHIVED: Archive,
  };
  const Icon = icons[status];
  return (
    <Badge variant="outline" className={classes[status]}>
      <Icon className="size-3" />
      {offerStatusLabels[status]}
    </Badge>
  );
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
