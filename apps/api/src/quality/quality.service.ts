import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  qualityDecisionSchema,
  qualityDeviationDecisionSchema,
  qualityDispositionSchema,
} from "@nim/validation";
import type {
  ManagedQualityControl,
  ManagedQualityPendingUnit,
  QualityControlImage,
  QualityDisposition,
  QualityControlResult,
} from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { PieceImageStorage } from "../pieces/piece-image.storage";

const pendingInclude = {
  piece: true,
  currentMachine: true,
  productionOperations: {
    where: { status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 1,
    include: {
      machine: true,
      operator: { select: { displayName: true } },
    },
  },
} as const;

const dispositionInclude = {
  requestedBy: { select: { id: true, displayName: true } },
  approvedBy: { select: { id: true, displayName: true } },
} as const;

const controlInclude = {
  piece: true,
  pieceUnit: true,
  controller: { select: { id: true, displayName: true } },
  images: {
    orderBy: { createdAt: "asc" },
  },
  dispositions: {
    orderBy: { requestedAt: "desc" },
    take: 1,
    include: dispositionInclude,
  },
} as const;

type PendingUnit = Prisma.PieceUnitGetPayload<{ include: typeof pendingInclude }>;
type ControlWithRelations = Prisma.QualityControlGetPayload<{ include: typeof controlInclude }>;

type UploadedQualityImage = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const qualityImageRules = {
  maxBytes: 5 * 1024 * 1024,
  maxPerControl: 10,
  mimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]),
} as const;

