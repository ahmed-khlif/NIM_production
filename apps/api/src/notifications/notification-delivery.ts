import type { Prisma, UserRole } from "@prisma/client";
import { historyEntityLabel, historyEventLabel } from "@nim/types";

type EventSnapshot = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  metadata?: Prisma.JsonValue | null;
};

type DeliveryScope = {
  offerId?: string | null;
  machineId?: string | null;
  targetUserIds?: string[];
  href?: string;
  skipRoleRecipients?: boolean;
};

const globalEvents = new Set([
  "OFFER_CREATED",
  "OFFER_UPDATED",
  "OFFER_STATUS_OVERRIDDEN",
  "OFFER_ARCHIVED",
  "OFFER_RESTORED",
  "OFFER_DELETED",
  "OFFER_PRODUCTION_STARTED",
  "PIECE_CREATED",
  "PIECE_UPDATED",
  "PIECE_ARCHIVED",
  "PIECES_IMPORTED",
  "IMPORT_BATCH_REMOVED",
  "CUTTING_BARS_GENERATED",
  "CUTTING_PLAN_APPROVED",
  "CUTTING_PLAN_CANCELLED",
  "CUTTING_PLAN_REVISED",
  "CUTTING_PLAN_DELETED",
  "CUTTING_BAR_CANCELLED",
  "BAR_ASSIGNED_TO_MACHINE",
  "BAR_UNASSIGNED_FROM_MACHINE",
  "MACHINE_BARS_ASSIGNED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_REASSIGNED",
  "ASSIGNMENT_UNASSIGNED",
  "MACHINE_CREATED",
  "MACHINE_UPDATED",
  "MACHINE_DELETED",
  "MACHINE_STATUS_CHANGED",
  "MACHINE_SESSION_STARTED",
  "MACHINE_SESSION_TEAM_UPDATED",
  "MACHINE_SESSION_ENDED",
  "BAR_PRODUCTION_STARTED",
  "BAR_PRODUCTION_COMPLETED",
  "PRODUCTION_STARTED",
  "PRODUCTION_COMPLETED",
  "PRODUCTION_RUN_CANCELLED",
  "NON_CONFORMITY_REPORTED",
  "QUALITY_VALIDATED",
  "QUALITY_REJECTED",
  "QUALITY_DEVIATION_REQUESTED",
  "QUALITY_DEVIATION_APPROVED",
  "QUALITY_DEVIATION_REJECTED",
  "QUALITY_DISPOSITION_COMPLETED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DISABLED",
  "USER_REACTIVATED",
  "USER_PASSWORD_RESET",
  "OPERATOR_TABLET_ACTIVATED",
  "OPERATOR_TABLET_DEACTIVATED",
]);

const qualityEvents = new Set([
  "BAR_PRODUCTION_COMPLETED",
  "NON_CONFORMITY_REPORTED",
  "QUALITY_VALIDATED",
  "QUALITY_REJECTED",
  "PRODUCTION_COMPLETED",
  "QUALITY_DEVIATION_REQUESTED",
  "QUALITY_DEVIATION_APPROVED",
  "QUALITY_DEVIATION_REJECTED",
  "QUALITY_DISPOSITION_COMPLETED",
]);

const machineEvents = new Set([
  "BAR_ASSIGNED_TO_MACHINE",
  "MACHINE_BARS_ASSIGNED",
  "BAR_PRODUCTION_STARTED",
  "BAR_PRODUCTION_COMPLETED",
  "PRODUCTION_STARTED",
  "PRODUCTION_COMPLETED",
  "PRODUCTION_RUN_CANCELLED",
  "NON_CONFORMITY_REPORTED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_REASSIGNED",
  "ASSIGNMENT_UNASSIGNED",
  "MACHINE_STATUS_CHANGED",
  "MACHINE_SESSION_STARTED",
  "MACHINE_SESSION_ENDED",
]);

function metadataObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hrefFor(event: EventSnapshot, offerId: string | null, scope: DeliveryScope): string {
  if (scope.href) return scope.href;
  if (
    event.eventType.startsWith("QUALITY_") ||
    event.eventType === "NON_CONFORMITY_REPORTED" ||
    event.eventType === "BAR_PRODUCTION_COMPLETED" ||
    event.eventType === "PRODUCTION_COMPLETED"
  ) {
    return offerId ? `/offers/${offerId}/quality` : "/quality";
  }
  if (event.entityType === "MACHINE") return `/machines/${event.entityId}`;
  if (event.eventType.startsWith("BAR_") || event.eventType === "MACHINE_BARS_ASSIGNED") {
    return offerId ? `/offers/${offerId}/bars` : "/production/tablet";
  }
  if (
    event.eventType === "CUTTING_BAR_CANCELLED" ||
    event.eventType === "PRODUCTION_RUN_CANCELLED"
  ) {
    return offerId ? `/offers/${offerId}/bars` : "/production";
  }
  if (event.entityType === "PIECE" && offerId) return `/offers/${offerId}/pieces/${event.entityId}`;
  if (event.entityType === "OFFER") return `/offers/${event.entityId}`;
  if (event.entityType === "USER") return "/profile";
  if (offerId) return `/offers/${offerId}`;
  return "/";
}

