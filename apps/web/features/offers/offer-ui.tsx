"use client";

import { Archive, CheckCircle2, CircleDot, Clock3, FileCheck2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OfferStatus } from "@/features/auth/auth-client";

export const offerStatusLabels: Record<OfferStatus, string> = {
  DRAFT: "Brouillon",
  READY: "Prête",
  IN_PRODUCTION: "En production",
  COMPLETED: "Terminée",
  ARCHIVED: "Archivée",
};

export function OfferStatusBadge({ status }: { status: OfferStatus }): React.ReactNode {
  const tones: Record<OfferStatus, "neutral" | "info" | "warning" | "active"> = {
    DRAFT: "neutral",
    READY: "info",
    IN_PRODUCTION: "warning",
    COMPLETED: "active",
    ARCHIVED: "neutral",
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
    <StatusBadge tone={tones[status]}>
      <Icon className="size-3" />
      {offerStatusLabels[status]}
    </StatusBadge>
  );
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
