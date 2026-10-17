import { describe, expect, it } from "vitest";
import {
  calculateTotalWeightKg,
  classifyProfile,
  createManualPieceSchema,
  dashboardQuerySchema,
  faconnageOptimizationSchema,
  loginSchema,
  parseEnvironment,
  pieceListQuerySchema,
  qualityDecisionSchema,
  qualityDispositionSchema,
} from "./index";

describe("foundation validation", () => {
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
  });

  it("calculates manual total weight in kilograms without floating noise", () => {
    expect(calculateTotalWeightKg(2.45, 3)).toBe(7.35);
    expect(calculateTotalWeightKg(undefined, 3)).toBeUndefined();
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
    expect(createManualPieceSchema.safeParse({ ...input, unitWeightKg: undefined }).success).toBe(
      false,
    );
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