function messageFor(
  event: EventSnapshot,
  context: {
    offerReference: string | null;
    pieceReference: string | null;
    sequenceNumber: number | null;
    barReference: string | null;
    machineName: string | null;
  },
): string {
  const metadata = metadataObject(event.metadata);
  const pieceReference =
    stringValue(metadata.pieceReference) ??
    stringValue(metadata.reference) ??
    context.pieceReference;
  const barReference = stringValue(metadata.barReference) ?? context.barReference;
  const affairReference = stringValue(metadata.offerReference) ?? context.offerReference;
  const sequenceNumber =
    typeof metadata.sequenceNumber === "number" ? metadata.sequenceNumber : context.sequenceNumber;
  const unit = sequenceNumber ? ` · unité ${sequenceNumber}` : "";
  const machine = context.machineName ? ` · ${context.machineName}` : "";

  switch (event.eventType) {
    case "MACHINE_SESSION_STARTED":
      return `Vous avez été ajouté à l’équipe de ${machine?.replace(/^ · /, "") ?? "la machine"}. Ouvrez la tablette pour rejoindre la session.`;
    case "MACHINE_SESSION_TEAM_UPDATED":
      return `Le responsable vous a ajouté à l’équipe de ${machine?.replace(/^ · /, "") ?? "la machine"}. Vous pouvez rejoindre la session sur la tablette.`;
    case "MACHINE_SESSION_ENDED":
      return "Un administrateur a terminé la session machine. Vous pouvez fermer ou rouvrir la tablette selon l’organisation de l’atelier.";
    case "OFFER_STATUS_OVERRIDDEN":
      return `Le statut de l’affaire ${affairReference ?? ""} a été modifié par un administrateur.`.trim();
    case "USER_CREATED":
      return "Votre compte NIM vient d’être créé par un administrateur.";
    case "USER_UPDATED":
      return "Les informations de votre compte NIM ont été mises à jour.";
    case "USER_DISABLED":
      return "Votre compte NIM a été désactivé par un administrateur.";
    case "USER_REACTIVATED":
      return "Votre compte NIM a été réactivé par un administrateur.";
    case "USER_PASSWORD_RESET":
      return "Votre mot de passe a été réinitialisé par un administrateur.";
    case "OPERATOR_TABLET_ACTIVATED":
      return "Votre accès opérateur sur tablette a été activé.";
    case "OPERATOR_TABLET_DEACTIVATED":
      return "Votre accès opérateur sur tablette a été désactivé.";
    case "OFFER_CREATED":
      return `Nouvelle affaire${affairReference ? ` ${affairReference}` : ""} créée.`;
    case "OFFER_DELETED":
      return `L’affaire ${affairReference ?? "sélectionnée"} a été supprimée.`;
    case "MACHINE_DELETED":
      return `La machine ${stringValue(metadata.internalNumber) ?? "sélectionnée"} a été supprimée.`;
    case "MACHINE_STATUS_CHANGED":
      return metadata.newStatus === "MAINTENANCE"
        ? `${context.machineName ?? "La machine"} est en maintenance. Retirez les barres encore affectées depuis l’onglet Barres des affaires. Aucune nouvelle affectation ni fabrication ne peut démarrer.`
        : `${context.machineName ?? "La machine"} est maintenant ${String(metadata.newStatus ?? "disponible").toLocaleLowerCase()}.`;
    case "OFFER_PRODUCTION_STARTED":
      return `La production de l’affaire ${affairReference ?? ""} a démarré.`.trim();
    case "PIECE_CREATED":
      return `La pièce ${pieceReference ?? "sélectionnée"} a été ajoutée${affairReference ? ` à ${affairReference}` : ""}.`;
    case "PIECE_UPDATED":
      return `La pièce ${pieceReference ?? "sélectionnée"} a été modifiée.`;
    case "PIECE_ARCHIVED":
      return `La pièce ${pieceReference ?? "sélectionnée"} a été archivée.`;
    case "PIECES_IMPORTED":
      return `${typeof metadata.rowsCreated === "number" ? metadata.rowsCreated : "Des"} pièce(s) importée(s)${affairReference ? ` dans ${affairReference}` : ""}.`;
    case "CUTTING_BARS_GENERATED":
      return `${typeof metadata.barCount === "number" ? metadata.barCount : "Des"} barre(s) générée(s)${affairReference ? ` pour ${affairReference}` : ""}.`;
    case "CUTTING_PLAN_APPROVED":
      return `Le plan de façonnage${affairReference ? ` de ${affairReference}` : ""} a été validé.`;
    case "CUTTING_PLAN_CANCELLED":
      return `Un plan de façonnage${affairReference ? ` de ${affairReference}` : ""} a été annulé.`;
    case "CUTTING_PLAN_REVISED":
      return `Le plan de façonnage${affairReference ? ` de ${affairReference}` : ""} a été révisé.`;
    case "CUTTING_PLAN_DELETED":
      return `Un plan de façonnage${affairReference ? ` de ${affairReference}` : ""} a été supprimé.`;
    case "CUTTING_BAR_CANCELLED":
      return `La barre ${barReference ?? "sélectionnée"} a été supprimée et ses pièces sont de nouveau disponibles.`;
    case "MACHINE_BARS_ASSIGNED": {
      const count = Array.isArray(metadata.barReferences) ? metadata.barReferences.length : 0;
      return `${count || "Des"} barre(s) affectée(s)${machine ? ` à ${machine.trim()}` : " à une machine"}${affairReference ? ` · ${affairReference}` : ""}.`;
    }
    case "BAR_ASSIGNED_TO_MACHINE":
      return `La barre ${barReference ?? "sélectionnée"} a été affectée${machine ? ` à ${machine.trim()}` : " à une machine"}.`;
    case "BAR_UNASSIGNED_FROM_MACHINE":
      return `La barre ${barReference ?? "sélectionnée"} a été retirée de sa machine.`;
    case "ASSIGNMENT_CREATED":
      return `Une unité de ${pieceReference ?? "pièce"} vous a été affectée${machine}.`;
    case "ASSIGNMENT_REASSIGNED":
      return `Une unité de ${pieceReference ?? "pièce"} a été réaffectée${machine}.`;
    case "ASSIGNMENT_UNASSIGNED":
      return `Une unité de ${pieceReference ?? "pièce"} a été retirée de la machine.`;
    case "BAR_PRODUCTION_STARTED":
      return `La fabrication de ${barReference ?? pieceReference ?? "la barre"} a démarré${machine}.`;
    case "PRODUCTION_STARTED":
      return `La fabrication de ${pieceReference ?? "la pièce"}${unit} a démarré${machine}${affairReference ? ` · ${affairReference}` : ""}.`;
    case "PRODUCTION_COMPLETED":
      return `${pieceReference ?? "La pièce"}${unit} est fabriquée et attend le contrôle qualité${machine}${affairReference ? ` · ${affairReference}` : ""}.`;
    case "BAR_PRODUCTION_COMPLETED":
      return `${barReference ?? "La barre"} est fabriquée et prête pour le contrôle qualité${machine}.`;
    case "PRODUCTION_RUN_CANCELLED":
      return `Le lancement de ${barReference ?? "la barre"} a été annulé${machine}.`;
    case "NON_CONFORMITY_REPORTED":
      return `Non-conformité signalée sur ${pieceReference ?? barReference ?? "une pièce"}${unit}${affairReference ? ` · ${affairReference}` : ""}.`;
    case "QUALITY_VALIDATED":
      return `${pieceReference ?? "Une pièce"}${unit} a été déclarée conforme.`;
    case "QUALITY_REJECTED":
      return `${pieceReference ?? "Une pièce"}${unit} a été déclarée non conforme.`;
    case "QUALITY_DEVIATION_REQUESTED":
      return `Une dérogation qualité demande votre décision${pieceReference ? ` · ${pieceReference}${unit}` : ""}.`;
    case "QUALITY_DEVIATION_APPROVED":
      return `La dérogation qualité a été approuvée${pieceReference ? ` · ${pieceReference}${unit}` : ""}.`;
    case "QUALITY_DEVIATION_REJECTED":
      return `La dérogation qualité a été refusée${pieceReference ? ` · ${pieceReference}${unit}` : ""}.`;
    default:
      return `${historyEntityLabel(event.entityType)}${(context.pieceReference ?? context.barReference) ? ` · ${context.pieceReference ?? context.barReference}` : ""}.`;
  }
}

