"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PageToken = number | "ellipsis-start" | "ellipsis-end";

function pageTokens(page: number, pageCount: number): PageToken[] {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const ordered = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const result: PageToken[] = [];
  ordered.forEach((value, index) => {
    const previous = ordered[index - 1];
    if (previous && value - previous > 1) result.push(previous === 1 ? "ellipsis-start" : "ellipsis-end");
    result.push(value);
  });
  return result;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  pageSizes = [10, 20, 50],
  onPageChange,
  onPageSizeChange,
  itemLabel = "élément",
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  pageSizes?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemLabel?: string;
}): React.ReactNode {
  const safePageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safePageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const plural = total > 1 ? "s" : "";
  const tokens = pageTokens(safePage, safePageCount);

  return (
    <nav
      aria-label="Navigation dans les pages"
      className="flex flex-col gap-3 border-t border-slate-200 bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
    >
      <p className="text-xs text-slate-500" aria-live="polite">
        {start}–{end} sur {total} {itemLabel}{plural}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-11 min-h-11 w-[120px] text-sm" aria-label="Nombre de lignes par page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          disabled={safePage <= 1}
          aria-label="Page précédente"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="hidden items-center gap-1 sm:flex" aria-label="Pages">
          {tokens.map((token) =>
            typeof token === "number" ? (
              <Button
                key={token}
                type="button"
                variant={token === safePage ? "secondary" : "ghost"}
                size="icon"
                className="size-11 text-xs"
                onClick={() => onPageChange(token)}
                aria-label={`Page ${token}`}
                aria-current={token === safePage ? "page" : undefined}
              >
                {token}
              </Button>
            ) : (
              <span key={token} className="flex size-11 items-center justify-center text-slate-400" aria-hidden="true">
                <MoreHorizontal className="size-4" />
              </span>
            ),
          )}
        </div>
        <span className="min-w-20 text-center text-xs font-medium text-slate-600 sm:hidden dark:text-slate-300">
          Page {safePage} / {safePageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onPageChange(Math.min(safePageCount, safePage + 1))}
          disabled={safePage >= safePageCount}
          aria-label="Page suivante"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
