import type { UserRole } from "@nim/types";
import {
  ArrowRightLeft,
  Box,
  CalendarClock,
  Factory,
  History,
  LayoutDashboard,
  Scissors,
  ShieldCheck,
} from "lucide-react";

export const offerWorkspaceNavigation = [
  { key: "overview", label: "Vue générale", icon: LayoutDashboard, suffix: "", roles: undefined },
  { key: "pieces", label: "Pièces", icon: Box, suffix: "/pieces", roles: undefined },
  { key: "faconnage", label: "Façonnage", icon: Scissors, suffix: "/faconnage", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { key: "bars", label: "Barres", icon: Box, suffix: "/bars", roles: undefined },
  { key: "bar-assignments", label: "Affectations", icon: ArrowRightLeft, suffix: "/bar-assignments", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { key: "planning", label: "Planning", icon: CalendarClock, suffix: "/planning", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { key: "production", label: "Production", icon: Factory, suffix: "/production", roles: undefined },
  { key: "quality", label: "Qualité", icon: ShieldCheck, suffix: "/quality", roles: ["ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER"] },
  { key: "history", label: "Historique", icon: History, suffix: "/history", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
] as const;

export function visibleOfferWorkspaceNavigation(role?: UserRole) {
  return offerWorkspaceNavigation.filter(
    (item) => !item.roles || (role && (item.roles as readonly UserRole[]).includes(role)),
  );
}
