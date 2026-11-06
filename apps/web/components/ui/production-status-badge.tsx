import type { PieceProductionStatus } from "@nim/types";
import { StatusBadge } from "@/components/ui/status-badge";

const labels: Record<PieceProductionStatus, string> = {
  PENDING: "En attente",
  FACONNEE: "Façonnée",
  AFFECTEE: "Affectée",
  LANCEE: "En cours",
  FABRIQUEE: "Fabriquée",
};

export const pieceProductionTones: Record<PieceProductionStatus, "active" | "info" | "violet" | "warning" | "neutral"> = {
  PENDING: "neutral",
  FACONNEE: "info",
  AFFECTEE: "violet",
  LANCEE: "warning",
  FABRIQUEE: "active",
};

export function PieceProductionStatusBadge({
  status,
  children,
  className,
}: {
  status: PieceProductionStatus;
  children?: React.ReactNode;
  className?: string;
}): React.ReactNode {
  return <StatusBadge tone={pieceProductionTones[status]} className={className}>{children ?? labels[status]}</StatusBadge>;
}
