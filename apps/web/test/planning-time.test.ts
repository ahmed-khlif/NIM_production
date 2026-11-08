import { describe, expect, it } from "vitest";
import {
  dateKeyInTunis,
  dateTimeLocalInTunis,
  durationMinutes,
  eventStartMinutes,
  formatTunisDateTime,
  rangeForPlanning,
  tunisDateTimeLocalToUtc,
  tunisDateTimeToUtc,
} from "@/features/planning/planning-time";

describe("planning timezone helpers", () => {
  it("converts Tunis wall time to UTC and back without relying on browser timezone", () => {
    const utc = tunisDateTimeLocalToUtc("2026-11-06T08:30");
    expect(utc.toISOString()).toBe("2026-11-06T07:30:00.000Z");
    expect(dateTimeLocalInTunis(utc)).toBe("2026-11-06T08:30");
    expect(dateKeyInTunis(utc)).toBe("2026-11-06");
    expect(formatTunisDateTime(utc)).toContain("08:30");
  });

  it("returns a Monday to Monday range for week view and positions events on that axis", () => {
    const range = rangeForPlanning("2026-11-06", "WEEK");
    expect(range).toMatchObject({ startDateKey: "2026-11-02", dayCount: 7 });
    expect(range.start.toISOString()).toBe(tunisDateTimeToUtc("2026-11-02", 0).toISOString());
    expect(eventStartMinutes("2026-11-04T08:00:00.000Z", range.startDateKey)).toBe(2 * 1440 + 9 * 60);
    expect(durationMinutes("2026-11-04T08:00:00.000Z", "2026-11-04T09:30:00.000Z")).toBe(90);
  });

  it("returns the complete calendar month as a half-open Tunis-time range", () => {
    const range = rangeForPlanning("2028-02-19", "MONTH");
    expect(range).toMatchObject({ startDateKey: "2028-02-01", dayCount: 29 });
    expect(range.start.toISOString()).toBe(tunisDateTimeToUtc("2028-02-01", 0).toISOString());
    expect(range.end.toISOString()).toBe(tunisDateTimeToUtc("2028-03-01", 0).toISOString());
  });
});
