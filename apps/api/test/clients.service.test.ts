import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import type { PieceImageStorage } from "../src/pieces/piece-image.storage";
import { ClientsService } from "../src/clients/clients.service";

const actor = {
  user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
  sessionId: "session-1",
  tokenHash: "token-hash",
};

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    name: "NIM Client",
    nameKey: "nim client",
    taxId: "1234567A/A/M/000",
    taxIdKey: "1234567AAM000",
    phoneNumbers: ["+216 70 000 000"],
    emails: ["info@example.tn"],
    imageStorageKey: null,
    archivedAt: null,
    createdById: actor.user.id,
    createdAt: new Date("2026-11-01T09:00:00Z"),
    updatedAt: new Date("2026-11-01T09:00:00Z"),
    ...overrides,
  };
}

function makeService(
  prisma: Record<string, unknown>,
  storage = { write: vi.fn(), read: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) },
) {
  return {
    service: new ClientsService(
      prisma as unknown as PrismaService,
      storage as unknown as PieceImageStorage,
    ),
    storage,
  };
}

describe("ClientsService", () => {
  it("creates a normalized client and records an audit event in the same transaction", async () => {
    const client = makeClient({
      name: "Atelier du Nord",
      nameKey: "atelier du nord",
      taxId: "1234567A/A/M/000",
      taxIdKey: "1234567AAM000",
      phoneNumbers: ["+216 70 000 000"],
      emails: ["contact@atelier.tn"],
    });
    const tx = {
      client: { create: vi.fn().mockResolvedValue(client) },
      historyEvent: { create: vi.fn().mockResolvedValue({ id: "history-1" }) },
    };
    const prisma = {
      client: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const { service } = makeService(prisma);

    await expect(
      service.create(actor, {
        name: "  Atelier   du Nord ",
        taxId: "1234567A/A/M/000",
        phoneNumbers: ["+216 70 000 000", "+216 70 000 000"],
        emails: ["contact@atelier.tn"],
      }),
    ).resolves.toMatchObject({
      id: "client-1",
      name: "Atelier du Nord",
      taxId: "1234567A/A/M/000",
      phoneNumbers: ["+216 70 000 000"],
      emails: ["contact@atelier.tn"],
    });
    expect(tx.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nameKey: "atelier du nord",
        phoneNumbers: ["+216 70 000 000"],
        createdById: actor.user.id,
      }),
    });
    expect(tx.historyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "CLIENT_CREATED",
        entityType: "CLIENT",
        entityId: "client-1",
      }),
    });
  });

  it("rejects duplicate client names and fiscal identifiers", async () => {
    const prisma = {
      client: {
        findFirst: vi.fn().mockResolvedValue({ id: "client-existing", name: "NIM Client" }),
      },
    };
    const { service } = makeService(prisma);
    await expect(
      service.create(actor, {
        name: "nim client",
        taxId: "1234567A/A/M/000",
        phoneNumbers: ["+216 70 000 000"],
        emails: ["contact@example.tn"],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ nameKey: "nim client" }, { taxIdKey: "1234567AAM000" }],
        },
      }),
    );
  });

  it("validates the maximum contact counts and e-mail format on the server", async () => {
    const { service } = makeService({});
    await expect(
      service.create(actor, {
        name: "Example",
        phoneNumbers: ["12345", "12345", "12345", "12345"],
        emails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(actor, { name: "Example", phoneNumbers: [], emails: ["not-an-email"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires a fiscal identifier, a phone number and an e-mail when creating a client", async () => {
    const { service } = makeService({});
    await expect(
      service.create(actor, { name: "Incomplete", taxId: "", phoneNumbers: [], emails: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(actor, {
        name: "Incomplete",
        taxId: "1234567A/A/M/000",
        phoneNumbers: ["+216 70 000 000"],
        emails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not clear optional contact lists when a partial edit omits them", async () => {
    const tx = {
      client: {
        update: vi
          .fn()
          .mockResolvedValue(
            makeClient({ name: "NIM Client Updated", nameKey: "nim client updated" }),
          ),
      },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      client: { findUnique: vi.fn().mockResolvedValue(makeClient()) },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const { service } = makeService(prisma);
    vi.spyOn(service, "get").mockResolvedValue({ id: "client-1" } as never);

    await service.update(actor, "client-1", { name: "NIM Client Updated" });
    const updateData = tx.client.update.mock.calls[0]?.[0].data;
    expect(updateData).toEqual({ name: "NIM Client Updated", nameKey: "nim client updated" });
  });

  it("uses reversible archive and restore actions with history", async () => {
    const tx = {
      client: { update: vi.fn().mockResolvedValue(makeClient()) },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      client: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(makeClient())
          .mockResolvedValueOnce(makeClient({ archivedAt: new Date("2026-11-01T10:00:00Z") })),
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const { service } = makeService(prisma);
    vi.spyOn(service, "get").mockResolvedValue({ id: "client-1" } as never);

    await expect(service.archive(actor, "client-1")).resolves.toEqual({ success: true });
    await service.restore(actor, "client-1");
    expect(tx.historyEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ eventType: "CLIENT_ARCHIVED" }),
    });
    expect(tx.historyEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ eventType: "CLIENT_RESTORED" }),
    });
  });

  it("paginates server-side and excludes archived rows by default", async () => {
    const client = makeClient({ _count: { offers: 3 } });
    const prisma = {
      client: {
        findMany: vi.fn().mockResolvedValue([client]),
        count: vi.fn().mockResolvedValue(21),
      },
    };
    const { service } = makeService(prisma);
    const result = await service.list({ search: "NIM", page: 2, pageSize: 10 });
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          OR: [
            { name: { contains: "NIM", mode: "insensitive" } },
            { taxId: { contains: "NIM", mode: "insensitive" } },
          ],
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 21, totalPages: 3 });
    expect(result.clients[0]).toMatchObject({ offerCount: 3, imageUrl: null });
  });

  it("filters active, archived, and all clients on the server", async () => {
    for (const [status, expectedWhere] of [
      ["ACTIVE", { archivedAt: null }],
      ["ARCHIVED", { archivedAt: { not: null } }],
      ["ALL", {}],
    ] as const) {
      const prisma = {
        client: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      };
      const { service } = makeService(prisma);
      await service.list({ status });
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
    }
  });

  it("exports the complete filtered client directory as an Excel workbook", async () => {
    const client = makeClient({ _count: { offers: 4 } });
    const prisma = { client: { findMany: vi.fn().mockResolvedValue([client]) } };
    const { service } = makeService(prisma);
    const buffer = await service.exportWorkbook({ search: "NIM", status: "ALL" });
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Clients!, { header: 1 });

    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: "NIM", mode: "insensitive" } },
            { taxId: { contains: "NIM", mode: "insensitive" } },
          ],
        },
      }),
    );
    expect(rows[0]).toEqual([
      "Nom / raison sociale",
      "Matricule fiscal",
      "Téléphones",
      "E-mails",
      "Affaires liées",
      "État",
      "Créé le",
      "Modifié le",
    ]);
    expect(rows[1]).toEqual([
      "NIM Client",
      "1234567A/A/M/000",
      "+216 70 000 000",
      "info@example.tn",
      4,
      "Actif",
      client.createdAt.toISOString(),
      client.updatedAt.toISOString(),
    ]);
  });

  it("rejects invalid client export filters", async () => {
    const { service } = makeService({});
    await expect(service.exportData({ status: "DELETED" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects image data whose MIME declaration does not match its signature", async () => {
    const prisma = { client: { findUnique: vi.fn().mockResolvedValue(makeClient()) } };
    const { service, storage } = makeService(prisma);
    await expect(
      service.replacePhoto(actor, "client-1", {
        buffer: Buffer.from("not a png"),
        mimetype: "image/png",
        originalname: "photo.png",
        size: 9,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it("removes a client image while retaining a photo-removal audit event", async () => {
    const tx = {
      client: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      client: {
        findUnique: vi
          .fn()
          .mockResolvedValue(makeClient({ imageStorageKey: "clients/client-1/photo.jpg" })),
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const { service, storage } = makeService(prisma);

    await expect(service.removePhoto(actor, "client-1")).resolves.toEqual({ success: true });
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: { imageStorageKey: null },
    });
    expect(tx.historyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "CLIENT_PHOTO_REMOVED", entityType: "CLIENT" }),
    });
    expect(storage.remove).toHaveBeenCalledWith("clients/client-1/photo.jpg");
  });
});
