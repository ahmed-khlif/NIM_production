import type { PiecePriority } from "@nim/types";
import { StatusBadge } from "@/components/ui/status-badge";

const priorities: Record<PiecePriority, { label: string; tone: "danger" | "info" | "neutral" }> = {
  HIGH: { label: "Haute", tone: "danger" },
  NORMAL: { label: "Normale", tone: "info" },
  LOW: { label: "Basse", tone: "neutral" },
};

export function PriorityBadge({ priority, prefix = false, className }: { priority: PiecePriority; prefix?: boolean; className?: string }): React.ReactNode {
  const item = priorities[priority];
  return <StatusBadge tone={item.tone} className={className}>{prefix ? `Priorité ${item.label.toLocaleLowerCase("fr")}` : item.label}</StatusBadge>;
}
