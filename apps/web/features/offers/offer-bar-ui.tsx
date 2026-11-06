import type { CuttingBarStatus } from "@nim/types";
import { StatusBadge } from "@/components/ui/status-badge";

export const cuttingBarStatusLabels: Record<CuttingBarStatus, string> = {
  FACONNEE: "Façonnée",
  AFFECTEE: "Affectée",
  LANCEE: "Lancée",
  FABRIQUEE: "Fabriquée",
  NON_CONFORME: "Non conforme",
  CANCELLED: "Annulée",
};

const statusTones: Record<CuttingBarStatus, "active" | "info" | "violet" | "warning" | "danger" | "neutral"> =
  {
    FACONNEE: "info",
    AFFECTEE: "violet",
    LANCEE: "warning",
    FABRIQUEE: "active",
    NON_CONFORME: "danger",
    CANCELLED: "neutral",
  };

export function CuttingBarStatusBadge({ status }: { status: CuttingBarStatus }): React.ReactNode {
  return <StatusBadge tone={statusTones[status]}>{cuttingBarStatusLabels[status]}</StatusBadge>;
}

const pieceStatusLabels: Record<string, string> = {
  PLANNED: "En attente",
  ASSIGNED: "Affectée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  DELAYED: "En retard",
};

export function PieceProgressStatusBadge({ status }: { status: string }): React.ReactNode {
  const tone = status === "ASSIGNED" ? "info"
    : status === "IN_PROGRESS" ? "warning"
      : status === "COMPLETED" ? "active"
        : status === "DELAYED" ? "danger" : "neutral";
  return <StatusBadge tone={tone}>{pieceStatusLabels[status] ?? status}</StatusBadge>;
}
