CREATE TYPE "PieceProductionStatus" AS ENUM ('PENDING', 'FACONNEE', 'AFFECTEE', 'LANCEE', 'FABRIQUEE');
CREATE TYPE "QualityStatus" AS ENUM ('NOT_INSPECTED', 'CONFORME', 'NON_CONFORME');
CREATE TYPE "MachineSessionStatus" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "MachineSessionOperatorRole" AS ENUM ('LEAD', 'HELPER');
CREATE TYPE "ProductionRunStatus" AS ENUM ('RUNNING', 'COMPLETED');
CREATE TYPE "NonConformityReason" AS ENUM ('DIMENSION', 'CUTTING_ERROR', 'DRILLING_ERROR', 'MATERIAL_DEFECT', 'DEFORMATION', 'OTHER');
CREATE TYPE "NonConformityStatus" AS ENUM ('OPEN');

CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "connectionKeyId" TEXT NOT NULL,
    "connectionKeyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorAuthSession" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "OperatorAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MachineSession" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "leadOperatorId" TEXT NOT NULL,
    "status" "MachineSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MachineSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MachineSessionOperator" (
    "id" TEXT NOT NULL,
    "machineSessionId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "role" "MachineSessionOperatorRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "MachineSessionOperator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "cuttingBarId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "machineSessionId" TEXT NOT NULL,
    "startedByOperatorId" TEXT NOT NULL,
    "status" "ProductionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NonConformity" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceUnitId" TEXT NOT NULL,
    "cuttingBarId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "productionRunId" TEXT NOT NULL,
    "reportedByOperatorId" TEXT NOT NULL,
    "reason" "NonConformityReason" NOT NULL,
    "comment" TEXT,
    "status" "NonConformityStatus" NOT NULL DEFAULT 'OPEN',
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    CONSTRAINT "NonConformity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PieceUnit"
    ADD COLUMN "productionStatus" "PieceProductionStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "qualityStatus" "QualityStatus" NOT NULL DEFAULT 'NOT_INSPECTED',
    ADD COLUMN "currentProductionOperatorId" TEXT;

UPDATE "PieceUnit"
SET "productionStatus" = CASE
    WHEN "status" = 'FACONNEE' THEN 'FACONNEE'::"PieceProductionStatus"
    WHEN "status" = 'ASSIGNED' THEN 'AFFECTEE'::"PieceProductionStatus"
    WHEN "status" = 'IN_PROGRESS' THEN 'LANCEE'::"PieceProductionStatus"
    WHEN "status" IN ('COMPLETED', 'QUALITY_PENDING', 'ACCEPTED', 'REJECTED', 'SCRAPPED') THEN 'FABRIQUEE'::"PieceProductionStatus"
    ELSE 'PENDING'::"PieceProductionStatus"
END,
"qualityStatus" = CASE
    WHEN "qualityResult" = 'CONFORM' OR "status" = 'ACCEPTED' THEN 'CONFORME'::"QualityStatus"
    WHEN "qualityResult" = 'NON_CONFORM' OR "status" IN ('REJECTED', 'SCRAPPED') THEN 'NON_CONFORME'::"QualityStatus"
    ELSE 'NOT_INSPECTED'::"QualityStatus"
END;

ALTER TABLE "CuttingBar"
    ADD COLUMN "qualityStatus" "QualityStatus" NOT NULL DEFAULT 'NOT_INSPECTED';
UPDATE "CuttingBar"
SET "qualityStatus" = 'NON_CONFORME'::"QualityStatus"
WHERE "status" = 'NON_CONFORME';
UPDATE "CuttingBar"
SET "status" = 'FABRIQUEE'
WHERE "status" = 'NON_CONFORME';

ALTER TABLE "HistoryEvent" ADD COLUMN "actorOperatorId" TEXT;

ALTER TABLE "OperatorAuthSession"
    ADD CONSTRAINT "OperatorAuthSession_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MachineSession"
    ADD CONSTRAINT "MachineSession_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MachineSession_leadOperatorId_fkey"
    FOREIGN KEY ("leadOperatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MachineSessionOperator"
    ADD CONSTRAINT "MachineSessionOperator_machineSessionId_fkey"
    FOREIGN KEY ("machineSessionId") REFERENCES "MachineSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MachineSessionOperator_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRun"
    ADD CONSTRAINT "ProductionRun_cuttingBarId_fkey"
    FOREIGN KEY ("cuttingBarId") REFERENCES "CuttingBar"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProductionRun_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProductionRun_machineSessionId_fkey"
    FOREIGN KEY ("machineSessionId") REFERENCES "MachineSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProductionRun_startedByOperatorId_fkey"
    FOREIGN KEY ("startedByOperatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NonConformity"
    ADD CONSTRAINT "NonConformity_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NonConformity_pieceId_fkey"
    FOREIGN KEY ("pieceId") REFERENCES "Piece"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NonConformity_pieceUnitId_fkey"
    FOREIGN KEY ("pieceUnitId") REFERENCES "PieceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NonConformity_cuttingBarId_fkey"
    FOREIGN KEY ("cuttingBarId") REFERENCES "CuttingBar"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NonConformity_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NonConformity_productionRunId_fkey"
    FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NonConformity_reportedByOperatorId_fkey"
    FOREIGN KEY ("reportedByOperatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NonConformity_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PieceUnit"
    ADD CONSTRAINT "PieceUnit_currentProductionOperatorId_fkey"
    FOREIGN KEY ("currentProductionOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HistoryEvent"
    ADD CONSTRAINT "HistoryEvent_actorOperatorId_fkey"
    FOREIGN KEY ("actorOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "OperatorAuthSession_tokenHash_key" ON "OperatorAuthSession"("tokenHash");
CREATE UNIQUE INDEX "Operator_connectionKeyId_key" ON "Operator"("connectionKeyId");
CREATE INDEX "Operator_active_lastName_firstName_idx" ON "Operator"("active", "lastName", "firstName");
CREATE INDEX "Operator_lastActivityAt_idx" ON "Operator"("lastActivityAt");
CREATE INDEX "OperatorAuthSession_operatorId_expiresAt_idx" ON "OperatorAuthSession"("operatorId", "expiresAt");
CREATE INDEX "OperatorAuthSession_revokedAt_expiresAt_idx" ON "OperatorAuthSession"("revokedAt", "expiresAt");
CREATE INDEX "MachineSession_machineId_status_startedAt_idx" ON "MachineSession"("machineId", "status", "startedAt");
CREATE INDEX "MachineSession_leadOperatorId_status_startedAt_idx" ON "MachineSession"("leadOperatorId", "status", "startedAt");
CREATE UNIQUE INDEX "MachineSession_one_active_per_machine" ON "MachineSession"("machineId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "MachineSession_one_active_per_lead" ON "MachineSession"("leadOperatorId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "MachineSessionOperator_machineSessionId_operatorId_key" ON "MachineSessionOperator"("machineSessionId", "operatorId");
CREATE INDEX "MachineSessionOperator_machineSessionId_active_role_idx" ON "MachineSessionOperator"("machineSessionId", "active", "role");
CREATE INDEX "MachineSessionOperator_operatorId_active_idx" ON "MachineSessionOperator"("operatorId", "active");
CREATE UNIQUE INDEX "MachineSessionOperator_one_active_session_per_operator" ON "MachineSessionOperator"("operatorId") WHERE "active" = true;
CREATE INDEX "ProductionRun_cuttingBarId_status_startedAt_idx" ON "ProductionRun"("cuttingBarId", "status", "startedAt");
CREATE INDEX "ProductionRun_machineId_startedAt_idx" ON "ProductionRun"("machineId", "startedAt");
CREATE INDEX "ProductionRun_machineSessionId_status_idx" ON "ProductionRun"("machineSessionId", "status");
CREATE INDEX "ProductionRun_startedByOperatorId_startedAt_idx" ON "ProductionRun"("startedByOperatorId", "startedAt");
CREATE UNIQUE INDEX "ProductionRun_one_running_per_bar" ON "ProductionRun"("cuttingBarId") WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "ProductionRun_one_running_per_machine" ON "ProductionRun"("machineId") WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "ProductionRun_one_running_per_session" ON "ProductionRun"("machineSessionId") WHERE "status" = 'RUNNING';
CREATE INDEX "NonConformity_offerId_status_reportedAt_idx" ON "NonConformity"("offerId", "status", "reportedAt");
CREATE INDEX "NonConformity_pieceUnitId_reportedAt_idx" ON "NonConformity"("pieceUnitId", "reportedAt");
CREATE INDEX "NonConformity_cuttingBarId_reportedAt_idx" ON "NonConformity"("cuttingBarId", "reportedAt");
CREATE INDEX "NonConformity_machineId_reportedAt_idx" ON "NonConformity"("machineId", "reportedAt");
CREATE INDEX "NonConformity_productionRunId_status_idx" ON "NonConformity"("productionRunId", "status");
CREATE UNIQUE INDEX "NonConformity_one_open_per_piece_unit" ON "NonConformity"("pieceUnitId") WHERE "status" = 'OPEN';
CREATE INDEX "PieceUnit_productionStatus_currentMachineId_idx" ON "PieceUnit"("productionStatus", "currentMachineId");
CREATE INDEX "PieceUnit_qualityStatus_status_idx" ON "PieceUnit"("qualityStatus", "status");
CREATE INDEX "HistoryEvent_actorOperatorId_createdAt_idx" ON "HistoryEvent"("actorOperatorId", "createdAt");
