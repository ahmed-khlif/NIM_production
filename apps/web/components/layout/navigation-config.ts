import type { UserRole } from "@nim/types";
import {
  Activity,
  BriefcaseBusiness,
  CalendarRange,
  ContactRound,
  Factory,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  TabletSmartphone,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[];
  section: "main" | "admin";
};

export const navigationItems: NavigationItem[] = [
  {
    label: "Tableau de bord",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
    section: "main",
  },
  {
    label: "Affaires",
    href: "/offers",
    icon: BriefcaseBusiness,
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
    section: "main",
  },
  {
    label: "Clients",
    href: "/clients",
    icon: ContactRound,
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
    section: "main",
  },
  {
    label: "Planning",
    href: "/planning",
    icon: CalendarRange,
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
    section: "main",
  },
  {
    label: "Machines",
    href: "/machines",
    icon: Factory,
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
    section: "main",
  },
  {
    label: "Production",
    href: "/production",
    icon: Activity,
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
    section: "main",
  },
  {
    label: "Qualité",
    href: "/quality",
    icon: ShieldCheck,
    roles: ["ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER"],
    section: "main",
  },
  {
    label: "Historique",
    href: "/history",
    icon: History,
    roles: ["ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER"],
    section: "main",
  },
  {
    label: "Mode production",
    href: "/production/tablet",
    icon: TabletSmartphone,
    roles: ["OPERATOR"],
    section: "main",
  },
  {
    label: "Utilisateurs",
    href: "/users",
    icon: Users,
    roles: ["ADMIN"],
    section: "admin",
  },
  {
    label: "Opérateurs",
    href: "/users?role=OPERATOR",
    icon: Users,
    roles: ["PRODUCTION_MANAGER"],
    section: "admin",
  },
  {
    label: "Paramètres",
    href: "/settings",
    icon: Settings,
    roles: ["ADMIN", "PRODUCTION_MANAGER", "OPERATOR", "QUALITY_CONTROLLER"],
    section: "admin",
  },
];

export function visibleNavigationItems(role?: UserRole): NavigationItem[] {
  return navigationItems.filter((item) => !item.roles || (role ? item.roles.includes(role) : false));
}
