import { BadRequestException } from "@nestjs/common";

export type SortDirection = "asc" | "desc";

export function parseListSort<T extends string>(
  sortBy: string | undefined,
  sortDirection: string | undefined,
  allowed: readonly T[],
  defaultSort: { sortBy: T; sortDirection: SortDirection },
): { sortBy: T; sortDirection: SortDirection } {
  const field = sortBy ?? defaultSort.sortBy;
  const direction = sortDirection ?? defaultSort.sortDirection;
  if (!allowed.includes(field as T) || (direction !== "asc" && direction !== "desc")) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Le tri demandé est invalide.",
    });
  }
  return { sortBy: field as T, sortDirection: direction };
}