@Injectable()
export class QualityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(PieceImageStorage) private readonly imageStorage = new PieceImageStorage(),
    @Optional() @Inject(RealtimeService) private readonly realtime?: RealtimeService,
  ) {}

  private toQualityImage(image: {
    id: string;
    qualityControlId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }): QualityControlImage {
    return {
      id: image.id,
      originalName: image.originalName,
      mimeType: image.mimeType as QualityControlImage["mimeType"],
      sizeBytes: image.sizeBytes,
      url: `/quality/controls/${encodeURIComponent(image.qualityControlId)}/images/${encodeURIComponent(image.id)}`,
      createdAt: image.createdAt.toISOString(),
    };
  }

  private toDisposition(disposition: {
    id: string;
    pieceUnitId: string;
    qualityControlId: string;
    type: QualityDisposition["type"];
    status: QualityDisposition["status"];
    reason: string;
    approvalComment: string | null;
    requestedById: string;
    requestedAt: Date;
    decidedAt: Date | null;
    completedAt: Date | null;
    requestedBy: { id: string; displayName: string };
    approvedBy: { id: string; displayName: string } | null;
    approvedById: string | null;
  }): QualityDisposition {
    return {
      id: disposition.id,
      pieceUnitId: disposition.pieceUnitId,
      qualityControlId: disposition.qualityControlId,
      type: disposition.type,
      status: disposition.status,
      reason: disposition.reason,
      approvalComment: disposition.approvalComment,
      requestedById: disposition.requestedById,
      requestedByName: disposition.requestedBy.displayName,
      approvedById: disposition.approvedById,
      approvedByName: disposition.approvedBy?.displayName ?? null,
      requestedAt: disposition.requestedAt.toISOString(),
      decidedAt: disposition.decidedAt?.toISOString() ?? null,
      completedAt: disposition.completedAt?.toISOString() ?? null,
    };
  }

  private toPendingUnit(unit: PendingUnit): ManagedQualityPendingUnit {
    const latestOperation = unit.productionOperations[0];
    return {
      pieceUnitId: unit.id,
      pieceId: unit.pieceId,
      reference: unit.piece.reference,
      sequenceNumber: unit.sequenceNumber,
      profile: unit.piece.profile,
      lengthMm: unit.piece.lengthMm,
      priority: unit.piece.priority,
      status: "QUALITY_PENDING",
      pieceStatus: unit.piece.status,
      machineName: unit.currentMachine?.name ?? latestOperation?.machine.name ?? null,
      operatorName: latestOperation?.operator.displayName ?? null,
      manufacturedAt: unit.manufacturedAt?.toISOString() ?? null,
    };
  }

  private toManagedControl(control: ControlWithRelations): ManagedQualityControl {
    return {
      id: control.id,
      pieceUnitId: control.pieceUnitId,
      pieceId: control.pieceId,
      reference: control.piece.reference,
      sequenceNumber: control.pieceUnit.sequenceNumber,
      result: control.result as QualityControlResult,
      comment: control.comment,
      defectCategory: control.defectCategory ?? null,
      cycle: control.cycle ?? 1,
      images: (control.images ?? []).map((image) => this.toQualityImage(image)),
      disposition: (control.dispositions ?? [])[0]
        ? this.toDisposition((control.dispositions ?? [])[0])
        : null,
      controllerId: control.controllerId,
      controllerName: control.controller.displayName,
      controlledAt: control.controlledAt.toISOString(),
    };
  }

  private async assertOfferExists(offerId?: string): Promise<string | undefined> {
    const normalized = offerId?.trim() || undefined;
    if (!normalized) return undefined;
    const offer = await this.prisma.offer.findUnique({ where: { id: normalized }, select: { id: true } });
    if (!offer) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Offre introuvable." });
    }
    return normalized;
  }

  async listPending(offerId?: string): Promise<ManagedQualityPendingUnit[]> {
    const normalizedOfferId = await this.assertOfferExists(offerId);
    const units = await this.prisma.pieceUnit.findMany({
      where: {
        status: "QUALITY_PENDING",
        ...(normalizedOfferId ? { piece: { offerId: normalizedOfferId } } : {}),
      },
      include: pendingInclude,
      orderBy: [{ manufacturedAt: "asc" }, { id: "asc" }],
    });
    return units.map((unit) => this.toPendingUnit(unit));
  }

  async listHistory(offerId?: string): Promise<ManagedQualityControl[]> {
    const normalizedOfferId = await this.assertOfferExists(offerId);
    const controls = await this.prisma.qualityControl.findMany({
      where: normalizedOfferId ? { piece: { offerId: normalizedOfferId } } : undefined,
      include: controlInclude,
      orderBy: { controlledAt: "desc" },
      take: 100,
    });
    return controls.map((control) => this.toManagedControl(control));
  }

  async validate(
    actor: AuthContext,
    pieceUnitId: string,
    input: unknown,
  ): Promise<ManagedQualityControl> {
    if (
      typeof pieceUnitId !== "string" ||
      pieceUnitId.trim().length === 0 ||
      pieceUnitId.length > 30
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "L’unité de pièce sélectionnée est invalide.",
      });
    }
    const parsed = qualityDecisionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Choisissez un résultat et complétez le motif demandé.",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const unit = await transaction.pieceUnit.findUnique({
          where: { id: pieceUnitId },
          include: { piece: true },
        });
        if (!unit) {
          throw new NotFoundException({
            code: "PIECE_UNIT_NOT_FOUND",
            message: "Unité de pièce introuvable.",
          });
        }
        if (unit.status !== "QUALITY_PENDING") {
          throw new ConflictException({
            code: "QUALITY_UNIT_NOT_PENDING",
            message: "Cette unité n’est pas en attente de contrôle qualité.",
          });
        }

        const latestControl = await transaction.qualityControl.findFirst({
          where: { pieceUnitId },
          orderBy: { cycle: "desc" },
          select: { cycle: true, controlledAt: true },
        });
        if (
          latestControl &&
          unit.controlledAt &&
          latestControl.controlledAt.getTime() === unit.controlledAt.getTime()
        ) {
          throw new ConflictException({
            code: "QUALITY_ALREADY_VALIDATED",
            message: "Cette unité a déjà été contrôlée.",
          });
        }

        const controlledAt = new Date();
        const nextUnitStatus = parsed.data.result === "CONFORM" ? "ACCEPTED" : "REJECTED";
        const control = await transaction.qualityControl.create({
          data: {
            pieceId: unit.pieceId,
            pieceUnitId: unit.id,
            controllerId: actor.user.id,
            result: parsed.data.result,
            comment: parsed.data.comment || null,
            defectCategory:
              parsed.data.result === "NON_CONFORM" ? parsed.data.defectCategory : null,
            cycle: (latestControl?.cycle ?? 0) + 1,
            controlledAt,
          },
          include: controlInclude,
        });
        await transaction.pieceUnit.update({
          where: { id: unit.id },
          data: {
            status: nextUnitStatus,
            qualityStatus: parsed.data.result === "CONFORM" ? "CONFORME" : "NON_CONFORME",
            controlledAt,
            qualityResult: parsed.data.result,
            version: { increment: 1 },
          },
        });
        await transaction.historyEvent.create({
          data: {
            eventType: parsed.data.result === "CONFORM" ? "QUALITY_VALIDATED" : "QUALITY_REJECTED",
            entityType: "QUALITY_CONTROL",
            entityId: control.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              offerId: unit.piece.offerId,
              pieceId: unit.pieceId,
              pieceUnitId: unit.id,
              result: parsed.data.result,
              comment: parsed.data.comment || null,
              defectCategory: parsed.data.defectCategory || null,
              cycle: control.cycle,
              oldUnitStatus: unit.status,
              newUnitStatus: nextUnitStatus,
            },
          },
        });

        return this.toManagedControl(control);
      });
      this.realtime?.publish({
        type: result.result === "CONFORM" ? "quality.validated" : "quality.rejected",
        entityType: "QUALITY_CONTROL",
        entityId: result.id,
        actorUserId: actor.user.id,
      });
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          code: "QUALITY_ALREADY_VALIDATED",
          message: "Cette unité a déjà été contrôlée.",
        });
      }
      throw error;
    }
  }

  async requestDisposition(
    actor: AuthContext,
    pieceUnitId: string,
    input: unknown,
  ): Promise<QualityDisposition> {
    this.assertManager(actor);
    this.assertId(pieceUnitId, "L’unité de pièce sélectionnée est invalide.");
    const parsed = qualityDispositionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Choisissez une disposition et indiquez un motif.",
        details: parsed.error.flatten(),
      });
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const unit = await transaction.pieceUnit.findUnique({
        where: { id: pieceUnitId },
        include: {
          piece: true,
          qualityControls: { orderBy: { cycle: "desc" }, take: 1 },
        },
      });
      if (!unit) {
        throw new NotFoundException({
          code: "PIECE_UNIT_NOT_FOUND",
          message: "Unité introuvable.",
        });
      }
      if (unit.status !== "REJECTED") {
        throw new ConflictException({
          code: "QUALITY_DISPOSITION_NOT_ALLOWED",
          message: "Une disposition ne peut être choisie que pour une unité non conforme.",
        });
      }
      const control = unit.qualityControls[0];
      if (!control || control.result !== "NON_CONFORM") {
        throw new ConflictException({
          code: "QUALITY_CONTROL_NOT_FOUND",
          message: "La décision qualité non conforme est introuvable.",
        });
      }
      const existing = await transaction.qualityDisposition.findFirst({
        where: {
          qualityControlId: control.id,
          status: { in: ["PENDING", "APPROVED", "COMPLETED"] },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: "QUALITY_DISPOSITION_ALREADY_SET",
          message: "Une disposition existe déjà pour cette non-conformité.",
        });
      }

      const now = new Date();
      const requiresApproval = parsed.data.type === "DEVIATION";
      const disposition = await transaction.qualityDisposition.create({
        data: {
          pieceId: unit.pieceId,
          pieceUnitId: unit.id,
          qualityControlId: control.id,
          type: parsed.data.type,
          status: requiresApproval ? "PENDING" : "COMPLETED",
          reason: parsed.data.reason,
          requestedById: actor.user.id,
          decidedAt: requiresApproval ? null : now,
          completedAt: requiresApproval ? null : now,
        },
        include: dispositionInclude,
      });

      if (!requiresApproval) {
        await transaction.assignment.updateMany({
          where: { pieceUnitId: unit.id, active: true },
          data: { active: false, unassignedAt: now, version: { increment: 1 } },
        });
        if (parsed.data.type === "REWORK" || parsed.data.type === "REMAKE") {
          await transaction.pieceUnit.update({
            where: { id: unit.id },
            data: {
              status: "PENDING",
              productionStatus: "PENDING",
              currentMachineId: null,
              currentOperatorId: null,
              startedAt: null,
              manufacturedAt: null,
              controlledAt: null,
              qualityResult: null,
              version: { increment: 1 },
            },
          });
          await transaction.piece.update({
            where: { id: unit.pieceId },
            data: { status: "IN_PROGRESS", version: { increment: 1 } },
          });
        } else {
          await transaction.pieceUnit.update({
            where: { id: unit.id },
            data: {
              status: "SCRAPPED",
              productionStatus: "FABRIQUEE",
              currentMachineId: null,
              currentOperatorId: null,
              version: { increment: 1 },
            },
          });
        }
      }

      await transaction.historyEvent.create({
        data: {
          eventType: requiresApproval
            ? "QUALITY_DEVIATION_REQUESTED"
            : "QUALITY_DISPOSITION_COMPLETED",
          entityType: "QUALITY_DISPOSITION",
          entityId: disposition.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            offerId: unit.piece.offerId,
            pieceId: unit.pieceId,
            pieceUnitId: unit.id,
            qualityControlId: control.id,
            type: parsed.data.type,
            status: disposition.status,
            reason: parsed.data.reason,
            oldUnitStatus: unit.status,
            newUnitStatus: requiresApproval
              ? unit.status
              : parsed.data.type === "SCRAP"
                ? "SCRAPPED"
                : "PENDING",
          },
        },
      });
      return this.toDisposition(disposition);
    });
    this.realtime?.publish({
      type: "quality.disposition",
      entityType: "QUALITY_DISPOSITION",
      entityId: result.id,
      actorUserId: actor.user.id,
    });
    return result;
  }

  async decideDeviation(
    actor: AuthContext,
    dispositionId: string,
    input: unknown,
  ): Promise<QualityDisposition> {
    if (actor.user.role !== "ADMIN") {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "Seul un administrateur peut approuver une dérogation.",
      });
    }
    this.assertId(dispositionId, "La demande de dérogation est invalide.");
    const parsed = qualityDeviationDecisionSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La décision de dérogation est invalide.",
        details: parsed.error.flatten(),
      });
    }

    const result = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.qualityDisposition.findUnique({
        where: { id: dispositionId },
        include: { pieceUnit: { include: { piece: true } } },
      });
      if (!existing) {
        throw new NotFoundException({
          code: "QUALITY_DISPOSITION_NOT_FOUND",
          message: "Demande introuvable.",
        });
      }
      if (existing.type !== "DEVIATION" || existing.status !== "PENDING") {
        throw new ConflictException({
          code: "QUALITY_DEVIATION_ALREADY_DECIDED",
          message: "Cette demande de dérogation a déjà été traitée.",
        });
      }
      const approved = parsed.data.decision === "APPROVE";
      const now = new Date();
      const disposition = await transaction.qualityDisposition.update({
        where: { id: dispositionId },
        data: {
          status: approved ? "APPROVED" : "REJECTED",
          approvalComment: parsed.data.comment || null,
          approvedById: actor.user.id,
          decidedAt: now,
          completedAt: approved ? now : null,
        },
        include: dispositionInclude,
      });
      if (approved) {
        await transaction.pieceUnit.update({
          where: { id: existing.pieceUnitId },
          data: { status: "ACCEPTED", version: { increment: 1 } },
        });
      }
      await transaction.historyEvent.create({
        data: {
          eventType: approved ? "QUALITY_DEVIATION_APPROVED" : "QUALITY_DEVIATION_REJECTED",
          entityType: "QUALITY_DISPOSITION",
          entityId: disposition.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            offerId: existing.pieceUnit.piece.offerId,
            pieceId: existing.pieceId,
            pieceUnitId: existing.pieceUnitId,
            decision: parsed.data.decision,
            comment: parsed.data.comment || null,
            newUnitStatus: approved ? "ACCEPTED" : existing.pieceUnit.status,
          },
        },
      });
      return this.toDisposition(disposition);
    });
    this.realtime?.publish({
      type: "quality.deviation.decided",
      entityType: "QUALITY_DISPOSITION",
      entityId: result.id,
      actorUserId: actor.user.id,
    });
    return result;
  }

  async addDefectImage(
    actor: AuthContext,
    qualityControlId: string,
    file: UploadedQualityImage | undefined,
  ): Promise<QualityControlImage> {
    this.assertImage(file);
    const target = await this.prisma.qualityControl.findUnique({
      where: { id: qualityControlId },
      select: { id: true, result: true },
    });
    if (!target) {
      throw new NotFoundException({
        code: "QUALITY_CONTROL_NOT_FOUND",
        message: "Contrôle introuvable.",
      });
    }
    if (target.result !== "NON_CONFORM") {
      throw new BadRequestException({
        code: "QUALITY_DEFECT_IMAGE_NOT_ALLOWED",
        message: "Les photos de défaut sont réservées aux non-conformités.",
      });
    }
    const count = await this.prisma.qualityControlImage.count({ where: { qualityControlId } });
    if (count >= qualityImageRules.maxPerControl) {
      throw new BadRequestException({
        code: "QUALITY_DEFECT_IMAGE_LIMIT_REACHED",
        message: "Une non-conformité peut contenir au maximum 10 photos.",
      });
    }
    const detectedMimeType = this.detectImageMime(file.buffer);
    if (!detectedMimeType) {
      throw new BadRequestException({
        code: "QUALITY_DEFECT_IMAGE_CONTENT_INVALID",
        message: "Le contenu ne correspond pas au type déclaré.",
      });
    }
    const imageId = randomUUID();
    const extension =
      detectedMimeType === "image/jpeg" ? "jpg" : detectedMimeType.slice("image/".length);
    const storageKey = `quality-controls/${qualityControlId}/${imageId}.${extension}`;
    await this.imageStorage.write(storageKey, file.buffer);
    try {
      const image = await this.prisma.$transaction(async (transaction) => {
        const currentCount = await transaction.qualityControlImage.count({
          where: { qualityControlId },
        });
        if (currentCount >= qualityImageRules.maxPerControl) {
          throw new BadRequestException({
            code: "QUALITY_DEFECT_IMAGE_LIMIT_REACHED",
            message: "Limite de photos atteinte.",
          });
        }
        const created = await transaction.qualityControlImage.create({
          data: {
            id: imageId,
            qualityControlId,
            uploadedById: actor.user.id,
            storageKey,
            originalName: this.sanitizeOriginalName(file.originalname),
            mimeType: detectedMimeType,
            sizeBytes: file.size,
          },
        });
        await transaction.historyEvent.create({
          data: {
            eventType: "QUALITY_DEFECT_IMAGE_ADDED",
            entityType: "QUALITY_CONTROL",
            entityId: qualityControlId,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: { imageId, originalName: created.originalName, sizeBytes: file.size },
          },
        });
        return created;
      });
      return this.toQualityImage(image);
    } catch (error) {
      await this.imageStorage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async readDefectImage(
    qualityControlId: string,
    imageId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const image = await this.prisma.qualityControlImage.findFirst({
      where: { id: imageId, qualityControlId },
      select: { storageKey: true, mimeType: true, originalName: true },
    });
    if (!image) {
      throw new NotFoundException({
        code: "QUALITY_DEFECT_IMAGE_NOT_FOUND",
        message: "Photo introuvable.",
      });
    }
    return { buffer: await this.imageStorage.read(image.storageKey), ...image };
  }

  async removeDefectImage(
    actor: AuthContext,
    qualityControlId: string,
    imageId: string,
  ): Promise<{ success: true }> {
    const image = await this.prisma.qualityControlImage.findFirst({
      where: { id: imageId, qualityControlId },
      select: { id: true, storageKey: true, originalName: true, sizeBytes: true, mimeType: true },
    });
    if (!image) {
      throw new NotFoundException({
        code: "QUALITY_DEFECT_IMAGE_NOT_FOUND",
        message: "Photo introuvable.",
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.qualityControlImage.delete({ where: { id: imageId } });
      await transaction.historyEvent.create({
        data: {
          eventType: "QUALITY_DEFECT_IMAGE_REMOVED",
          entityType: "QUALITY_CONTROL",
          entityId: qualityControlId,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { imageId, originalName: image.originalName, sizeBytes: image.sizeBytes },
        },
      });
    });
    await this.imageStorage.remove(image.storageKey);
    return { success: true };
  }

  private assertManager(actor: AuthContext): void {
    if (!["ADMIN", "PRODUCTION_MANAGER"].includes(actor.user.role)) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "Action réservée aux responsables de production.",
      });
    }
  }

  private assertId(value: string, message: string): void {
    if (!value.trim() || value.length > 30) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message });
    }
  }

  private assertImage(
    file: UploadedQualityImage | undefined,
  ): asserts file is UploadedQualityImage {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: "QUALITY_DEFECT_IMAGE_REQUIRED",
        message: "Sélectionnez une photo.",
      });
    }
    if (!qualityImageRules.mimeTypes.has(file.mimetype)) {
      throw new BadRequestException({
        code: "QUALITY_DEFECT_IMAGE_TYPE_NOT_ALLOWED",
        message: "Utilisez une image JPEG, PNG ou WebP.",
      });
    }
    if (file.size <= 0 || file.size > qualityImageRules.maxBytes) {
      throw new BadRequestException({
        code: "QUALITY_DEFECT_IMAGE_TOO_LARGE",
        message: "Chaque photo doit peser au maximum 5 Mo.",
      });
    }
    const detected = this.detectImageMime(file.buffer);
    if (!detected || detected !== file.mimetype) {
      throw new BadRequestException({
        code: "QUALITY_DEFECT_IMAGE_CONTENT_INVALID",
        message: "Le contenu ne correspond pas au type déclaré.",
      });
    }
  }

  private detectImageMime(buffer: Buffer): string | null {
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      return "image/png";
    if (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    )
      return "image/webp";
    return null;
  }

  private sanitizeOriginalName(value: string): string {
    const name = value
      .trim()
      .replace(/[\\/\0]/g, "_")
      .slice(0, 180);
    return name || "defect-photo";
  }
}
