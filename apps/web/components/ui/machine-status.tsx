import { StatusBadge } from "./status-badge";

export function MachineStatus({ status }: { status: "ACTIVE" | "MAINTENANCE" | "INACTIVE" }): React.ReactNode {
  const labels = { ACTIVE: "Active", MAINTENANCE: "Maintenance", INACTIVE: "Inactive" } as const;
  const tones = { ACTIVE: "active", MAINTENANCE: "warning", INACTIVE: "neutral" } as const;
  return <StatusBadge tone={tones[status]}>{labels[status]}</StatusBadge>;
}
