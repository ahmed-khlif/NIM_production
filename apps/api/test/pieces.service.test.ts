import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { PiecesService } from "../src/pieces/pieces.service";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "session-1",
  tokenHash: "hash",
};
const dates = { createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") };

function createService(prisma: Partial<PrismaService>): PiecesService {
  const candidate = prisma as PrismaService & { offer?: { findUnique: ReturnType<typeof vi.fn> } };
  if (!candidate.offer) {
    candidate.offer = { findUnique: vi.fn().mockResolvedValue({ status: "DRAFT" }) } as never;
  }
  return new PiecesService(candidate as PrismaService);
}

describe("PiecesService", () => {
  it("rejects invalid piece input before persistence", async () => {
    const piece = { findFirst: vi.fn() };
    const service = createService({ piece } as never);

    await expect(
      service.createPiece(actor, "offer-1", {
        reference: "",
        quantity: 0,
        profile: "",
        lengthMm: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(piece.findFirst).not.toHaveBeenCalled();
  });

  it("keeps piece listing scoped to the selected offer", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const service = createService({ piece: { findMany, count } } as never);

    await expect(service.listPieces("offer-a")).resolves.toMatchObject({
      pieces: [],
      profiles: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { offerId: "offer-a" } }),
    );
    expect(count).toHaveBeenCalledWith({ where: { offerId: "offer-a" } });
  });

  it("validates and applies server-side piece list filters and pagination", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(42);
    const service = createService({ piece: { findMany, count } } as never);

    await expect(
      service.listPieces("offer-a", {
        page: "2",
        pageSize: "10",
        search: "IPE",
        profile: "IPE200",
      }),
    ).resolves.toMatchObject({ page: 2, pageSize: 10, total: 42, totalPages: 5 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          offerId: "offer-a",
          profile: "IPE200",
          OR: expect.arrayContaining([
            { reference: { contains: "IPE", mode: "insensitive" } },
            { profile: { contains: "IPE", mode: "insensitive" } },
          ]),
        }),
      }),
    );
  });

  it("rejects unsafe piece list page sizes", async () => {
    const findMany = vi.fn();
    const count = vi.fn();
    const service = createService({ piece: { findMany, count } } as never);

    await expect(service.listPieces("offer-a", { pageSize: "1000" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it("allows editing an untouched piece in production and audits before/after values", async () => {
    const target = {
      id: "piece-1",
      offerId: "offer-1",
      reference: "CMD-001",
      quantity: 2,
      profile: "IPE200",
      quality: "S275JR",
      lengthMm: 6000,
      unitWeightKg: 2.4,
      totalWeightKg: 4.8,
      designation: "POUTRE",
      priority: "NORMAL",
      dueDate: null,
      status: "PLANNED",
      createdById: "admin-1",
      version: 3,
      ...dates,
      units: [
        { status: "PENDING", productionStatus: "PENDING" },
        { status: "PENDING", productionStatus: "PENDING" },
      ],
    };
    const updated = { ...target, lengthMm: 6200, version: 4 };
    const transaction = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({ status: "IN_PRODUCTION" }),
        update: vi.fn(),
      },
      piece: {
        findFirst: vi.fn().mockResolvedValue(target),
        update: vi.fn().mockResolvedValue(updated),
      },
      historyEvent: { create: vi.fn() },
      cuttingPlan: { updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.updatePiece(actor, "offer-1", "piece-1", {
        profile: "IPE200",
        quality: "S275JR",
        lengthMm: 6200,
        unitWeightKg: 2.4,
        designation: "POUTRE",
      }),
    ).resolves.toMatchObject({ lengthMm: 6200 });
    expect(transaction.piece.update).toHaveBeenCalledOnce();
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "PIECE_UPDATED",
          metadata: expect.objectContaining({
            previousVersion: 3,
            version: 4,
            previous: expect.objectContaining({ lengthMm: 6000 }),
            updated: expect.objectContaining({ lengthMm: 6200 }),
          }),
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("keeps a production piece locked as soon as any unit has entered the workflow", async () => {
    const transaction = {
      offer: { findUnique: vi.fn().mockResolvedValue({ status: "IN_PRODUCTION" }) },
      piece: {
        findFirst: vi.fn().mockResolvedValue({
          id: "piece-1",
          quantity: 2,
          status: "IN_PROGRESS",
          units: [
            { status: "PENDING", productionStatus: "PENDING" },
            { status: "FACONNEE", productionStatus: "FACONNEE" },
          ],
        }),
        update: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.updatePiece(actor, "offer-1", "piece-1", {
        profile: "IPE200",
        quality: "S275JR",
        lengthMm: 6200,
        designation: "POUTRE",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.piece.update).not.toHaveBeenCalled();
  });

  it("creates the requested unit count and records an audit event in one transaction", async () => {
    const created = {
      id: "piece-1",
      reference: "CMD-001",
      quantity: 3,
      profile: "Profil 40",
      lengthMm: 6000,
      unitWeightKg: null,
      priority: "NORMAL",
      dueDate: null,
      status: "PLANNED",
      createdById: "admin-1",
      version: 1,
      ...dates,
      units: [{ status: "PENDING" }, { status: "PENDING" }, { status: "PENDING" }],
    };
    const transaction = {
      piece: { create: vi.fn().mockResolvedValue(created) },
      historyEvent: { create: vi.fn() },
      offer: { update: vi.fn() },
      cuttingPlan: { updateMany: vi.fn() },
    };
    const prisma = {
      piece: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.createPiece(actor, "offer-1", {
        reference: "cmd-001",
        quantity: 3,
        profile: "Profil 40",
        lengthMm: 6000,
      }),
    ).resolves.toMatchObject({ reference: "CMD-001", quantity: 3, completedUnits: 0 });
    expect(prisma.piece.findFirst).toHaveBeenCalledWith({
      where: { offerId: "offer-1", reference: "CMD-001" },
      select: { id: true },
    });
    expect(transaction.piece.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: "CMD-001",
          units: {
            createMany: {
              data: [{ sequenceNumber: 1 }, { sequenceNumber: 2 }, { sequenceNumber: 3 }],
            },
          },
        }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "PIECE_CREATED", actorRole: "ADMIN" }),
      }),
    );
    expect(transaction.offer.update).toHaveBeenCalledWith({
      where: { id: "offer-1" },
      data: { materialRevision: { increment: 1 } },
    });
    expect(transaction.cuttingPlan.updateMany).toHaveBeenCalledWith({
      where: { offerId: "offer-1", status: "DRAFT" },
      data: { status: "ARCHIVED" },
    });
  });

  it("stores the Tekla business fields and calculates total weight for manual creation", async () => {
    const created = {
      id: "piece-tekla-1",
      reference: "P-001",
      quantity: 2,
      profile: "IPE200",
      quality: "S275JR",
      lengthMm: 6000,
      unitWeightKg: 4.5,
      totalWeightKg: 9,
      designation: "POUTRE",
      priority: "NORMAL",
      dueDate: null,
      status: "PLANNED",
      createdById: "admin-1",
      version: 1,
      ...dates,
      units: [{ status: "PENDING" }, { status: "PENDING" }],
    };
    const transaction = {
      piece: { create: vi.fn().mockResolvedValue(created) },
      historyEvent: { create: vi.fn() },
      offer: { update: vi.fn() },
      cuttingPlan: { updateMany: vi.fn() },
    };
    const prisma = {
      piece: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await service.createPiece(actor, "offer-1", {
      reference: "P-001",
      quantity: 2,
      profile: "IPE200",
      quality: "S275JR",
      lengthMm: 6000,
      unitWeightKg: 4.5,
      designation: "POUTRE",
    });

    expect(transaction.piece.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: "P-001",
          profile: "IPE200",
          quality: "S275JR",
          lengthMm: 6000,
          unitWeightKg: 4.5,
          totalWeightKg: 9,
          designation: "POUTRE",
        }),
      }),
    );
  });

  it("does not archive a piece that is already in production", async () => {
    const target = {
      id: "piece-1",
      reference: "CMD-001",
      quantity: 1,
      profile: "Profil 40",
      lengthMm: 6000,
      unitWeightKg: null,
      priority: "NORMAL",
      dueDate: null,
      status: "IN_PROGRESS",
      createdById: "admin-1",
      version: 1,
      ...dates,
      units: [{ status: "IN_PROGRESS" }],
    };
    const prisma = { piece: { findFirst: vi.fn().mockResolvedValue(target) } };
    const service = createService(prisma as never);

    await expect(service.archivePiece(actor, "offer-1", "piece-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("returns unit traceability with the active assignment", async () => {
    const piece = {
      id: "piece-1",
      reference: "CMD-001",
      quantity: 1,
      profile: "Profil 40",
      lengthMm: 6000,
      unitWeightKg: null,
      priority: "NORMAL",
      dueDate: null,
      status: "ASSIGNED",
      createdById: "admin-1",
      version: 1,
      ...dates,
      units: [
        {
          id: "unit-1",
          pieceId: "piece-1",
          sequenceNumber: 1,
          status: "ASSIGNED",
          currentMachineId: "machine-1",
          currentOperatorId: null,
          startedAt: null,
          manufacturedAt: null,
          controlledAt: null,
          qualityResult: null,
          currentMachine: { id: "machine-1", name: "CNC-01" },
          currentOperator: null,
          assignments: [
            {
              id: "assignment-1",
              machineId: "machine-1",
              queuePosition: 2,
              assignedAt: new Date("2026-01-02T10:00:00Z"),
              reason: "Priorité client",
              machine: { id: "machine-1", name: "CNC-01" },
            },
          ],
        },
      ],
    };
    const prisma = { piece: { findFirst: vi.fn().mockResolvedValue(piece) } };
    const service = createService(prisma as never);

    await expect(service.getPiece("piece-1")).resolves.toMatchObject({
      reference: "CMD-001",
      units: [
        { sequenceNumber: 1, currentMachineName: "CNC-01", activeAssignment: { queuePosition: 2 } },
      ],
    });
  });

  it("previews CSV rows with server validation and duplicate detection", async () => {
    const prisma = { piece: { findMany: vi.fn().mockResolvedValue([{ reference: "CMD-002" }]) } };
    const service = createService(prisma as never);

    await expect(
      service.previewImport("offer-1", {
        filename: "pieces.csv",
        content:
          "reference,quantity,profile,length_mm\nCMD-001,2,Profil 40,6000\nCMD-002,1,Profil 20,3000\nCMD-001,0,,bad",
      }),
    ).resolves.toMatchObject({
      rowsTotal: 3,
      validRows: 1,
      invalidRows: 2,
      rows: [{ valid: true }, { valid: false }, { valid: false }],
    });
  });

  it("previews a Windows-code-page Tekla HTML XLS export and preserves source weights", async () => {
    const prisma = { piece: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = createService(prisma as never);
    const html = [
      "<table>",
      "<tr><td>Repère</td><td>Profil</td><td>Qté</td><td>Qualité</td><td>Long.</td><td>Surface</td><td>Poids</td><td>Pds Tot</td><td>Désignation</td></tr>",
      "<tr><td>P-001</td><td>IPE200</td><td>2</td><td>S235JR</td><td>6000</td><td>12</td><td>4.5</td><td>11</td><td>POUTRE</td></tr>",
      "</table>",
    ].join("");

    await expect(
      service.previewImport("offer-1", {
        filename: "tekla.xls",
        content: Buffer.from(html, "latin1").toString("base64"),
        encoding: "base64",
      }),
    ).resolves.toMatchObject({
      sourceFormat: "TEKLA_XLS",
      rowsTotal: 1,
      validRows: 1,
      warningRows: 1,
      rows: [
        {
          valid: true,
          values: {
            reference: "P-001",
            profile: "IPE200",
            quality: "S235JR",
            lengthMm: "6000",
            unitWeightKg: "4.5",
            totalWeightKg: "11",
            designation: "POUTRE",
          },
          warnings: [expect.stringContaining("Écart de poids")],
        },
      ],
    });
  });

  it("commits valid CSV rows transactionally and audits each imported piece", async () => {
    const createdPiece = { id: "piece-imported", reference: "CMD-001", quantity: 2 };
    const transaction = {
      importBatch: { create: vi.fn().mockResolvedValue({ id: "batch-1" }) },
      piece: { create: vi.fn().mockResolvedValue(createdPiece) },
      historyEvent: { create: vi.fn() },
      offer: { update: vi.fn() },
      cuttingPlan: { updateMany: vi.fn() },
    };
    const prisma = {
      piece: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.commitImport(actor, "offer-1", {
        filename: "pieces.csv",
        content: "reference,quantity,profile,lengthMm\nCMD-001,2,Profil 40,6000",
      }),
    ).resolves.toMatchObject({ batchId: "batch-1", rowsCreated: 1, status: "COMMITTED" });
    expect(transaction.importBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMMITTED", rowsCreated: 1 }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "PIECE_IMPORTED",
          metadata: expect.objectContaining({ batchId: "batch-1" }),
        }),
      }),
    );
    expect(transaction.offer.update).toHaveBeenCalledWith({
      where: { id: "offer-1" },
      data: { materialRevision: { increment: 1 } },
    });
    expect(transaction.cuttingPlan.updateMany).toHaveBeenCalledWith({
      where: { offerId: "offer-1", status: "DRAFT" },
      data: { status: "ARCHIVED" },
    });
  });

  it("groups active profiles for exact family selection", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { pieceId: "p1", piece: { profile: "IPE200" } },
      { pieceId: "p1", piece: { profile: "IPE200" } },
      { pieceId: "p2", piece: { profile: "IPE200" } },
      { pieceId: "p3", piece: { profile: "DEMI-IPE400" } },
      { pieceId: "p4", piece: { profile: "L80*80*8" } },
      { pieceId: "p4", piece: { profile: "L80*80*8" } },
      { pieceId: "p4", piece: { profile: "L80*80*8" } },
      { pieceId: "p4", piece: { profile: "L80*80*8" } },
    ]);
    const service = createService({ pieceUnit: { findMany } } as never);

    await expect(service.listAvailableProfiles()).resolves.toMatchObject({
      totalProfiles: 3,
      totalPieceRows: 4,
      profiles: [
        { profile: "IPE200", family: "IPE", pieceCount: 2, totalQuantity: 3 },
        { profile: "L80*80*8", family: "L", pieceCount: 1, totalQuantity: 4 },
        { profile: "DEMI-IPE400", family: "OTHER", pieceCount: 1, totalQuantity: 1 },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PENDING" }) }),
    );
  });

  it("aggregates selected profile requirements and records the preparation event", async () => {
    const historyEvent = {
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: { entityId: string } }) =>
          Promise.resolve({ entityId: data.entityId }),
        ),
    };
    const transaction = { historyEvent };
    const prisma = {
      pieceUnit: {
        findMany: vi.fn().mockResolvedValue([
          { pieceId: "p1", piece: { profile: "IPE200", lengthMm: 6000 } },
          { pieceId: "p1", piece: { profile: "IPE200", lengthMm: 6000 } },
          { pieceId: "p2", piece: { profile: "IPE200", lengthMm: 6000 } },
          { pieceId: "p2", piece: { profile: "IPE200", lengthMm: 6000 } },
          { pieceId: "p2", piece: { profile: "IPE200", lengthMm: 6000 } },
          { pieceId: "p3", piece: { profile: "IPE200", lengthMm: 3000 } },
        ]),
      },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    await expect(
      service.prepareFaconnage(actor, "offer-1", { profiles: ["IPE200", "IPE200"] }),
    ).resolves.toMatchObject({
      preparationId: expect.any(String),
      selectedProfiles: ["IPE200"],
      requirements: [
        { profile: "IPE200", lengthMm: 3000, quantity: 1 },
        { profile: "IPE200", lengthMm: 6000, quantity: 5 },
      ],
      summary: { selectedProfileCount: 1, pieceRows: 3, totalQuantity: 6, lengthCount: 2 },
    });
    expect(historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "FACONNAGE_PREPARATION_CREATED",
          entityType: "FACONNAGE_PREPARATION",
          entityId: expect.any(String),
        }),
      }),
    );
  });

  it("allows preparing still-pending units when the offer is READY", async () => {
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue({ status: "READY" }) },
      pieceUnit: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { pieceId: "piece-ready", piece: { profile: "IPE200", lengthMm: 3200 } },
          ]),
      },
      $transaction: vi.fn(
        async (callback: (tx: { historyEvent: { create: ReturnType<typeof vi.fn> } }) => unknown) =>
          callback({ historyEvent: { create: vi.fn().mockResolvedValue({}) } }),
      ),
    };
    const service = createService(prisma as never);
    await expect(
      service.prepareFaconnage(actor, "offer-ready", { profiles: ["IPE200"] }),
    ).resolves.toMatchObject({
      requirements: [{ profile: "IPE200", lengthMm: 3200, quantity: 1 }],
    });
  });

  it("validates image signatures and records a piece image audit event transactionally", async () => {
    const image = {
      id: "image-1",
      pieceId: "piece-1",
      uploadedById: "admin-1",
      storageKey: "pieces/piece-1/image-1.png",
      originalName: "piece.png",
      mimeType: "image/png",
      sizeBytes: 8,
      sortOrder: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const transaction = {
      piece: {
        findFirst: vi.fn().mockResolvedValue({ status: "PLANNED", units: [] }),
        findUnique: vi.fn().mockResolvedValue({ status: "PLANNED", offerId: "offer-1" }),
      },
      pieceImage: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue(image),
      },
      historyEvent: { create: vi.fn() },
    };
    const storage = {
      write: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      piece: {
        findFirst: vi.fn().mockResolvedValue({ status: "PLANNED", units: [] }),
        findUnique: vi.fn().mockResolvedValue({ status: "PLANNED", units: [] }),
      },
      pieceImage: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = new PiecesService(prisma as never, storage as never);

    await expect(
      service.addPieceImage(actor, "piece-1", {
        buffer: Buffer.from("89504e470d0a1a0a", "hex"),
        mimetype: "image/png",
        originalname: "piece.png",
        size: 8,
      }),
    ).resolves.toMatchObject({
      id: "image-1",
      mimeType: "image/png",
      url: expect.stringContaining("image-1"),
    });
    expect(storage.write).toHaveBeenCalledOnce();
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "PIECE_IMAGE_ADDED" }),
      }),
    );
  });

  it("rejects an image whose bytes do not match the declared MIME type", async () => {
    const storage = { write: vi.fn(), remove: vi.fn() };
    const prisma = { piece: { findFirst: vi.fn(), findUnique: vi.fn() } };
    const service = new PiecesService(prisma as never, storage as never);

    await expect(
      service.addPieceImage(actor, "piece-1", {
        buffer: Buffer.from("not-an-image"),
        mimetype: "image/png",
        originalname: "piece.png",
        size: 12,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.write).not.toHaveBeenCalled();
    expect(prisma.piece.findUnique).not.toHaveBeenCalled();
  });
});
