import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Piece, PieceProductionStatus, PieceUnitStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
  calculateTotalWeightKg,
  classifyProfile,
  createPieceSchema,
  faconnagePreparationSchema,
  normalizeProfile,
  pieceImportSchema,
  pieceListQuerySchema,
  updatePieceSchema,
} from "@nim/validation";
import type {
  AvailableProfile,
  FaconnagePreparation,
  ManagedPiece,
  PieceDetail,
  PieceImportColumn,
  PieceImportPreview,
  PieceImportResult,
  PieceImportRow,
  PieceImage,
  PiecePriority,
  PieceStatus,
  PieceUnitDetail,
} from "@nim/types";
import type { CreatePieceInput } from "@nim/validation";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { PieceImageStorage } from "./piece-image.storage";

type PieceImageRecord = {
  id: string;
  pieceId: string;
  uploadedById: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  createdAt: Date;
};

type PieceWithUnitStatuses = Piece & {
  units: Array<{ status: PieceUnitStatus; productionStatus: PieceProductionStatus }>;
  images?: PieceImageRecord[];
  _count?: { images: number };
};

type ManagedPieceListProjection = ManagedPiece & {
  offerId: string;
  productionStatusCounts: Record<PieceProductionStatus, number>;
  isUnstarted: boolean;
};

type UploadedPieceImage = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const pieceImageSelect = {
  id: true,
  pieceId: true,
  uploadedById: true,
  storageKey: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  sortOrder: true,
  createdAt: true,
} as const;

const pieceDetailInclude = {
  units: {
    include: {
      currentMachine: { select: { id: true, name: true } },
      currentOperator: { select: { id: true, displayName: true } },
      currentProductionOperator: { select: { id: true, displayName: true } },
      assignments: {
        where: { active: true },
        include: { machine: { select: { id: true, name: true } } },
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { sequenceNumber: "asc" },
  },
  images: {
    select: pieceImageSelect,
    orderBy: { sortOrder: "asc" },
  },
} as const;

type PieceWithDetails = Prisma.PieceGetPayload<{ include: typeof pieceDetailInclude }>;
type PreparedImport = {
  filename: string;
  sourceFormat: PieceImportPreview["sourceFormat"];
  preview: PieceImportPreview;
  validInputs: Array<{ row: number; input: CreatePieceInput }>;
};

type ParsedImportRecords = {
  records: string[][];
  sourceFormat: PieceImportPreview["sourceFormat"];
};

const importHeaderAliases: Record<string, string> = {
  reference: "reference",
  repere: "reference",
  quantity: "quantity",
  qte: "quantity",
  profile: "profile",
  profil: "profile",
  lengthmm: "lengthMm",
  long: "lengthMm",
  longueur: "lengthMm",
  unitweightkg: "unitWeightKg",
  poids: "unitWeightKg",
  totalweightkg: "totalWeightKg",
  pdstot: "totalWeightKg",
  qualite: "quality",
  quality: "quality",
  designation: "designation",
  priority: "priority",
  duedate: "dueDate",
  surface: "ignored",
};

const importColumnLabels: Record<string, string> = {
  reference: "Repère",
  quantity: "Qté",
  profile: "Profil",
  quality: "Qualité",
  lengthMm: "Longueur (mm)",
  unitWeightKg: "Poids unitaire (kg)",
  totalWeightKg: "Poids total (kg)",
  designation: "Désignation",
  priority: "Priorité",
  dueDate: "Date prévue",
  ignored: "Ignorée",
};

const pieceImageRules = {
  maxBytes: 5 * 1024 * 1024,
  maxPerPiece: 10,
  mimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]),
} as const;

function normalizeImportHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function stripMarkup(value: string): string {
  return decodeHtml(value.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).trim();
}

function parseHtmlTableRecords(content: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of content.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = [...rowMatch[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(
      (cell) => stripMarkup(cell[1]),
    );
    if (row.length > 0) rows.push(row);
  }
  return rows;
}

function parseSpreadsheetRecords(buffer: Buffer): string[][] {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = workbook.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
  } catch {
    throw new BadRequestException({
      code: "INVALID_EXCEL_FORMAT",
      message: "Le fichier Excel est illisible ou ne contient aucune feuille exploitable.",
    });
  }
}

function decodeImportBuffer(content: string, encoding: "text" | "base64"): Buffer {
  if (encoding === "base64") {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length % 4 === 1) {
      throw new BadRequestException({
        code: "INVALID_EXCEL_FORMAT",
        message: "Le contenu binaire du fichier est invalide.",
      });
    }
    return Buffer.from(content, "base64");
  }
  return Buffer.from(content, "utf8");
}

