import { ArrowDown, ArrowDownUp, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

export type TableSortDirection = "asc" | "desc" | "none";

export function isProfileColumnLabel(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
  return /^(profil|profile)(?:\b|\/)/.test(normalized);
}

export function TableSortIndicator({
  direction = "none",
}: {
  direction?: TableSortDirection;
}): ReactNode {
  if (direction === "asc") return <ArrowUp aria-hidden="true" className="nim-table-sort-icon" />;
  if (direction === "desc") return <ArrowDown aria-hidden="true" className="nim-table-sort-icon" />;
  return <ArrowDownUp aria-hidden="true" className="nim-table-sort-icon" />;
}

export interface TableColumnHeaderProps {
  children: ReactNode;
  label?: string;
  direction?: TableSortDirection;
  onSort?: () => void;
  className?: string;
}

/** Shared accessible header for tables that opt into interactive sorting. */
export function TableColumnHeader({
  children,
  label,
  direction = "none",
  onSort,
  className,
}: TableColumnHeaderProps): ReactNode {
  const content = (
    <span className={`nim-table-heading-content${className ? ` ${className}` : ""}`}>
      <span className="truncate">{children}</span>
      <TableSortIndicator direction={direction} />
    </span>
  );

  if (!onSort) return content;

  return (
    <button
      type="button"
      className="nim-table-sort-button"
      aria-label={`Trier par ${label ?? "cette colonne"}`}
      aria-pressed={direction !== "none"}
      onClick={onSort}
    >
      {content}
    </button>
  );
}
