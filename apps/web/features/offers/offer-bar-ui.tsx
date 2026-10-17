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

const statusTones: Record<CuttingBarStatus, "active" | "info" | "warning" | "danger" | "neutral"> =
  {
    FACONNEE: "info",
    AFFECTEE: "warning",
    LANCEE: "warning",
    FABRIQUEE: "active",
    NON_CONFORME: "danger",
    CANCELLED: "neutral",
  };

export function CuttingBarStatusBadge({ status }: { status: CuttingBarStatus }): React.ReactNode {
  return <StatusBadge tone={statusTones[status]}>{cuttingBarStatusLabels[status]}</StatusBadge>;
}
