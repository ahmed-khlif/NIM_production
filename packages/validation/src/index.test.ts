import { describe, expect, it } from "vitest";
import {
  calculateTotalWeightKg,
  calculatePieceWeightKg,
  classifyProfile,
  createPieceSchema,
  createPieceBatchSchema,
  createManualPieceSchema,
  createUserSchema,
  dashboardQuerySchema,
  faconnageOptimizationSchema,
  loginSchema,
  materialProfileSchema,
  operatorLoginSchema,
  parseEnvironment,
  pieceListQuerySchema,
  qualityDecisionSchema,
  qualityDispositionSchema,
  createScheduleEventSchema,
  createScheduleBatchSchema,
  scheduleBatchPreviewSchema,
  scheduleBoardQuerySchema,
  scheduleFirstEventDateQuerySchema,
  scheduleOfferDayQuerySchema,
  updateScheduleEventSchema,
} from "./index";

describe("foundation validation", () => {
  it("validates schedule event types, UTC intervals, machine blocks, and production teams", () => {
    const base = {
      startAt: "2026-11-06T08:00:00.000Z",
      endAt: "2026-11-06T09:00:00.000Z",
      machineId: "machine-1",
    };
    expect(createScheduleEventSchema.safeParse({
      ...base,
      type: "PRODUCTION",
      cuttingBarId: "bar-1",
      leadOperatorId: "operator-1",
      helperOperatorIds: ["operator-2"],
    }).success).toBe(true);
    expect(createScheduleEventSchema.safeParse({
      ...base,
      type: "PRODUCTION",
      cuttingBarId: "bar-1",
      leadOperatorId: "operator-1",
      helperOperatorIds: ["operator-1"],
    }).success).toBe(false);
    expect(createScheduleEventSchema.safeParse({ ...base, type: "PRODUCTION", cuttingBarId: "bar-1" }).success).toBe(false);
    expect(createScheduleEventSchema.safeParse({ ...base, type: "MAINTENANCE", title: "Entretien" }).success).toBe(true);
    expect(createScheduleEventSchema.safeParse({ ...base, type: "MACHINE_BLOCK", title: "Fermeture", cuttingBarId: "bar-1" }).success).toBe(false);
    expect(createScheduleEventSchema.safeParse({ ...base, type: "MACHINE_BLOCK", title: "Fermeture", endAt: base.startAt }).success).toBe(false);
  });

  it("bounds planning board queries and accepts partial reschedule patches", () => {
    const base = {
      startAt: "2026-11-06T08:00:00.000Z",
      endAt: "2026-11-07T08:00:00.000Z",
    };
    expect(scheduleBoardQuerySchema.parse(base)).toMatchObject({ status: "PLANNED", pageSize: 20, unscheduledPage: 1 });
    expect(scheduleBoardQuerySchema.safeParse({ ...base, endAt: "2027-01-01T08:00:00.000Z" }).success).toBe(false);
    expect(updateScheduleEventSchema.parse({ startAt: "2026-11-06T10:00:00.000Z" })).toEqual({ startAt: "2026-11-06T10:00:00.000Z" });
    expect(updateScheduleEventSchema.safeParse({ startAt: "2026-11-06T10:00:00.000Z", endAt: "2026-11-06T09:00:00.000Z" }).success).toBe(false);
  });

  it("validates an Affaire-wide planning batch and rejects duplicate or invalid bar selections", () => {
    const base = {
      offerId: "offer-1",
      startAt: "2026-11-06T08:00:00.000Z",
      durationMinutes: 60,
      gapMinutes: 10,
      leadOperatorId: "operator-1",
      helperOperatorIds: ["operator-2"],
    };
    expect(scheduleBatchPreviewSchema.parse(base)).toMatchObject({ gapMinutes: 10, helperOperatorIds: ["operator-2"] });
    expect(createScheduleBatchSchema.parse({ ...base, cuttingBarIds: ["bar-1", "bar-2"] }).cuttingBarIds).toHaveLength(2);
    expect(createScheduleBatchSchema.safeParse({ ...base, cuttingBarIds: [] }).success).toBe(false);
    expect(createScheduleBatchSchema.safeParse({ ...base, cuttingBarIds: ["bar-1", "bar-1"] }).success).toBe(false);
    expect(scheduleBatchPreviewSchema.safeParse({ ...base, durationMinutes: 0 }).success).toBe(false);
    expect(scheduleBatchPreviewSchema.safeParse({ ...base, helperOperatorIds: ["operator-1"] }).success).toBe(false);
    expect(scheduleBatchPreviewSchema.safeParse({ ...base, cuttingBarIds: Array.from({ length: 501 }, (_, index) => `bar-${index}`) }).success).toBe(false);
  });

  it("accepts only real local calendar dates for the Affair day schedule", () => {
    expect(scheduleOfferDayQuerySchema.parse({ date: "2026-11-08" })).toEqual({ date: "2026-11-08" });
    expect(scheduleOfferDayQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(scheduleOfferDayQuerySchema.safeParse({ date: "08/11/2026" }).success).toBe(false);
  });

  it("validates optional scope filters for the initial planning date", () => {
    expect(scheduleFirstEventDateQuerySchema.parse({})).toEqual({});
    expect(scheduleFirstEventDateQuerySchema.parse({ offerId: "offer-1", machineId: "machine-1" })).toEqual({ offerId: "offer-1", machineId: "machine-1" });
    expect(scheduleFirstEventDateQuerySchema.safeParse({ offerId: " " }).success).toBe(false);
    expect(scheduleFirstEventDateQuerySchema.safeParse({ machineId: "m".repeat(65) }).success).toBe(false);
  });

  it("uses the existing username/password account for operator tablet login", () => {
    expect(operatorLoginSchema.parse({ username: " Operator_1 ", password: "secret" })).toEqual({ username: "Operator_1", password: "secret" });
    expect(operatorLoginSchema.safeParse({ connectionKey: "NIM-old-key" }).success).toBe(false);
    expect(createUserSchema.safeParse({ username: "operator", displayName: "Operator User", role: "OPERATOR", password: "SecurePass!2026" }).success).toBe(true);
  });
  it("classifies detailed profiles strictly and preserves unknown families", () => {
    expect(classifyProfile("IPE200")).toBe("IPE");
    expect(classifyProfile("HEA300")).toBe("HEA");
    expect(classifyProfile("UPN120")).toBe("UPN");
    expect(classifyProfile("L80*80*8")).toBe("L");
    expect(classifyProfile("ROND30")).toBe("ROND");
    expect(classifyProfile("DEMI-IPE400")).toBe("OTHER");
    expect(classifyProfile("PL30*490")).toBe("OTHER");
  });

  it("requires a measured kerf and distinct profile options for cutting estimates", () => {
    const input = {
      profiles: [{ profile: "IPE200", kerfMm: 3, rawLengths: [{ lengthMm: 12000 }] }],
    };
    expect(faconnageOptimizationSchema.parse(input)).toEqual(input);
    expect(
      faconnageOptimizationSchema.safeParse({
        profiles: [{ ...input.profiles[0], kerfMm: 0 }],
      }).success,
    ).toBe(false);
    expect(
      faconnageOptimizationSchema.safeParse({
        profiles: [input.profiles[0], { ...input.profiles[0], profile: " ipe200 " }],
      }).success,
    ).toBe(false);
    expect(faconnageOptimizationSchema.safeParse({
      profiles: [{ profile: "IPE200", kerfMm: 3, rawLengths: [{ lengthMm: 12000, quantity: 0 }] }],
    }).success).toBe(true);
    expect(faconnageOptimizationSchema.safeParse({
      profiles: [{ profile: "IPE200", kerfMm: 3, rawLengths: [{ lengthMm: 12000, quantity: -1 }] }],
    }).success).toBe(false);
  });

  it("calculates manual total weight in kilograms without floating noise", () => {
    expect(calculateTotalWeightKg(2.45, 3)).toBe(7.35);
    expect(calculatePieceWeightKg(22.4, 3200)).toBe(71.68);
    expect(calculateTotalWeightKg(undefined, 3)).toBeUndefined();
  });

  it("validates exact material profiles and their distinct positive raw lengths", () => {
    expect(materialProfileSchema.parse({ profile: " IPE 200 ", kgPerMeter: 22.4, rawLengthsMm: [12100, 15100] }).profile).toBe("IPE 200");
    expect(materialProfileSchema.parse({ reference: "legacy-ref", profile: "IPE200", kgPerMeter: 22.4, rawLengthsMm: [12100] })).not.toHaveProperty("reference");
    expect(materialProfileSchema.parse({ profile: "IPE200", aliases: ["IPE-200", " IPE 200 ANCIEN "], kgPerMeter: 22.4, rawLengthsMm: [12100] }).aliases).toEqual(["IPE-200", "IPE 200 ANCIEN"]);
    expect(materialProfileSchema.safeParse({ profile: "IPE200", aliases: ["IPE-200", " IPE - 200 "], kgPerMeter: 22.4, rawLengthsMm: [12100] }).success).toBe(false);
    expect(materialProfileSchema.safeParse({ profile: "IPE200", aliases: ["IPE 200"], kgPerMeter: 22.4, rawLengthsMm: [12100] }).success).toBe(false);
    expect(materialProfileSchema.safeParse({ profile: "IPE200", kgPerMeter: 22.4, rawLengthsMm: [] }).success).toBe(false);
    expect(materialProfileSchema.safeParse({ profile: "IPE200", kgPerMeter: 22.4, rawLengthsMm: [12100, 12100] }).success).toBe(false);
  });

  it("allows an Offer to generate the piece reference and defaults optional quality and designation", () => {
    const withoutOptionalFields = createPieceSchema.parse({ quantity: 1, profile: "IPE200", lengthMm: 3200 });
    expect(withoutOptionalFields).not.toHaveProperty("reference");
    expect(withoutOptionalFields).toMatchObject({
      quality: "UNKNOWN",
      designation: "À compléter",
    });
    expect(createPieceSchema.parse({ quantity: 1, profile: "IPE200", lengthMm: 3200, quality: "", designation: "" })).toMatchObject({
      quality: "UNKNOWN",
      designation: "À compléter",
    });
  });

  it("validates a bounded batch of different cut lengths", () => {
    const piece = { quantity: 1, profile: "HEA100", lengthMm: 3200 };
    expect(createPieceBatchSchema.parse({ pieces: [piece, { ...piece, lengthMm: 5000 }] }).pieces).toHaveLength(2);
    expect(createPieceBatchSchema.safeParse({ pieces: [piece] }).success).toBe(false);
    expect(createPieceBatchSchema.safeParse({ pieces: Array.from({ length: 51 }, (_, index) => ({ ...piece, lengthMm: 1000 + index })) }).success).toBe(false);
  });

  it("normalizes detailed profiles and requires a positive manual unit weight", () => {
    const input = {
      reference: "P-001",
      quantity: 2,
      profile: "  L80*80*8  ",
      lengthMm: 6000,
      unitWeightKg: 4.5,
    };
    expect(createManualPieceSchema.parse(input).profile).toBe("L80*80*8");
    expect(createManualPieceSchema.safeParse({ ...input, unitWeightKg: 0 }).success).toBe(false);
    expect(createManualPieceSchema.safeParse({ ...input, unitWeightKg: undefined }).success).toBe(true);
  });

  it("requires both login fields", () => {
    expect(loginSchema.safeParse({ username: "", password: "" }).success).toBe(false);
    expect(loginSchema.parse({ username: "operator", password: "secret" })).toEqual({
      username: "operator",
      password: "secret",
    });
  });

  it("rejects incomplete environment configuration", () => {
    expect(() => parseEnvironment({ DATABASE_URL: "postgresql://localhost/db" })).toThrow();
  });

  it("bounds dashboard trend windows server-side", () => {
    expect(dashboardQuerySchema.parse({})).toEqual({ days: 14 });
    expect(dashboardQuerySchema.parse({ days: "30" })).toEqual({ days: 30 });
    expect(dashboardQuerySchema.safeParse({ days: 6 }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ days: 91 }).success).toBe(false);
  });

  it("bounds piece-list pagination and trims supported filters", () => {
    expect(
      pieceListQuerySchema.parse({
        page: "2",
        pageSize: "50",
        search: " IPE ",
        profile: " IPE200 ",
      }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      search: "IPE",
      profile: "IPE200",
      designation: "",
    });
    expect(pieceListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(pieceListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(pieceListQuerySchema.safeParse({ search: "x".repeat(81) }).success).toBe(false);
  });

  it("rejects wildcard CORS and placeholder production secrets", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/db",
      API_URL: "https://api.example.com",
      APP_URL: "https://app.example.com",
      AUTH_SECRET: "replace-with-a-long-random-secret-at-least-32-characters",
      CORS_ORIGINS: "*",
      TRUST_PROXY: "true",
      MEDIA_ROOT: "./storage/media",
    };

    expect(() => parseEnvironment(base)).toThrow();
  });

  it("accepts explicit HTTPS production origins and secrets", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/db",
        API_URL: "https://api.example.com",
        APP_URL: "https://app.example.com",
        AUTH_SECRET: "a-secure-production-secret-that-is-long-enough-123",
        CORS_ORIGINS: "https://app.example.com",
        TRUST_PROXY: "true",
        MEDIA_ROOT: "/var/lib/nim/media",
      }),
    ).not.toThrow();
  });

  it("requires a defect category and reason for non-conformance workflows", () => {
    expect(
      qualityDecisionSchema.safeParse({ result: "NON_CONFORM", comment: "Défaut" }).success,
    ).toBe(false);
    expect(
      qualityDecisionSchema.safeParse({
        result: "NON_CONFORM",
        comment: "Défaut de surface",
        defectCategory: "SURFACE",
      }).success,
    ).toBe(true);
    expect(qualityDispositionSchema.safeParse({ type: "REWORK", reason: " " }).success).toBe(false);
    expect(
      qualityDispositionSchema.safeParse({ type: "SCRAP", reason: "Irréparable" }).success,
    ).toBe(true);
  });
});
