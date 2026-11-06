import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/status-badge";
import { RoleBadge } from "@/components/ui/role-badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { PieceProductionStatusBadge } from "@/components/ui/production-status-badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  SelectValue: () => <span>20</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("shared NIM interaction patterns", () => {
  it("keeps page titles clear and action controls grouped", () => {
    render(
      <PageHeader
        eyebrow="Atelier"
        title="Machines"
        description="Suivez la disponibilité des équipements."
        action={<button type="button">Ajouter une machine</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Machines" })).toBeInTheDocument();
    expect(screen.getByText("Atelier")).toHaveClass("uppercase");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("break-words");
    expect(screen.getByRole("heading", { level: 1 }).parentElement?.nextElementSibling).toHaveClass(
      "w-full",
      "sm:w-auto",
    );
    expect(screen.getByRole("button", { name: "Ajouter une machine" })).toBeInTheDocument();
  });

  it("keeps shared sheets and confirmation dialogs usable on narrow screens", () => {
    const { unmount } = render(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>Modifier une fiche</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("w-[min(94vw,32rem)]");
    unmount();

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Confirmer une action</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("w-[calc(100%-2rem)]");
  });

  it("uses a semantic navigation landmark and a touch-sized page-size control", () => {
    render(
      <Pagination
        page={1}
        pageCount={2}
        pageSize={20}
        total={21}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Navigation dans les pages" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nombre de lignes par page" })).toHaveClass(
      "min-h-11",
    );
  });

  it("keeps semantic status colors readable in dark mode", () => {
    render(<StatusBadge tone="active">Active</StatusBadge>);

    expect(screen.getByText("Active")).toHaveClass("dark:text-emerald-300");
  });

  it("gives all current user roles distinct, dark-mode-safe badge identities", () => {
    const roles = ["ADMIN", "PRODUCTION_MANAGER", "OPERATOR", "QUALITY_CONTROLLER"] as const;
    const expected = [
      ["Administrateur", "dark:text-red-200"],
      ["Responsable production", "dark:text-blue-200"],
      ["Opérateur", "dark:text-violet-200"],
      ["Contrôleur qualité", "dark:text-emerald-200"],
    ] as const;

    render(
      <>
        {roles.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
      </>,
    );

    expected.forEach(([label, darkTextClass]) => {
      expect(screen.getByText(label)).toHaveClass(darkTextClass);
    });
    expect(
      screen.getAllByText(/Administrateur|Responsable production|Opérateur|Contrôleur qualité/),
    ).toHaveLength(4);
  });

  it("keeps category and priority badges distinct from semantic lifecycle states", () => {
    render(
      <>
        <CategoryBadge tone="rose">Qualité</CategoryBadge>
        <PriorityBadge priority="HIGH" prefix />
        <PieceProductionStatusBadge status="AFFECTEE" />
      </>,
    );
    expect(screen.getByText("Qualité")).toHaveClass("dark:text-rose-200");
    expect(screen.getByText("Priorité haute")).toHaveClass("dark:text-red-300");
    expect(screen.getByText("Affectée")).toHaveClass("dark:text-violet-300");
  });

  it("renders accessible switches with touch-sized hit areas", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="Activer les notifications"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );

    const toggle = screen.getByRole("switch", { name: "Activer les notifications" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveClass("min-h-11");
    fireEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
