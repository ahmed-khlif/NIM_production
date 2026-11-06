import * as React from "react";

import { cn } from "@/lib/utils";
import {
  isProfileColumnLabel,
  TableColumnHeader,
  type TableSortDirection,
} from "@/components/ui/table-sort";

type SortState = { index: number; direction: "asc" | "desc" } | null;

function flattenElements(children: React.ReactNode): React.ReactElement[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child)) return [];
    if (child.type === React.Fragment) {
      return flattenElements((child.props as { children?: React.ReactNode }).children);
    }
    return [child];
  });
}

function textFromNode(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(textFromNode).join(" ");
  if (!React.isValidElement(node)) return "";
  const props = node.props as Record<string, unknown>;
  if (props["aria-hidden"] === true || props["aria-hidden"] === "true") return "";
  const explicitValue =
    props["data-sort-value"] ?? props["aria-valuenow"] ?? props.dateTime ?? props.value;
  if (typeof explicitValue === "string" || typeof explicitValue === "number") {
    return String(explicitValue);
  }
  const childText = textFromNode(props.children as React.ReactNode);
  if (childText) return childText;
  return typeof props["aria-label"] === "string"
    ? props["aria-label"]
    : typeof props.title === "string"
      ? props.title
      : "";
}

function sortableValue(text: string): { kind: "number" | "date" | "text"; value: number | string } {
  const normalized = text.trim().replace(/\s+/g, " ");
  const europeanDate = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (europeanDate) {
    const year = Number(europeanDate[3]) + (europeanDate[3].length === 2 ? 2000 : 0);
    return {
      kind: "date",
      value: new Date(year, Number(europeanDate[2]) - 1, Number(europeanDate[1])).getTime(),
    };
  }
  const frenchDate = normalized.match(
    /^(\d{1,2})\s+(janv?\.?|f\u00e9vr?\.?|mars|avr?\.?|mai|juin|juil?\.?|ao\u00fbt|sept?\.?|oct?\.?|nov?\.?|d\u00e9c?\.?)\s+(\d{4})/i,
  );
  if (frenchDate) {
    const month = frenchDate[2].toLocaleLowerCase("fr-FR").replace(/\.$/, "");
    const monthIndex = [
      "jan",
      "f\u00e9v",
      "mar",
      "avr",
      "mai",
      "jun",
      "jui",
      "ao\u00fb",
      "sep",
      "oct",
      "nov",
      "d\u00e9c",
    ].findIndex((candidate) => month.startsWith(candidate));
    if (monthIndex >= 0)
      return {
        kind: "date",
        value: new Date(Number(frenchDate[3]), monthIndex, Number(frenchDate[1])).getTime(),
      };
  }
  const compact = normalized.replace(/[\s\u00a0\u202f]/g, "");
  const numericPrefix = compact.match(/^[+-]?(?:\d+(?:[,.]\d+)?|[,.]\d+)/)?.[0];
  if (numericPrefix) {
    const parsed = Number(numericPrefix.replace(",", "."));
    if (Number.isFinite(parsed)) return { kind: "number", value: parsed };
  }
  return { kind: "text", value: normalized.toLocaleLowerCase("fr-FR") };
}

function compareCellValues(left: string, right: string): number {
  if (!left) return right ? 1 : 0;
  if (!right) return -1;
  const a = sortableValue(left);
  const b = sortableValue(right);
  if (a.kind === b.kind && a.kind !== "text") return Number(a.value) - Number(b.value);
  return new Intl.Collator("fr", { numeric: true, sensitivity: "base" }).compare(left, right);
}

function hasInput(node: React.ReactNode): boolean {
  if (Array.isArray(node)) return node.some(hasInput);
  if (!React.isValidElement(node)) return false;
  if (
    node.type === "input" ||
    node.type === "select" ||
    node.type === "button" ||
    node.type === "a"
  )
    return true;
  return hasInput((node.props as { children?: React.ReactNode }).children);
}

function getCellText(row: React.ReactElement, index: number): string {
  const cells = flattenElements((row.props as { children?: React.ReactNode }).children);
  const cell = cells[index];
  if (!cell) return "";
  const props = cell.props as Record<string, unknown>;
  return textFromNode(props.children as React.ReactNode)
    .replace(/\s+/g, " ")
    .trim();
}

function sortBody(body: React.ReactElement, sorting: SortState): React.ReactElement {
  if (!sorting) return body;
  const props = body.props as { children?: React.ReactNode };
  const rows = flattenElements(props.children);
  const sortedRows = rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const leftValue = getCellText(left.row, sorting.index);
      const rightValue = getCellText(right.row, sorting.index);
      if (!leftValue || !rightValue) {
        if (!leftValue && !rightValue) return left.originalIndex - right.originalIndex;
        return leftValue ? -1 : 1;
      }
      const result = compareCellValues(leftValue, rightValue);
      return result === 0
        ? left.originalIndex - right.originalIndex
        : sorting.direction === "asc"
          ? result
          : -result;
    })
    .map(({ row }) => row);
  return React.cloneElement(body, undefined, sortedRows);
}

