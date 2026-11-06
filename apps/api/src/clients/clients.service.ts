import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { z } from "zod";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PieceImageStorage } from "../pieces/piece-image.storage";
import { parseListSort } from "../list-sorting";

const phoneSchema = z
  .string()
  .trim()
  .min(5)
  .max(32)
  .regex(/^[+\d().\s/-]+$/)
  .refine((value) => /\d/u.test(value), "Le numéro doit contenir au moins un chiffre.");
const emailSchema = z.string().trim().email().max(254);
const clientFields = {
  name: z.string().trim().min(2).max(160),
  taxId: z.string().trim().max(64).optional().nullable(),
  phoneNumbers: z.array(phoneSchema).max(3).default([]),
  emails: z.array(emailSchema).max(2).default([]),
};
const createClientSchema = z.object({
  name: clientFields.name,
  taxId: z.string().trim().min(1).max(64),
  phoneNumbers: z.array(phoneSchema).min(1).max(3),
  emails: z.array(emailSchema).min(1).max(2),
});
const updateClientSchema = z
  .object({
    name: clientFields.name.optional(),
    taxId: clientFields.taxId,
    phoneNumbers: z.array(phoneSchema).max(3).optional(),
    emails: z.array(emailSchema).max(2).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Modifiez au moins un champ.");

type ClientDirectoryStatus = "ACTIVE" | "ARCHIVED" | "ALL";

type ClientListOptions = {
  search?: string;
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
  status?: string;
  sortBy?: string;
  sortDirection?: string;
};

type UploadedClientImage = { buffer: Buffer; mimetype: string; originalname: string; size: number };

function nameKey(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("fr-FR").replace(/\s+/g, " ");
}

function taxIdKey(value: string | null | undefined): string | null {
  const key =
    value
      ?.normalize("NFKC")
      .toLocaleUpperCase("fr-FR")
      .replace(/[^\p{L}\p{N}]/gu, "") ?? "";
  return key || null;
}

function cleanContacts(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clientSummary(client: {
  id: string;
  name: string;
  taxId: string | null;
  phoneNumbers: string[];
  emails: string[];
  imageStorageKey: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { offers: number };
}) {
  return {
    id: client.id,
    name: client.name,
    taxId: client.taxId,
    phoneNumbers: client.phoneNumbers,
    emails: client.emails,
    imageUrl: client.imageStorageKey ? `/clients/${encodeURIComponent(client.id)}/photo` : null,
    archivedAt: client.archivedAt?.toISOString() ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    offerCount: client._count?.offers ?? 0,
  };
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PieceImageStorage) private readonly imageStorage: PieceImageStorage,
  ) {}

  private async requireClient(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client)
      throw new NotFoundException({ code: "CLIENT_NOT_FOUND", message: "Client introuvable." });
    return client;
  }

  private listCriteria(input: ClientListOptions = {}) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const search = input.search?.trim();
    const status = input.status ?? (input.includeArchived ? "ALL" : "ACTIVE");
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      ![10, 20, 50].includes(pageSize) ||
      !["ACTIVE", "ARCHIVED", "ALL"].includes(status)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Les filtres du répertoire clients sont invalides.",
      });
    }
    if (search && search.length > 80) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    }
    const where: Prisma.ClientWhereInput = {
      ...(status === "ACTIVE" ? { archivedAt: null } : {}),
      ...(status === "ARCHIVED" ? { archivedAt: { not: null } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { taxId: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    return { page, pageSize, status: status as ClientDirectoryStatus, where };
  }

  async list(input: ClientListOptions = {}) {
    const { page, pageSize, where } = this.listCriteria(input);
    const sort = parseListSort(input.sortBy, input.sortDirection, ["name", "taxId", "offers", "status"] as const, { sortBy: "name", sortDirection: "asc" });
    const orderBy: Prisma.ClientOrderByWithRelationInput[] = sort.sortBy === "offers"
      ? [{ offers: { _count: sort.sortDirection } }, { name: "asc" }, { id: "asc" }]
      : sort.sortBy === "status"
        ? [{ archivedAt: sort.sortDirection }, { name: "asc" }, { id: "asc" }]
        : [{ [sort.sortBy]: sort.sortDirection }, { id: "asc" }];
    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        include: { _count: { select: { offers: true } } },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);
    return {
      clients: clients.map(clientSummary),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      sorting: sort,
    };
  }

  async exportData(input: ClientListOptions = {}) {
    const { where } = this.listCriteria({ ...input, page: 1, pageSize: 20 });
    const clients = await this.prisma.client.findMany({
      where,
      include: { _count: { select: { offers: true } } },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }, { id: "asc" }],
    });
    return clients.map(clientSummary);
  }

  async exportWorkbook(input: ClientListOptions = {}): Promise<Buffer> {
    const clients = await this.exportData(input);
    const rows = clients.map((client) => [
      client.name,
      client.taxId ?? "",
      client.phoneNumbers.join(" · "),
      client.emails.join(" · "),
      client.offerCount,
      client.archivedAt ? "Archivé" : "Actif",
      client.createdAt,
      client.updatedAt,
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Nom / raison sociale",
        "Matricule fiscal",
        "Téléphones",
        "E-mails",
        "Affaires liées",
        "État",
        "Créé le",
        "Modifié le",
      ],
      ...rows,
    ]);
    sheet["!cols"] = [
      { wch: 32 },
      { wch: 24 },
      { wch: 30 },
      { wch: 32 },
      { wch: 16 },
      { wch: 14 },
      { wch: 24 },
      { wch: 24 },
    ];
    if (clients.length > 0) sheet["!autofilter"] = { ref: `A1:H${clients.length + 1}` };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Clients");
    return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  }

  async get(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { _count: { select: { offers: true } } },
    });
    if (!client)
      throw new NotFoundException({ code: "CLIENT_NOT_FOUND", message: "Client introuvable." });
    return clientSummary(client);
  }

  async create(actor: AuthContext, input: unknown) {
    const parsed = createClientSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "CLIENT_VALIDATION_ERROR",
        message: "Vérifiez les informations du client.",
        details: parsed.error.flatten(),
      });
    const name = parsed.data.name.trim().replace(/\s+/g, " ");
    const normalizedName = nameKey(name);
    const taxId = parsed.data.taxId?.trim() || null;
    const taxKey = taxIdKey(taxId);
    const existing = await this.prisma.client.findFirst({
      where: { OR: [{ nameKey: normalizedName }, ...(taxKey ? [{ taxIdKey: taxKey }] : [])] },
      select: { id: true, name: true },
    });
    if (existing)
      throw new ConflictException({
        code: "CLIENT_ALREADY_EXISTS",
        message:
          existing.name === name
            ? "Ce client existe déjà. Sélectionnez-le dans la liste."
            : "Un client avec ce nom ou matricule fiscal existe déjà.",
      });
    try {
      const client = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            name,
            nameKey: normalizedName,
            taxId,
            taxIdKey: taxKey,
            phoneNumbers: cleanContacts(parsed.data.phoneNumbers),
            emails: cleanContacts(parsed.data.emails).map((email) =>
              email.toLocaleLowerCase("fr-FR"),
            ),
            createdById: actor.user.id,
          },
        });
        await tx.historyEvent.create({
          data: {
            eventType: "CLIENT_CREATED",
            entityType: "CLIENT",
            entityId: created.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: { name: created.name, taxId: created.taxId },
          },
        });
        return created;
      });
      return clientSummary({ ...client, _count: { offers: 0 } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "CLIENT_ALREADY_EXISTS",
          message: "Un client avec ce nom ou matricule fiscal existe déjà.",
        });
      }
      throw error;
    }
  }

  async update(actor: AuthContext, id: string, input: unknown) {
    const parsed = updateClientSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "CLIENT_VALIDATION_ERROR",
        message: "Vérifiez les informations du client.",
        details: parsed.error.flatten(),
      });
    const current = await this.requireClient(id);
    if (current.archivedAt)
      throw new BadRequestException({
        code: "CLIENT_ARCHIVED",
        message: "Restaurez le client avant de le modifier.",
      });
    const name = parsed.data.name?.trim().replace(/\s+/g, " ");
    const taxId = parsed.data.taxId === undefined ? undefined : parsed.data.taxId?.trim() || null;
    const taxKey = taxId === undefined ? undefined : taxIdKey(taxId);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.client.update({
          where: { id },
          data: {
            ...(name ? { name, nameKey: nameKey(name) } : {}),
            ...(taxId !== undefined ? { taxId, taxIdKey: taxKey } : {}),
            ...(parsed.data.phoneNumbers
              ? { phoneNumbers: cleanContacts(parsed.data.phoneNumbers) }
              : {}),
            ...(parsed.data.emails
              ? {
                  emails: cleanContacts(parsed.data.emails).map((email) =>
                    email.toLocaleLowerCase("fr-FR"),
                  ),
                }
              : {}),
          },
        });
        await tx.historyEvent.create({
          data: {
            eventType: "CLIENT_UPDATED",
            entityType: "CLIENT",
            entityId: id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: { changedFields: Object.keys(parsed.data), name: result.name },
          },
        });
        return result;
      });
      return this.get(updated.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "CLIENT_ALREADY_EXISTS",
          message: "Un client avec ce nom ou matricule fiscal existe déjà.",
        });
      }
      throw error;
    }
  }

  async archive(actor: AuthContext, id: string) {
    const client = await this.requireClient(id);
    if (client.archivedAt) return { success: true as const };
    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { archivedAt: new Date() } });
      await tx.historyEvent.create({
        data: {
          eventType: "CLIENT_ARCHIVED",
          entityType: "CLIENT",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { name: client.name },
        },
      });
    });
    return { success: true as const };
  }

  async restore(actor: AuthContext, id: string) {
    const client = await this.requireClient(id);
    if (!client.archivedAt) return this.get(id);
    const restored = await this.prisma.$transaction(async (tx) => {
      const result = await tx.client.update({ where: { id }, data: { archivedAt: null } });
      await tx.historyEvent.create({
        data: {
          eventType: "CLIENT_RESTORED",
          entityType: "CLIENT",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { name: client.name },
        },
      });
      return result;
    });
    return this.get(restored.id);
  }

  async replacePhoto(actor: AuthContext, id: string, file: UploadedClientImage | undefined) {
    const client = await this.requireClient(id);
    if (client.archivedAt)
      throw new BadRequestException({
        code: "CLIENT_ARCHIVED",
        message: "Restaurez le client avant de modifier sa photo.",
      });
    if (!file?.buffer)
      throw new BadRequestException({
        code: "CLIENT_PHOTO_REQUIRED",
        message: "Sélectionnez une image.",
      });
    if (file.size <= 0 || file.size > 5 * 1024 * 1024)
      throw new BadRequestException({
        code: "CLIENT_PHOTO_SIZE",
        message: "L’image doit peser au maximum 5 Mo.",
      });
    const mimeType = this.detectImageMime(file.buffer);
    if (!mimeType || mimeType !== file.mimetype)
      throw new BadRequestException({
        code: "CLIENT_PHOTO_TYPE",
        message: "Utilisez une image JPEG, PNG ou WebP valide.",
      });
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
    const storageKey = `clients/${id}/${randomUUID()}.${extension}`;
    await this.imageStorage.write(storageKey, file.buffer);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data: { imageStorageKey: storageKey } });
        await tx.historyEvent.create({
          data: {
            eventType: "CLIENT_PHOTO_UPDATED",
            entityType: "CLIENT",
            entityId: id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: { mimeType, sizeBytes: file.size },
          },
        });
      });
    } catch (error) {
      await this.imageStorage
        .remove(storageKey)
        .catch((cleanupError) =>
          this.logger.error("Impossible de nettoyer la photo client après échec.", cleanupError),
        );
      throw error;
    }
    if (client.imageStorageKey)
      await this.imageStorage
        .remove(client.imageStorageKey)
        .catch((error) =>
          this.logger.error("Impossible de supprimer l’ancienne photo client.", error),
        );
    return this.get(id);
  }

  async removePhoto(actor: AuthContext, id: string) {
    const client = await this.requireClient(id);
    if (!client.imageStorageKey) return { success: true as const };
    if (client.archivedAt)
      throw new BadRequestException({
        code: "CLIENT_ARCHIVED",
        message: "Restaurez le client avant de modifier sa photo.",
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { imageStorageKey: null } });
      await tx.historyEvent.create({
        data: {
          eventType: "CLIENT_PHOTO_REMOVED",
          entityType: "CLIENT",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { photoRemoved: true },
        },
      });
    });
    await this.imageStorage
      .remove(client.imageStorageKey)
      .catch((error) =>
        this.logger.error("Impossible de supprimer le fichier photo client.", error),
      );
    return { success: true as const };
  }

  async readPhoto(id: string) {
    const client = await this.requireClient(id);
    if (!client.imageStorageKey)
      throw new NotFoundException({
        code: "CLIENT_PHOTO_NOT_FOUND",
        message: "Aucune photo n’est enregistrée pour ce client.",
      });
    try {
      const buffer = await this.imageStorage.read(client.imageStorageKey);
      const extension = client.imageStorageKey.split(".").at(-1);
      const mimeType =
        extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : "image/webp";
      return { buffer, mimeType };
    } catch {
      throw new NotFoundException({
        code: "CLIENT_PHOTO_FILE_NOT_FOUND",
        message: "La photo du client est indisponible.",
      });
    }
  }

  private detectImageMime(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    )
      return "image/png";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
      return "image/jpeg";
    if (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    )
      return "image/webp";
    return null;
  }
}
