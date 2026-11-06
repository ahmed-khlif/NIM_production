import type { UserRole } from "@nim/types";
import { BadgeCheck, Factory, ShieldCheck, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrateur",
  PRODUCTION_MANAGER: "Responsable production",
  OPERATOR: "Opérateur",
  QUALITY_CONTROLLER: "Contrôleur qualité",
};

const rolePresentation: Record<
  UserRole,
  { label: string; classes: string; icon: typeof ShieldCheck }
> = {
  ADMIN: {
    label: roleLabels.ADMIN,
    classes: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200",
    icon: ShieldCheck,
  },
  PRODUCTION_MANAGER: {
    label: roleLabels.PRODUCTION_MANAGER,
    classes: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
    icon: Factory,
  },
  OPERATOR: {
    label: roleLabels.OPERATOR,
    classes: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200",
    icon: Wrench,
  },
  QUALITY_CONTROLLER: {
    label: roleLabels.QUALITY_CONTROLLER,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
    icon: BadgeCheck,
  },
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }): React.ReactNode {
  const presentation = rolePresentation[role];
  const Icon = presentation.icon;

  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        presentation.classes,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}