/** Persists recipient-specific inbox rows in the same transaction as their audit event. */
export async function deliverBusinessNotification(
  transaction: Prisma.TransactionClient,
  event: EventSnapshot | null | undefined,
  scope: DeliveryScope = {},
): Promise<void> {
  if (!event || !globalEvents.has(event.eventType)) return;

  const metadata = metadataObject(event.metadata);
  const initialOfferId =
    scope.offerId ??
    stringValue(metadata.offerId) ??
    (event.entityType === "OFFER" ? event.entityId : null);
  const machineId = scope.machineId ?? stringValue(metadata.machineId);
  const targetUserIds = new Set(scope.targetUserIds ?? []);
  const roles: UserRole[] = ["ADMIN", "PRODUCTION_MANAGER"];
  if (qualityEvents.has(event.eventType)) roles.push("QUALITY_CONTROLLER");

  const [roleRecipients, offer, machine, actor, unit, bar] = await Promise.all([
    scope.skipRoleRecipients
      ? Promise.resolve([])
      : transaction.user.findMany({
          where: {
            isActive: true,
            role: { in: roles },
            ...(event.actorUserId ? { id: { not: event.actorUserId } } : {}),
          },
          select: { id: true },
        }),
    initialOfferId
      ? transaction.offer.findUnique({
          where: { id: initialOfferId },
          select: { id: true, reference: true },
        })
      : null,
    machineId
      ? transaction.machine.findUnique({
          where: { id: machineId },
          select: { id: true, name: true, internalNumber: true },
        })
      : null,
    event.actorUserId
      ? transaction.user.findUnique({
          where: { id: event.actorUserId },
          select: { displayName: true },
        })
      : null,
    stringValue(metadata.pieceUnitId)
      ? transaction.pieceUnit.findUnique({
          where: { id: stringValue(metadata.pieceUnitId)! },
          select: { sequenceNumber: true, piece: { select: { reference: true, offerId: true } } },
        })
      : null,
    event.entityType === "CUTTING_BAR"
      ? transaction.cuttingBar.findUnique({
          where: { id: event.entityId },
          select: { reference: true, offerId: true },
        })
      : null,
  ]);
  const offerId = initialOfferId ?? unit?.piece.offerId ?? bar?.offerId ?? null;
  roleRecipients.forEach((user) => targetUserIds.add(user.id));

  if (machineId && machineEvents.has(event.eventType)) {
    const sessions = await transaction.machineSession.findMany({
      where: { machineId, status: "ACTIVE" },
      select: {
        leadOperatorId: true,
        members: { where: { active: true }, select: { operatorId: true } },
      },
    });
    for (const session of sessions) {
      targetUserIds.add(session.leadOperatorId);
      session.members.forEach((member) => targetUserIds.add(member.operatorId));
    }
  }

  const recipients = [...targetUserIds].filter((id) => id !== event.actorUserId);
  if (event.eventType === "USER_CREATED" && targetUserIds.has(event.entityId))
    recipients.push(event.entityId);
  if (recipients.length === 0) return;

  const reference = stringValue(metadata.reference) ?? null;
  const machineName = machine ? `${machine.name} (${machine.internalNumber})` : null;
  const title = historyEventLabel(event.eventType);
  const message = messageFor(event, {
    offerReference: stringValue(metadata.offerReference) ?? offer?.reference ?? null,
    pieceReference:
      stringValue(metadata.pieceReference) ??
      (event.entityType === "PIECE" ? reference : null) ??
      unit?.piece.reference ??
      null,
    sequenceNumber:
      typeof metadata.sequenceNumber === "number"
        ? metadata.sequenceNumber
        : (unit?.sequenceNumber ?? null),
    barReference:
      stringValue(metadata.barReference) ??
      (event.entityType === "CUTTING_BAR"
        ? (reference ?? bar?.reference ?? null)
        : (bar?.reference ?? null)),
    machineName,
  });
  const href = hrefFor(event, offerId ?? null, scope);
  await transaction.notification.createMany({
    data: [...new Set(recipients)].map((recipientUserId) => ({
      recipientUserId,
      sourceEventId: event.id,
      eventType: event.eventType,
      title,
      message,
      href,
      actorName: actor?.displayName ?? null,
      offerId: offerId ?? null,
      entityType: event.entityType,
      entityId: event.entityId,
    })),
    skipDuplicates: true,
  });
}