function parseImportRecords(
  filename: string,
  content: string,
  encoding: "text" | "base64",
): ParsedImportRecords {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (extension === "csv") {
    const csvContent =
      encoding === "base64" ? decodeImportBuffer(content, encoding).toString("utf8") : content;
    return { records: parseCsvRecords(csvContent), sourceFormat: "CSV" };
  }
  if (extension !== "xls" && extension !== "xlsx") {
    throw new BadRequestException({
      code: "UNSUPPORTED_IMPORT_FORMAT",
      message: "Utilisez un fichier CSV, XLS ou XLSX.",
    });
  }

  const buffer = decodeImportBuffer(content, encoding);
  if (buffer.length > 5_000_000) {
    throw new BadRequestException({
      code: "IMPORT_TOO_LARGE",
      message: "Un import est limité à 5 Mo.",
    });
  }
  const utf8Text = buffer.toString("utf8");
  const htmlText = utf8Text.includes("\uFFFD") ? buffer.toString("latin1") : utf8Text;
  if (extension === "xls" && /<\s*(?:html|table|meta)\b/i.test(htmlText)) {
    return { records: parseHtmlTableRecords(htmlText), sourceFormat: "TEKLA_XLS" };
  }
  return { records: parseSpreadsheetRecords(buffer), sourceFormat: "XLSX" };
}

function parseLocalizedNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/,(?=\d{1,3}(?:$|\D))/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function weightTolerance(expected: number): number {
  return Math.max(1, expected * 0.01);
}

function parseCsvRecords(content: string): string[][] {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"' && value.length === 0) quoted = true;
    else if (character === delimiter) {
      record.push(value.trim());
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      record.push(value.trim());
      value = "";
      if (record.some((item) => item.length > 0)) records.push(record);
      record = [];
    } else value += character;
  }
  if (quoted)
    throw new BadRequestException({
      code: "INVALID_CSV",
      message: "Le fichier CSV contient un guillemet non fermé.",
    });
  record.push(value.trim());
  if (record.some((item) => item.length > 0)) records.push(record);
  return records;
}