function sortHead(
  head: React.ReactElement,
  sorting: SortState,
  onSort: (index: number, label: string) => void,
  serverSorting?: { column: string; direction: "asc" | "desc" },
  onServerSort?: (column: string, direction: "asc" | "desc") => void,
): React.ReactElement {
  const headerRows = flattenElements((head.props as { children?: React.ReactNode }).children);
  if (!headerRows.length) return head;
  const firstRow = headerRows[0];
  const cells = flattenElements((firstRow.props as { children?: React.ReactNode }).children);
  let columnIndex = 0;
  const sortableCells = cells.map((cell) => {
    const headerCell = cell as React.ReactElement<
      React.ThHTMLAttributes<HTMLTableCellElement> & {
        "data-sortable"?: string;
        "data-sort-direction"?: string;
      }
    >;
    const props = cell.props as Record<string, unknown>;
    const index = columnIndex;
    columnIndex += typeof props.colSpan === "number" ? props.colSpan : 1;
    const label = textFromNode(props.children as React.ReactNode)
      .replace(/\s+/g, " ")
      .trim();
    const excluded =
      props["data-sortable"] === "false" ||
      props.colSpan !== undefined ||
      !label ||
      /^(actions?|action)$/i.test(label) ||
      hasInput(props.children as React.ReactNode);
    if (excluded) return React.cloneElement(headerCell, { "data-sortable": "false" });
    const direction: TableSortDirection = onServerSort
      ? serverSorting?.column === label
        ? serverSorting.direction
        : "none"
      : sorting?.index !== index
        ? "none"
        : sorting.direction;
    return React.cloneElement(
      headerCell,
      {
        scope: "col",
        "aria-sort":
          direction === "none" ? "none" : direction === "asc" ? "ascending" : "descending",
        "data-sort-direction": direction === "none" ? undefined : direction,
      },
      <TableColumnHeader
        label={label}
        direction={direction}
        onSort={() => {
          if (onServerSort) onServerSort(label, direction === "asc" ? "desc" : "asc");
          else onSort(index, label);
        }}
      >
        {props.children as React.ReactNode}
      </TableColumnHeader>,
    );
  });
  const sortedHeaderRow = React.cloneElement(firstRow, undefined, sortableCells);
  const nextHeaderRows = [sortedHeaderRow, ...headerRows.slice(1)];
  return React.cloneElement(head, undefined, nextHeaderRows);
}

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  sortable?: boolean;
  defaultSortByProfile?: boolean;
  "data-sort-key"?: string;
  serverSorting?: { column: string; direction: "asc" | "desc" };
  onServerSort?: (column: string, direction: "asc" | "desc") => void;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className,
      children,
      sortable = true,
      defaultSortByProfile = true,
      serverSorting,
      onServerSort,
      ...props
    },
    ref,
  ) => {
    const header = React.Children.toArray(children).find(
      (child): child is React.ReactElement => React.isValidElement(child) && child.type === "thead",
    );
    const headerRow = header
      ? flattenElements((header.props as { children?: React.ReactNode }).children)[0]
      : undefined;
    const headerSignature = headerRow
      ? flattenElements((headerRow.props as { children?: React.ReactNode }).children)
          .map((cell) =>
            textFromNode((cell.props as { children?: React.ReactNode }).children)
              .replace(/\s+/g, " ")
              .trim(),
          )
          .join("|")
      : "table";
    const defaultProfileColumnIndex =
      defaultSortByProfile && headerRow
        ? (() => {
            let index = 0;
            for (const cell of flattenElements(
              (headerRow.props as { children?: React.ReactNode }).children,
            )) {
              const props = cell.props as Record<string, unknown>;
              const currentIndex = index;
              index += typeof props.colSpan === "number" ? props.colSpan : 1;
              const label = textFromNode(props.children as React.ReactNode)
                .replace(/\s+/g, " ")
                .trim();
              const excluded =
                props["data-sortable"] === "false" ||
                props.colSpan !== undefined ||
                !label ||
                hasInput(props.children as React.ReactNode);
              if (!excluded && isProfileColumnLabel(label)) return currentIndex;
            }
            return null;
          })()
        : null;
    const explicitKey = props["data-sort-key"] ?? props.id ?? props["aria-label"];
    const storageKey = `nim-table-sort:${typeof window === "undefined" ? "" : window.location.pathname}:${String(explicitKey ?? `${className ?? "table"}:${headerSignature}`)}`;
    const [sorting, setSorting] = React.useState<SortState>(() =>
      defaultProfileColumnIndex === null
        ? null
        : { index: defaultProfileColumnIndex, direction: "asc" },
    );
    const [sortRestored, setSortRestored] = React.useState(false);

    React.useEffect(() => {
      try {
        const stored = window.sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed: unknown = JSON.parse(stored);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "index" in parsed &&
            typeof parsed.index === "number" &&
            Number.isInteger(parsed.index) &&
            "direction" in parsed &&
            (parsed.direction === "asc" || parsed.direction === "desc")
          ) {
            setSorting({ index: parsed.index, direction: parsed.direction });
          }
        }
      } catch {
        // Sorting is a convenience; the table remains usable if session storage is unavailable.
      }
      setSortRestored(true);
    }, [storageKey]);

    React.useEffect(() => {
      if (!sortRestored) return;
      try {
        if (sorting) window.sessionStorage.setItem(storageKey, JSON.stringify(sorting));
        else window.sessionStorage.removeItem(storageKey);
      } catch {
        // Sorting remains available for this render even if session storage is unavailable.
      }
    }, [sortRestored, sorting, storageKey]);

    const renderedChildren = !sortable
      ? children
      : React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          if (child.type === "thead")
            return sortHead(
              child,
              sorting,
              (index) => {
                setSorting((current) => ({
                  index,
                  direction:
                    current?.index === index && current.direction === "asc" ? "desc" : "asc",
                }));
              },
              serverSorting,
              onServerSort,
            );
          if (child.type === "tbody") return onServerSort ? child : sortBody(child, sorting);
          return child;
        });
    return (
      <div className="relative w-full overflow-auto">
        <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props}>
          {renderedChildren}
        </table>
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
