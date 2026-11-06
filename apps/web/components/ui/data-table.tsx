"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isProfileColumnLabel, TableSortIndicator } from "@/components/ui/table-sort";

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  caption?: string;
  emptyMessage?: string;
  getRowId?: (row: TData, index: number) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  caption,
  emptyMessage = "Aucune donnée à afficher.",
  getRowId,
}: DataTableProps<TData, TValue>): React.ReactNode {
  const defaultProfileColumn = columns.find((column) => {
    const definition = column as ColumnDef<TData, TValue> & { accessorKey?: unknown; id?: unknown };
    return (
      isProfileColumnLabel(definition.header) ||
      isProfileColumnLabel(definition.id) ||
      isProfileColumnLabel(definition.accessorKey)
    );
  }) as (ColumnDef<TData, TValue> & { accessorKey?: unknown; id?: unknown }) | undefined;
  const defaultProfileColumnId = defaultProfileColumn
    ? typeof defaultProfileColumn.id === "string"
      ? defaultProfileColumn.id
      : typeof defaultProfileColumn.accessorKey === "string"
        ? defaultProfileColumn.accessorKey
        : undefined
    : undefined;
  const [sorting, setSorting] = useState<SortingState>(() =>
    defaultProfileColumnId ? [{ id: defaultProfileColumnId, desc: false }] : [],
  );
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="overflow-x-auto">
      <Table sortable={false} className="nim-data-table min-w-[560px] text-left text-sm">
        {caption ? <TableCaption className="sr-only">{caption}</TableCaption> : null}
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const direction = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <TableHead key={header.id} data-sortable={canSort ? undefined : "false"} data-sort-direction={direction || undefined}>
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        className="nim-table-sort-button"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Trier par ${String(header.column.columnDef.header ?? "cette colonne")}`}
                        aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
                      >
                        <span className="nim-table-heading-content">
                          <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                          <TableSortIndicator direction={direction || "none"} />
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
