import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { MaterialProfilesService } from "../src/material-profiles/material-profiles.service";
import * as XLSX from "xlsx";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "s1",
  tokenHash: "h1",
};

describe("MaterialProfilesService", () => {
  it("does not overwrite existing profiles unless the admin explicitly opts in", async () => {
    const existing = {
      id: "p1",
      profile: "IPE200",
      profileKey: "IPE200",
      aliases: [],
      kgPerMeter: new Prisma.Decimal(21),
      rawLengthsMm: [12000],
      isActive: true,
    };
    const transaction = {
      materialProfile: {
        findUnique: vi.fn().mockResolvedValue(existing),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi
          .fn()
          .mockResolvedValue({
            ...existing,
            kgPerMeter: new Prisma.Decimal(22.4),
            rawLengthsMm: [12100],
          }),
        create: vi.fn(),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new MaterialProfilesService({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as never);
    await expect(
      service.import(actor, {
        items: [{ profile: "IPE200", kgPerMeter: 22.4, rawLengthsMm: [12100] }],
        updateExisting: false,
      }),
    ).resolves.toEqual({ created: 0, updated: 0, skipped: 1, total: 1 });
    expect(transaction.materialProfile.update).not.toHaveBeenCalled();
    await expect(
      service.import(actor, {
        items: [{ profile: "IPE200", kgPerMeter: 22.4, rawLengthsMm: [12100] }],
        updateExisting: true,
      }),
    ).resolves.toEqual({ created: 0, updated: 1, skipped: 0, total: 1 });
    expect(transaction.materialProfile.update).toHaveBeenCalledTimes(1);
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "MATERIAL_PROFILE_UPDATED", entityId: "p1" }),
      }),
    );
  });

  it("exports a re-importable workbook including the active state column", async () => {
    const rows = [
      {
        profile: "IPE200",
        aliases: ["IPE200-ANCIEN"],
        kgPerMeter: new Prisma.Decimal(22.4),
        rawLengthsMm: [12100, 15100],
        isActive: true,
      },
    ];
    const service = new MaterialProfilesService({
      materialProfile: { findMany: vi.fn().mockResolvedValue(rows) },
    } as never);
    const buffer = await service.exportWorkbook();
    const book = XLSX.read(buffer, { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]!]!, { header: 1 })).toEqual([
      [
        "D\u00e9signation",
        "Alias",
        "Poids (kg/m)",
        "Longeure 1",
        "Longeure 2",
        "Actif",
      ],
      ["IPE200", "IPE200-ANCIEN", 22.4, 12100, 15100, "Oui"],
    ]);
  });

  it("previews the supplied French Excel catalogue columns and reports invalid rows", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Designation", "Poids (kg/m)", "Longeure 1", "Longeure 2", "Longeure 3"],
      ["IPE200", 22.4, 12100, 15100, null],
      ["UPN200", 0, null, null, null],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Profils");
    const dataBase64 = Buffer.from(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    ).toString("base64");
    const findMany = vi
      .fn()
      .mockResolvedValue([
        {
          id: "p1",
          profile: "IPE200",
          profileKey: "IPE200",
          aliases: [],
          kgPerMeter: 21.8,
          rawLengthsMm: [12000],
          isActive: true,
        },
      ]);
    const service = new MaterialProfilesService({ materialProfile: { findMany } } as never);
    await expect(service.previewImport("catalogue.xlsx", dataBase64)).resolves.toMatchObject({
      total: 2,
      valid: 1,
      invalid: 1,
      items: [
        {
          row: 2,
          profile: "IPE200",
          kgPerMeter: 22.4,
          rawLengthsMm: [12100, 15100],
          existing: { profile: "IPE200", kgPerMeter: 21.8, rawLengthsMm: [12000] },
          errors: [],
        },
        {
          row: 3,
          errors: expect.arrayContaining([
            "Poids kg/m invalide",
            "Au moins une longueur brute positive est requise",
          ]),
        },
      ],
    });
  });

  it("reports cross-row canonical and alias collisions before catalogue import", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Designation", "Alias", "Poids (kg/m)", "Longueur 1"],
      ["IPE200", "UPN200", 22.4, 12100],
      ["UPN200", "", 19.9, 12100],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Profils");
    const dataBase64 = Buffer.from(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    ).toString("base64");
    const service = new MaterialProfilesService({
      materialProfile: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await expect(service.previewImport("catalogue.xlsx", dataBase64)).resolves.toMatchObject({
      valid: 1,
      invalid: 1,
      items: [
        { row: 2, errors: [] },
        { row: 3, errors: [expect.stringContaining("ligne 2")] },
      ],
    });
  });

  it("lists only active profiles and applies the search on the server", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new MaterialProfilesService({ materialProfile: { findMany } } as never);
    await expect(service.list("IPE")).resolves.toEqual({ profiles: [], total: 0 });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { profile: { contains: "IPE", mode: "insensitive" } },
          { aliases: { has: "IPE" } },
        ],
      },
      orderBy: { profile: "asc" },
    });
    await expect(service.list("x".repeat(81))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an alias already owned by another profile", async () => {
    const transaction = {
      materialProfile: {
        findMany: vi.fn().mockResolvedValue([{ profile: "HEA200", aliases: ["HEA-200"] }]),
        create: vi.fn(),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new MaterialProfilesService({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as never);

    await expect(
      service.create(actor, {
        profile: "IPE200",
        aliases: [" HEA 200 "],
        kgPerMeter: 22.4,
        rawLengthsMm: [12100],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.materialProfile.create).not.toHaveBeenCalled();
  });

  it("persists new profile details and history atomically with deduplicated lengths", async () => {
    const profile = {
      id: "profile-1",
      profile: "IPE200",
      aliases: ["IPE 200 OLD"],
      kgPerMeter: 22.4,
      rawLengthsMm: [12100, 15100],
      isActive: true,
      updatedAt: new Date("2026-01-01"),
    };
    const transaction = {
      materialProfile: {
        create: vi.fn().mockResolvedValue(profile),
        findMany: vi.fn().mockResolvedValue([]),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new MaterialProfilesService({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as never);
    await expect(
      service.create(actor, {
        profile: " IPE200 ",
        aliases: ["ipe 200 old"],
        kgPerMeter: 22.4,
        rawLengthsMm: [15100, 12100],
      }),
    ).resolves.toMatchObject({
      profile: {
        id: "profile-1",
        profile: "IPE200",
        aliases: ["IPE 200 OLD"],
        rawLengthsMm: [12100, 15100],
      },
    });
    expect(transaction.materialProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          profile: "IPE200",
          profileKey: "IPE200",
          aliases: ["IPE 200 OLD"],
          kgPerMeter: 22.4,
          rawLengthsMm: [12100, 15100],
        },
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "MATERIAL_PROFILE_CREATED",
          entityType: "MATERIAL_PROFILE",
        }),
      }),
    );
  });

  it("rejects invalid profile data before persistence", async () => {
    const transaction = { materialProfile: { create: vi.fn() }, historyEvent: { create: vi.fn() } };
    const service = new MaterialProfilesService({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as never);
    await expect(
      service.create(actor, { profile: "IPE200", kgPerMeter: 0, rawLengthsMm: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.materialProfile.create).not.toHaveBeenCalled();
  });

  it("maps duplicate profile names to a conflict", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.2.1",
    });
    const transaction = {
      materialProfile: {
        create: vi.fn().mockRejectedValue(duplicate),
        findMany: vi.fn().mockResolvedValue([]),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new MaterialProfilesService({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as never);
    await expect(
      service.create(actor, { profile: "IPE200", kgPerMeter: 22.4, rawLengthsMm: [12000] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("renames a profile, updates its lookup key, and audits the old and new designation", async () => {
    const before = {
      id: "profile-1",
      profile: "IPE200",
      profileKey: "IPE200",
      aliases: [],
      kgPerMeter: new Prisma.Decimal(22.4),
      rawLengthsMm: [12100],
      isActive: true,
    };
    const after = {
      ...before,
      profile: "IPE200-RENOVE",
      profileKey: "IPE200-RENOVE",
      updatedAt: new Date("2026-01-02"),
    };
    const transaction = {
      materialProfile: {
        findUnique: vi.fn().mockResolvedValue(before),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(after),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new MaterialProfilesService({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as never);

    await expect(
      service.update(actor, "profile-1", {
        profile: " IPE200-RENOVE ",
        kgPerMeter: 22.4,
        rawLengthsMm: [12100],
        isActive: true,
      }),
    ).resolves.toMatchObject({ profile: { id: "profile-1", profile: "IPE200-RENOVE" } });
    expect(transaction.materialProfile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        profile: "IPE200-RENOVE",
        profileKey: "IPE200-RENOVE",
        aliases: [],
        kgPerMeter: 22.4,
        rawLengthsMm: [12100],
        isActive: true,
      },
    });
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "MATERIAL_PROFILE_UPDATED",
          metadata: expect.objectContaining({
            before: expect.objectContaining({ profile: "IPE200" }),
            after: expect.objectContaining({ profile: "IPE200-RENOVE" }),
          }),
        }),
      }),
    );
  });

  it("rejects a renamed designation that already exists", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.2.1",
    });
    const transaction = {
      materialProfile: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: "profile-1",
            profile: "IPE200",
            profileKey: "IPE200",
          }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockRejectedValue(duplicate),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new MaterialProfilesService({
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as never);

    await expect(
      service.update(actor, "profile-1", {
        profile: "HEA300",
        kgPerMeter: 22.4,
        rawLengthsMm: [12100],
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.historyEvent.create).not.toHaveBeenCalled();
  });
});