@Injectable()
export class PiecesService {
  private readonly logger = new Logger(PiecesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PieceImageStorage)
    private readonly imageStorage: PieceImageStorage = new PieceImageStorage(),
  ) {}

  private async assertOfferActive(offerId: string): Promise<void> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { status: true },
    });
    if (!offer) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    }
    if (offer.status !== "DRAFT") {
      throw new BadRequestException({
        code: "OFFER_PIECES_LOCKED",
        message:
          offer.status === "ARCHIVED"
            ? "Cette offre est archivée et ne peut plus recevoir de modifications."
            : "Les pièces sont verrouillées dès qu’un plan est validé. Repassez l’offre en brouillon avant de modifier ses pièces ou son façonnage.",
      });
    }
  }

  private async assertOfferCanPrepareFaconnage(offerId: string): Promise<void> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { status: true },
    });
    if (!offer) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    }
    if (offer.status !== "DRAFT" && offer.status !== "READY") {
      throw new BadRequestException({
        code: "OFFER_FACONNAGE_LOCKED",
        message: "Le façonnage est disponible uniquement avant le démarrage de la production.",
      });
    }
  }

  private toPieceImage(image: PieceImageRecord): PieceImage {
    const mimeType = image.mimeType as PieceImage["mimeType"];
    return {
      id: image.id,
      originalName: image.originalName,
      mimeType,
      sizeBytes: image.sizeBytes,
      sortOrder: image.sortOrder,
      url: `/pieces/${encodeURIComponent(image.pieceId)}/images/${encodeURIComponent(image.id)}`,
      createdAt: image.createdAt.toISOString(),
    };
  }

  private toManagedPiece(piece: PieceWithUnitStatuses): ManagedPieceListProjection {
    const coverImage = piece.images?.[0];
    const productionStatusCounts: Record<PieceProductionStatus, number> = {
      PENDING: 0,
      FACONNEE: 0,
      AFFECTEE: 0,
      LANCEE: 0,
      FABRIQUEE: 0,
    };
    for (const unit of piece.units) productionStatusCounts[unit.productionStatus] += 1;
    return {
      id: piece.id,
      offerId: piece.offerId,
      productionStatusCounts,
      reference: piece.reference,
      quantity: piece.quantity,
      completedUnits: piece.units.filter(
        (unit) => unit.status === "COMPLETED" || unit.status === "ACCEPTED",
      ).length,
      profile: piece.profile,
      quality: piece.quality,
      lengthMm: piece.lengthMm,
      unitWeightKg: piece.unitWeightKg === null ? null : Number(piece.unitWeightKg),
      totalWeightKg: piece.totalWeightKg === null ? null : Number(piece.totalWeightKg),
      designation: piece.designation,
      priority: piece.priority as PiecePriority,
      dueDate: piece.dueDate?.toISOString() ?? null,
      status: piece.status as PieceStatus,
      createdById: piece.createdById,
      createdAt: piece.createdAt.toISOString(),
      updatedAt: piece.updatedAt.toISOString(),
      imageCount: piece._count?.images ?? piece.images?.length ?? 0,
      coverImageUrl: coverImage
        ? `/pieces/${encodeURIComponent(piece.id)}/images/${encodeURIComponent(coverImage.id)}`
        : null,
      isUnstarted:
        piece.units.length === piece.quantity &&
        piece.units.length > 0 &&
        piece.units.every((unit) => unit.status === "PENDING"),
    };
  }

  private async findPiece(id: string, offerId?: string): Promise<PieceWithUnitStatuses> {
    const piece = await this.prisma.piece.findFirst({
      where: { id, ...(offerId ? { offerId } : {}) },
      include: { units: { select: { status: true, productionStatus: true } } },
    });
    if (!piece)
      throw new NotFoundException({ code: "PIECE_NOT_FOUND", message: "Pièce introuvable." });
    return piece;
  }

  private toPieceUnitDetail(unit: PieceWithDetails["units"][number]): PieceUnitDetail {
    const assignment = unit.assignments[0] ?? null;
    return {
      id: unit.id,
      pieceId: unit.pieceId,
      sequenceNumber: unit.sequenceNumber,
      status: unit.status,
      productionStatus: unit.productionStatus,
      qualityStatus: unit.qualityStatus,
      currentMachineId: unit.currentMachineId,
      currentMachineName: unit.currentMachine?.name ?? null,
      currentOperatorId: unit.currentOperatorId,
      currentOperatorName: unit.currentOperator?.displayName ?? null,
      currentProductionOperatorId: unit.currentProductionOperatorId,
      currentProductionOperatorName: unit.currentProductionOperator?.displayName ?? null,
      startedAt: unit.startedAt?.toISOString() ?? null,
      manufacturedAt: unit.manufacturedAt?.toISOString() ?? null,
      controlledAt: unit.controlledAt?.toISOString() ?? null,
      qualityResult:
        unit.qualityResult === "CONFORM" || unit.qualityResult === "NON_CONFORM"
          ? unit.qualityResult
          : null,
      activeAssignment: assignment
        ? {
            id: assignment.id,
            machineId: assignment.machineId,
            machineName: assignment.machine.name,
            queuePosition: assignment.queuePosition,
            assignedAt: assignment.assignedAt.toISOString(),
            reason: assignment.reason,
          }
        : null,
    };
  }

  async getPiece(id: string, offerId?: string): Promise<PieceDetail> {
    const piece = await this.prisma.piece.findFirst({
      where: { id, ...(offerId ? { offerId } : {}) },
      include: pieceDetailInclude,
    });
    if (!piece)
      throw new NotFoundException({ code: "PIECE_NOT_FOUND", message: "Pièce introuvable." });
    return {
      ...this.toManagedPiece(piece),
      units: piece.units.map((unit) => this.toPieceUnitDetail(unit)),
      images: (piece.images ?? []).map((image) => this.toPieceImage(image)),
    };
  }

  async addPieceImage(
    actor: AuthContext,
    pieceId: string,
    file: UploadedPieceImage | undefined,
  ): Promise<PieceImage> {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: "PIECE_IMAGE_REQUIRED",
        message: "Sélectionnez une image à importer.",
      });
    }
    if (!pieceImageRules.mimeTypes.has(file.mimetype)) {
      throw new BadRequestException({
        code: "PIECE_IMAGE_TYPE_NOT_ALLOWED",
        message: "Utilisez une image JPEG, PNG ou WebP.",
      });
    }
    if (file.size <= 0 || file.size > pieceImageRules.maxBytes) {
      throw new BadRequestException({
        code: "PIECE_IMAGE_TOO_LARGE",
        message: "Chaque image doit peser au maximum 5 Mo.",
      });
    }
    const detectedMimeType = this.detectImageMime(file.buffer);
    if (!detectedMimeType || detectedMimeType !== file.mimetype) {
      throw new BadRequestException({
        code: "PIECE_IMAGE_CONTENT_INVALID",
        message: "Le contenu du fichier ne correspond pas à son type déclaré.",
      });
    }

    const target = await this.findPiece(pieceId);
    if (target.status === "ARCHIVED") {
      throw new BadRequestException({
        code: "PIECE_ARCHIVED",
        message: "Une pièce archivée ne peut plus recevoir d’image.",
      });
    }

    const currentCount = await this.prisma.pieceImage.count({ where: { pieceId } });
    if (currentCount >= pieceImageRules.maxPerPiece) {
      throw new BadRequestException({
        code: "PIECE_IMAGE_LIMIT_REACHED",
        message: "Une pièce peut contenir au maximum 10 images.",
      });
    }

    const imageId = randomUUID();
    const extension =
      detectedMimeType === "image/jpeg" ? "jpg" : detectedMimeType.slice("image/".length);
    const storageKey = `pieces/${pieceId}/${imageId}.${extension}`;
    const originalName = this.sanitizeOriginalName(file.originalname);
    await this.imageStorage.write(storageKey, file.buffer);

    try {
      const image = await this.prisma.$transaction(async (transaction) => {
        const latest = await transaction.piece.findUnique({
          where: { id: pieceId },
          select: { status: true },
        });
        if (!latest) {
          throw new NotFoundException({ code: "PIECE_NOT_FOUND", message: "Pièce introuvable." });
        }
        if (latest.status === "ARCHIVED") {
          throw new BadRequestException({
            code: "PIECE_ARCHIVED",
            message: "Une pièce archivée ne peut plus recevoir d’image.",
          });
        }
        const count = await transaction.pieceImage.count({ where: { pieceId } });
        if (count >= pieceImageRules.maxPerPiece) {
          throw new BadRequestException({
            code: "PIECE_IMAGE_LIMIT_REACHED",
            message: "Une pièce peut contenir au maximum 10 images.",
          });
        }
        const created = await transaction.pieceImage.create({
          data: {
            id: imageId,
            pieceId,
            uploadedById: actor.user.id,
            storageKey,
            originalName,
            mimeType: detectedMimeType,
            sizeBytes: file.size,
            sortOrder: count,
          },
          select: pieceImageSelect,
        });
        await transaction.historyEvent.create({
          data: {
            eventType: "PIECE_IMAGE_ADDED",
            entityType: "PIECE",
            entityId: pieceId,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              imageId,
              originalName,
              mimeType: detectedMimeType,
              sizeBytes: file.size,
            },
          },
        });
        return created;
      });
      return this.toPieceImage(image);
    } catch (error) {
      await this.imageStorage
        .remove(storageKey)
        .catch((cleanupError) =>
          this.logger.error(`Unable to clean up failed image upload ${storageKey}`, cleanupError),
        );
      throw error;
    }
  }

  async removePieceImage(
    actor: AuthContext,
    pieceId: string,
    imageId: string,
  ): Promise<{ success: true }> {
    const image = await this.prisma.pieceImage.findFirst({
      where: { id: imageId, pieceId },
      select: {
        ...pieceImageSelect,
        piece: { select: { status: true } },
      },
    });
    if (!image) {
      throw new NotFoundException({ code: "PIECE_IMAGE_NOT_FOUND", message: "Image introuvable." });
    }
    if (image.piece.status === "ARCHIVED") {
      throw new BadRequestException({
        code: "PIECE_ARCHIVED",
        message: "Une image d’une pièce archivée ne peut plus être supprimée.",
      });
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.pieceImage.delete({ where: { id: imageId } });
      await transaction.historyEvent.create({
        data: {
          eventType: "PIECE_IMAGE_REMOVED",
          entityType: "PIECE",
          entityId: pieceId,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            imageId,
            originalName: image.originalName,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
          },
        },
      });
    });

    await this.imageStorage.remove(image.storageKey).catch((error) => {
      this.logger.error(`Unable to remove deleted image file ${image.storageKey}`, error);
    });
    return { success: true };
  }

  async readPieceImage(
    pieceId: string,
    imageId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const image = await this.prisma.pieceImage.findFirst({
      where: { id: imageId, pieceId },
      select: { storageKey: true, mimeType: true, originalName: true },
    });
    if (!image) {
      throw new NotFoundException({ code: "PIECE_IMAGE_NOT_FOUND", message: "Image introuvable." });
    }
    try {
      return {
        buffer: await this.imageStorage.read(image.storageKey),
        mimeType: image.mimeType,
        originalName: image.originalName,
      };
    } catch {
      throw new NotFoundException({
        code: "PIECE_IMAGE_FILE_NOT_FOUND",
        message: "Le fichier image est indisponible.",
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

  private sanitizeOriginalName(value: string): string {
    const safe = basename(value || "piece-image")
      .replace(/[^a-zA-Z0-9._() -]/g, "_")
      .trim()
      .slice(0, 120);
    return safe || "piece-image";
  }

  private async prepareImport(offerId: string, input: unknown): Promise<PreparedImport> {
    await this.assertOfferActive(offerId);
    const parsedRequest = pieceImportSchema.safeParse(input);
    if (!parsedRequest.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Le fichier d’import est invalide.",
        details: parsedRequest.error.flatten(),
      });
    }

    const { records, sourceFormat } = parseImportRecords(
      parsedRequest.data.filename,
      parsedRequest.data.content,
      parsedRequest.data.encoding,
    );
    const headerIndex = records.findIndex((record) => {
      const mapped = record.map((header) => importHeaderAliases[normalizeImportHeader(header)]);
      return ["reference", "quantity", "profile", "lengthMm"].every((required) =>
        mapped.includes(required),
      );
    });
    if (headerIndex < 0) {
      throw new BadRequestException({
        code: "IMPORT_HEADERS_MISSING",
        message:
          "Colonnes requises manquantes : Repère, Profil, Qté, Qualité, Long., Poids, Pds Tot et Désignation.",
      });
    }

    const canonicalHeaders = records[headerIndex].map(
      (header) => importHeaderAliases[normalizeImportHeader(header)] ?? null,
    );
    const columns: PieceImportColumn[] = records[headerIndex].map((sourceHeader, index) => {
      const field = canonicalHeaders[index] ?? "unknown";
      return {
        sourceHeader: sourceHeader.trim(),
        field,
        label: importColumnLabels[field] ?? sourceHeader.trim(),
        ignored: field === "ignored",
      };
    });
    const requiredHeaders =
      sourceFormat === "CSV"
        ? ["reference", "quantity", "profile", "lengthMm"]
        : [
            "reference",
            "quantity",
            "profile",
            "quality",
            "lengthMm",
            "unitWeightKg",
            "totalWeightKg",
            "designation",
          ];
    const missingHeaders = requiredHeaders.filter((header) => !canonicalHeaders.includes(header));
    if (missingHeaders.length > 0) {
      throw new BadRequestException({
        code: "IMPORT_HEADERS_MISSING",
        message: `Colonnes manquantes : ${missingHeaders.join(", ")}.`,
      });
    }

    const rows: PieceImportRow[] = [];
    const validInputs: Array<{ row: number; input: CreatePieceInput }> = [];
    const referencesInFile = new Map<string, number>();
    for (let index = headerIndex + 1; index < records.length; index += 1) {
      const values = records[index];
      if (!values.some((value) => value.trim().length > 0)) continue;

      const raw: Record<string, string> = {};
      canonicalHeaders.forEach((header, column) => {
        if (header && header !== "ignored") raw[header] = values[column] ?? "";
      });
      if (!raw.reference && !raw.profile && !raw.quantity) continue;
      if (/^total\s+/i.test(raw.reference.trim())) continue;

      const rowNumber = index + 1;
      const quantity = parseLocalizedNumber(raw.quantity);
      const lengthMm = parseLocalizedNumber(raw.lengthMm);
      const unitWeightKg = parseLocalizedNumber(raw.unitWeightKg);
      const totalWeightKg = parseLocalizedNumber(raw.totalWeightKg);
      const errors: string[] = [];
      const warnings: string[] = [];

      if (raw.quantity.trim() && quantity === undefined)
        errors.push("quantité: valeur numérique invalide.");
      if (raw.lengthMm.trim() && lengthMm === undefined)
        errors.push("longueur: valeur numérique invalide.");
      if ((raw.unitWeightKg ?? "").trim() && unitWeightKg === undefined)
        errors.push("poids: valeur numérique invalide.");
      if ((raw.totalWeightKg ?? "").trim() && totalWeightKg === undefined)
        errors.push("pds tot: valeur numérique invalide.");

      const candidate = {
        reference: raw.reference,
        quantity: quantity ?? Number.NaN,
        profile: normalizeProfile(raw.profile),
        quality: raw.quality || (sourceFormat === "CSV" ? "UNKNOWN" : ""),
        lengthMm: lengthMm ?? Number.NaN,
        unitWeightKg,
        totalWeightKg,
        designation: raw.designation || (sourceFormat === "CSV" ? "À compléter" : ""),
        priority: raw.priority ? raw.priority.toUpperCase() : undefined,
        dueDate: raw.dueDate || undefined,
      };
      const parsed = createPieceSchema.safeParse(candidate);
      if (!parsed.success) {
        errors.push(
          ...parsed.error.issues.map(
            (issue) => `${issue.path.join(".") || "ligne"}: ${issue.message}`,
          ),
        );
      }

      if (
        parsed.success &&
        parsed.data.unitWeightKg !== undefined &&
        parsed.data.totalWeightKg !== undefined
      ) {
        const expected = calculateTotalWeightKg(parsed.data.unitWeightKg, parsed.data.quantity);
        const difference = Math.abs(
          parsed.data.totalWeightKg - (expected ?? parsed.data.totalWeightKg),
        );
        if (expected !== undefined && difference > weightTolerance(expected)) {
          warnings.push(
            `Écart de poids à vérifier : ${parsed.data.totalWeightKg.toFixed(3)} kg au lieu de ${expected.toFixed(3)} kg.`,
          );
        }
      }

      const normalizedReference = raw.reference.trim().toUpperCase();
      const previousRow = normalizedReference
        ? referencesInFile.get(normalizedReference)
        : undefined;
      if (previousRow) errors.push(`repère: doublon de la ligne ${previousRow}.`);
      if (normalizedReference && !previousRow) referencesInFile.set(normalizedReference, rowNumber);

      rows.push({
        row: rowNumber,
        values: {
          reference: raw.reference,
          quantity: raw.quantity,
          profile: raw.profile,
          quality: raw.quality,
          lengthMm: raw.lengthMm,
          unitWeightKg: raw.unitWeightKg,
          totalWeightKg: raw.totalWeightKg,
          designation: raw.designation,
        },
        valid: parsed.success && errors.length === 0,
        errors,
        warnings,
      });
      if (parsed.success && errors.length === 0)
        validInputs.push({ row: rowNumber, input: parsed.data });
    }

    if (rows.length === 0) {
      throw new BadRequestException({
        code: "EMPTY_WORKSHEET",
        message: "Aucune ligne de pièce exploitable n’a été trouvée.",
      });
    }
    if (rows.length > 1000) {
      throw new BadRequestException({
        code: "IMPORT_TOO_LARGE",
        message: "Un import est limité à 1000 lignes.",
      });
    }

    const references = validInputs.map(({ input }) => input.reference.toUpperCase());
    const existing = references.length
      ? await this.prisma.piece.findMany({
          where: { offerId, reference: { in: references } },
          select: { reference: true },
        })
      : [];
    const existingReferences = new Set(existing.map((piece) => piece.reference.toUpperCase()));
    for (const row of rows) {
      const reference = String(row.values.reference ?? "")
        .trim()
        .toUpperCase();
      if (row.valid && existingReferences.has(reference)) {
        row.valid = false;
        row.errors.push("repère: cette référence existe déjà.");
      }
    }
    const validRowNumbers = new Set(rows.filter((row) => row.valid).map((row) => row.row));
    return {
      filename: parsedRequest.data.filename,
      sourceFormat,
      preview: {
        filename: parsedRequest.data.filename,
        sourceFormat,
        columns,
        rowsTotal: rows.length,
        validRows: rows.filter((row) => row.valid).length,
        invalidRows: rows.filter((row) => !row.valid).length,
        warningRows: rows.filter((row) => row.warnings.length > 0).length,
        rows,
      },
      validInputs: validInputs.filter(({ row }) => validRowNumbers.has(row)),
    };
  }

  async previewImport(offerId: string, input: unknown): Promise<PieceImportPreview> {
    return (await this.prepareImport(offerId, input)).preview;
  }

  async commitImport(
    actor: AuthContext,
    offerId: string,
    input: unknown,
  ): Promise<PieceImportResult> {
    const prepared = await this.prepareImport(offerId, input);
    if (prepared.preview.invalidRows > 0) {
      throw new BadRequestException({
        code: "IMPORT_HAS_INVALID_ROWS",
        message: "Corrigez les lignes invalides avant de valider l’import.",
        details: prepared.preview,
      });
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const batch = await transaction.importBatch.create({
          data: {
            offerId,
            filename: prepared.filename,
            status: "COMMITTED",
            rowsTotal: prepared.preview.rowsTotal,
            rowsCreated: prepared.validInputs.length,
            rowsRejected: 0,
            errors: prepared.preview.rows
              .filter((row) => row.warnings.length > 0)
              .map((row) => ({ row: row.row, warnings: row.warnings })),
            completedAt: new Date(),
            createdById: actor.user.id,
          },
        });
        for (const { input: pieceInput } of prepared.validInputs) {
          const reference = pieceInput.reference.toUpperCase();
          const piece = await transaction.piece.create({
            data: {
              offerId,
              reference,
              quantity: pieceInput.quantity,
              profile: pieceInput.profile,
              quality: pieceInput.quality,
              lengthMm: pieceInput.lengthMm,
              unitWeightKg: pieceInput.unitWeightKg,
              totalWeightKg: pieceInput.totalWeightKg,
              designation: pieceInput.designation,
              priority: pieceInput.priority,
              dueDate: pieceInput.dueDate,
              createdById: actor.user.id,
              units: {
                createMany: {
                  data: Array.from({ length: pieceInput.quantity }, (_, index) => ({
                    sequenceNumber: index + 1,
                  })),
                },
              },
            },
          });
          await transaction.historyEvent.create({
            data: {
              eventType: "PIECE_IMPORTED",
              entityType: "PIECE",
              entityId: piece.id,
              actorUserId: actor.user.id,
              actorRole: actor.user.role,
              metadata: {
                offerId,
                batchId: batch.id,
                sourceFormat: prepared.sourceFormat,
                reference,
                quantity: piece.quantity,
                profile: piece.profile,
                lengthMm: piece.lengthMm,
                quality: piece.quality,
                totalWeightKg: piece.totalWeightKg,
                designation: piece.designation,
              },
            },
          });
        }
        if (prepared.validInputs.length > 0) {
          await transaction.offer.update({
            where: { id: offerId },
            data: { materialRevision: { increment: 1 } },
          });
          await transaction.cuttingPlan.updateMany({
            where: { offerId, status: "DRAFT" },
            data: { status: "ARCHIVED" },
          });
        }
        return {
          batchId: batch.id,
          filename: prepared.filename,
          sourceFormat: prepared.sourceFormat,
          status: "COMMITTED" as const,
          rowsTotal: prepared.preview.rowsTotal,
          rowsCreated: prepared.validInputs.length,
          rowsRejected: 0,
          warningRows: prepared.preview.warningRows,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "IMPORT_REFERENCE_CONFLICT",
          message: "Une référence importée existe déjà. Relancez un aperçu avant de valider.",
        });
      }
      throw error;
    }
  }

  async listAvailableProfiles(offerId?: string): Promise<{
    profiles: AvailableProfile[];
    totalProfiles: number;
    totalPieceRows: number;
  }> {
    const units = await this.prisma.pieceUnit.findMany({
      where: {
        status: "PENDING",
        assignments: { none: { active: true } },
        barMemberships: { none: { active: true } },
        piece: { ...(offerId ? { offerId } : {}), status: { not: "ARCHIVED" } },
      },
      select: { pieceId: true, piece: { select: { profile: true } } },
    });
    const grouped = new Map<string, AvailableProfile & { pieceIds: Set<string> }>();
    for (const unit of units) {
      const profile = normalizeProfile(unit.piece.profile);
      const current = grouped.get(profile);
      if (current) {
        current.pieceIds.add(unit.pieceId);
        current.totalQuantity += 1;
      } else {
        grouped.set(profile, {
          profile,
          family: classifyProfile(profile),
          pieceCount: 1,
          totalQuantity: 1,
          pieceIds: new Set([unit.pieceId]),
        });
      }
    }
    const profilesWithCounts = [...grouped.values()].map(({ pieceIds, ...profile }) => ({
      ...profile,
      pieceCount: pieceIds.size,
    }));
    const familyOrder = new Map(
      ["IPE", "HEA", "UPN", "L", "ROND", "OTHER"].map((value, index) => [value, index]),
    );
    const profiles = profilesWithCounts.sort(
      (left, right) =>
        (familyOrder.get(left.family) ?? 99) - (familyOrder.get(right.family) ?? 99) ||
        left.profile.localeCompare(right.profile, "fr", { numeric: true, sensitivity: "base" }),
    );
    return {
      profiles,
      totalProfiles: profiles.length,
      totalPieceRows: new Set(units.map((unit) => unit.pieceId)).size,
    };
  }

  async prepareFaconnage(
    actor: AuthContext,
    offerId: string,
    input: unknown,
  ): Promise<FaconnagePreparation> {
    await this.assertOfferCanPrepareFaconnage(offerId);
    const parsed = faconnagePreparationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "FACONNAGE_PROFILES_INVALID",
        message: "Sélectionnez au moins un profil détaillé valide.",
        details: parsed.error.flatten(),
      });
    }
    const selectedProfiles = [...new Set(parsed.data.profiles.map(normalizeProfile))];
    const units = await this.prisma.pieceUnit.findMany({
      where: {
        status: "PENDING",
        assignments: { none: { active: true } },
        barMemberships: { none: { active: true } },
        piece: { offerId, status: { not: "ARCHIVED" }, profile: { in: selectedProfiles } },
      },
      select: { pieceId: true, piece: { select: { profile: true, lengthMm: true } } },
    });
    const aggregates = new Map<string, { profile: string; lengthMm: number; quantity: number }>();
    for (const unit of units) {
      const key = `${unit.piece.profile}\u0000${unit.piece.lengthMm}`;
      const current = aggregates.get(key);
      if (current) current.quantity += 1;
      else
        aggregates.set(key, {
          profile: unit.piece.profile,
          lengthMm: unit.piece.lengthMm,
          quantity: 1,
        });
    }
    const requirements = [...aggregates.values()].sort(
      (left, right) =>
        left.profile.localeCompare(right.profile, "fr", { numeric: true, sensitivity: "base" }) ||
        left.lengthMm - right.lengthMm,
    );
    const summary = {
      selectedProfileCount: selectedProfiles.length,
      pieceRows: new Set(units.map((unit) => unit.pieceId)).size,
      totalQuantity: units.length,
      lengthCount: requirements.length,
    };

    return this.prisma.$transaction(async (transaction) => {
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "FACONNAGE_PREPARATION_CREATED",
          entityType: "FACONNAGE_PREPARATION",
          entityId: randomUUID(),
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { offerId, selectedProfiles, summary, requirements },
        },
      });
      return { preparationId: event.entityId, selectedProfiles, requirements, summary };
    });
  }

  async listPieces(
    offerId?: string,
    input: unknown = {},
  ): Promise<{
    pieces: ManagedPieceListProjection[];
    profiles: string[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const parsed = pieceListQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Les paramètres de la liste des pièces sont invalides.",
        details: parsed.error.flatten(),
      });
    }
    const { page, pageSize, search, profile } = parsed.data;
    const where: Prisma.PieceWhereInput = {
      ...(offerId ? { offerId } : {}),
      ...(profile ? { profile } : {}),
      ...(search
        ? {
            OR: ["reference", "profile", "quality", "designation"].map((field) => ({
              [field]: { contains: search, mode: "insensitive" as const },
            })),
          }
        : {}),
    };
    const baseWhere: Prisma.PieceWhereInput = offerId ? { offerId } : {};
    const [pieces, total, profileRows] = await Promise.all([
      this.prisma.piece.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          units: { select: { status: true, productionStatus: true } },
          images: {
            select: pieceImageSelect,
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            take: 1,
          },
          _count: { select: { images: true } },
        },
        orderBy: [
          { status: "asc" },
          { priority: "asc" },
          { dueDate: "asc" },
          { createdAt: "desc" },
          { id: "asc" },
        ],
      }),
      this.prisma.piece.count({ where }),
      this.prisma.piece.findMany({
        where: baseWhere,
        distinct: ["profile"],
        select: { profile: true },
        orderBy: { profile: "asc" },
      }),
    ]);
    return {
      pieces: pieces.map((piece) => this.toManagedPiece(piece)),
      profiles: profileRows.map((row) => row.profile),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async createPiece(actor: AuthContext, offerId: string, input: unknown): Promise<ManagedPiece> {
    await this.assertOfferActive(offerId);
    const parsed = createPieceSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez les informations de la pièce.",
        details: parsed.error.flatten(),
      });
    const reference = parsed.data.reference.toUpperCase();
    if (
      await this.prisma.piece.findFirst({ where: { offerId, reference }, select: { id: true } })
    ) {
      throw new ConflictException({
        code: "PIECE_REFERENCE_TAKEN",
        message: "Cette référence de pièce existe déjà.",
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const piece = await transaction.piece.create({
        data: {
          offerId,
          reference,
          quantity: parsed.data.quantity,
          profile: normalizeProfile(parsed.data.profile),
          quality: parsed.data.quality,
          lengthMm: parsed.data.lengthMm,
          unitWeightKg: parsed.data.unitWeightKg,
          totalWeightKg: calculateTotalWeightKg(parsed.data.unitWeightKg, parsed.data.quantity),
          designation: parsed.data.designation,
          priority: parsed.data.priority,
          dueDate: parsed.data.dueDate,
          createdById: actor.user.id,
          units: {
            createMany: {
              data: Array.from({ length: parsed.data.quantity }, (_, index) => ({
                sequenceNumber: index + 1,
              })),
            },
          },
        },
        include: { units: { select: { status: true, productionStatus: true } } },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "PIECE_CREATED",
          entityType: "PIECE",
          entityId: piece.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { offerId, reference, quantity: piece.quantity, priority: piece.priority },
        },
      });
      await transaction.offer.update({
        where: { id: offerId },
        data: { materialRevision: { increment: 1 } },
      });
      await transaction.cuttingPlan.updateMany({
        where: { offerId, status: "DRAFT" },
        data: { status: "ARCHIVED" },
      });
      return this.toManagedPiece(piece);
    });
  }

  async updatePiece(
    actor: AuthContext,
    offerId: string,
    id: string,
    input: unknown,
  ): Promise<ManagedPiece> {
    const parsed = updatePieceSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez les informations de la pièce.",
        details: parsed.error.flatten(),
      });
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const offer = await transaction.offer.findUnique({
            where: { id: offerId },
            select: { status: true },
          });
          if (!offer) {
            throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
          }
          if (offer.status !== "DRAFT" && offer.status !== "IN_PRODUCTION") {
            throw new BadRequestException({
              code: "OFFER_PIECES_LOCKED",
              message:
                "Les pièces ne peuvent être modifiées que sur une offre en brouillon ou en production.",
            });
          }

          const target = await transaction.piece.findFirst({
            where: { id, offerId },
            include: { units: { select: { status: true, productionStatus: true } } },
          });
          if (!target) {
            throw new NotFoundException({ code: "PIECE_NOT_FOUND", message: "Pièce introuvable." });
          }
          if (target.status === "ARCHIVED") {
            throw new BadRequestException({
              code: "PIECE_ARCHIVED",
              message: "Une pièce archivée ne peut plus être modifiée.",
            });
          }
          if (
            target.units.length !== target.quantity ||
            target.units.length === 0 ||
            target.units.some((unit) => unit.status !== "PENDING")
          ) {
            throw new ConflictException({
              code: "PIECE_UNITS_LOCKED",
              message:
                "Cette pièce contient des unités déjà façonnées ou engagées en production. Seules les pièces entièrement intactes peuvent être modifiées.",
            });
          }

          const piece = await transaction.piece.update({
            where: { id },
            data: {
              profile: normalizeProfile(parsed.data.profile),
              quality: parsed.data.quality,
              lengthMm: parsed.data.lengthMm,
              unitWeightKg: parsed.data.unitWeightKg,
              totalWeightKg: calculateTotalWeightKg(parsed.data.unitWeightKg, target.quantity),
              designation: parsed.data.designation,
              priority: parsed.data.priority,
              dueDate: parsed.data.dueDate,
              version: { increment: 1 },
            },
            include: { units: { select: { status: true, productionStatus: true } } },
          });
          await transaction.historyEvent.create({
            data: {
              eventType: "PIECE_UPDATED",
              entityType: "PIECE",
              entityId: id,
              actorUserId: actor.user.id,
              actorRole: actor.user.role,
              metadata: {
                offerId,
                previousVersion: target.version,
                version: piece.version,
                previous: {
                  profile: target.profile,
                  quality: target.quality,
                  lengthMm: target.lengthMm,
                  unitWeightKg: target.unitWeightKg === null ? null : Number(target.unitWeightKg),
                  totalWeightKg:
                    target.totalWeightKg === null ? null : Number(target.totalWeightKg),
                  designation: target.designation,
                  priority: target.priority,
                  dueDate: target.dueDate?.toISOString() ?? null,
                },
                updated: {
                  profile: piece.profile,
                  quality: piece.quality,
                  lengthMm: piece.lengthMm,
                  unitWeightKg: piece.unitWeightKg === null ? null : Number(piece.unitWeightKg),
                  totalWeightKg: piece.totalWeightKg === null ? null : Number(piece.totalWeightKg),
                  designation: piece.designation,
                  priority: piece.priority,
                  dueDate: piece.dueDate?.toISOString() ?? null,
                },
              },
            },
          });
          await transaction.offer.update({
            where: { id: offerId },
            data: { materialRevision: { increment: 1 } },
          });
          await transaction.cuttingPlan.updateMany({
            where: { offerId, status: "DRAFT" },
            data: { status: "ARCHIVED" },
          });
          return this.toManagedPiece(piece);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ConflictException({
          code: "PIECE_UPDATE_CONFLICT",
          message: "L’état de production vient de changer. Actualisez les pièces puis réessayez.",
        });
      }
      throw error;
    }
  }

  async archivePiece(actor: AuthContext, offerId: string, id: string): Promise<ManagedPiece> {
    await this.assertOfferActive(offerId);
    const target = await this.findPiece(id, offerId);
    if (target.status === "ARCHIVED") return this.toManagedPiece(target);
    if (
      target.status === "ASSIGNED" ||
      target.status === "IN_PROGRESS" ||
      target.units.some((unit) => unit.status !== "PENDING")
    ) {
      throw new BadRequestException({
        code: "PIECE_IN_PRODUCTION",
        message:
          "Une pièce façonnée, affectée ou déjà engagée dans le flux de production ne peut pas être archivée.",
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const piece = await transaction.piece.update({
        where: { id },
        data: { status: "ARCHIVED", version: { increment: 1 } },
        include: { units: { select: { status: true, productionStatus: true } } },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "PIECE_ARCHIVED",
          entityType: "PIECE",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { offerId, previousStatus: target.status, version: piece.version },
        },
      });
      await transaction.offer.update({
        where: { id: offerId },
        data: { materialRevision: { increment: 1 } },
      });
      await transaction.cuttingPlan.updateMany({
        where: { offerId, status: "DRAFT" },
        data: { status: "ARCHIVED" },
      });
      return this.toManagedPiece(piece);
    });
  }
}
