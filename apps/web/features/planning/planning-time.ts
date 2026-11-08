export type PlanningView = "DAY" | "WEEK" | "MONTH";

const TIME_ZONE = "Africa/Tunis";

function partsFor(value: Date, withTime = true): Record<string, number> {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" as const } : {}),
  });
  return Object.fromEntries(
    formatter.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function dateKeyInTunis(value: Date): string {
  const parts = partsFor(value, false);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function tunisDateTimeToUtc(dateKey: string, hour: number, minute = 0): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let result = wanted;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const zoned = partsFor(new Date(result));
    const represented = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute);
    const correction = wanted - represented;
    result += correction;
    if (correction === 0) break;
  }
  return new Date(result);
}

export function tunisWallTimeFromUtc(value: Date): number {
  const parts = partsFor(value);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function formatTunisDateTime(value: Date | string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatTunisDateKey(dateKey: string, options: Intl.DateTimeFormatOptions = {}): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hasDatePart = ["weekday", "era", "year", "month", "day"]
    .some((key) => key in options);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    ...(hasDatePart ? {} : { dateStyle: "full" as const }),
    ...options,
  })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function rangeForPlanning(dateKey: string, view: PlanningView): { start: Date; end: Date; startDateKey: string; dayCount: number } {
  let startDateKey = dateKey;
  if (view === "MONTH") {
    const [year, month] = dateKey.split("-").map(Number);
    startDateKey = `${year}-${String(month).padStart(2, "0")}-01`;
  } else if (view === "WEEK") {
    const [year, month, day] = dateKey.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
    startDateKey = shiftDateKey(dateKey, -(weekday + 6) % 7);
  }
  const [startYear, startMonth] = startDateKey.split("-").map(Number);
  const dayCount = view === "DAY"
    ? 1
    : view === "WEEK"
      ? 7
      : new Date(Date.UTC(startYear!, startMonth!, 0)).getUTCDate();
  const endDateKey = shiftDateKey(startDateKey, dayCount);
  return {
    start: tunisDateTimeToUtc(startDateKey, 0),
    end: tunisDateTimeToUtc(endDateKey, 0),
    startDateKey,
    dayCount,
  };
}

export function dateTimeLocalInTunis(value: Date | string): string {
  const parts = partsFor(typeof value === "string" ? new Date(value) : value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function tunisDateTimeLocalToUtc(value: string): Date {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Date de planification invalide.");
  return tunisDateTimeToUtc(match[1]!, Number(match[2]), Number(match[3]));
}

export function durationMinutes(startAt: string, endAt: string): number {
  return (tunisWallTimeFromUtc(new Date(endAt)) - tunisWallTimeFromUtc(new Date(startAt))) / 60_000;
}

export function eventStartMinutes(startAt: string, rangeStartDateKey: string): number {
  const [year, month, day] = rangeStartDateKey.split("-").map(Number);
  const rangeWallStart = Date.UTC(year, month - 1, day);
  return (tunisWallTimeFromUtc(new Date(startAt)) - rangeWallStart) / 60_000;
}

export const planningTimeZone = TIME_ZONE;
