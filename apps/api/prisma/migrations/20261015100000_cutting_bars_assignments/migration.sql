ALTER TYPE "PieceUnitStatus" ADD VALUE 'FACONNEE';

CREATE TYPE "CuttingBarStatus" AS ENUM (
    'FACONNEE',
    'AFFECTEE',
    'LANCEE',
    'FABRIQUEE',
    'NON_CONFORME',
    'CANCELLED'
);

CREATE TABLE "CuttingBar" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "cuttingPlanId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "rawLengthMm" INTEGER NOT NULL,
    "usedLengthMm" INTEGER NOT NULL,
    "wasteMm" INTEGER NOT NULL,
    "status" "CuttingBarStatus" NOT NULL DEFAULT 'FACONNEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fabricatedAt" TIMESTAMP(3),
    CONSTRAINT "CuttingBar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CuttingBarItem" (
    "id" TEXT NOT NULL,
    "cuttingBarId" TEXT NOT NULL,
    "pieceUnitId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "CuttingBarItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MachineBarAssignment" (
    "id" TEXT NOT NULL,
    "cuttingBarId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "unassignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MachineBarAssignment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Assignment" ADD COLUMN "barAssignmentId" TEXT;

CREATE UNIQUE INDEX "CuttingBar_offerId_reference_key" ON "CuttingBar"("offerId", "reference");
CREATE INDEX "CuttingBar_offerId_status_profile_idx" ON "CuttingBar"("offerId", "status", "profile");
CREATE INDEX "CuttingBar_cuttingPlanId_createdAt_idx" ON "CuttingBar"("cuttingPlanId", "createdAt");
CREATE UNIQUE INDEX "CuttingBarItem_cuttingBarId_pieceUnitId_key" ON "CuttingBarItem"("cuttingBarId", "pieceUnitId");
CREATE INDEX "CuttingBarItem_pieceUnitId_active_idx" ON "CuttingBarItem"("pieceUnitId", "active");
CREATE INDEX "CuttingBarItem_cuttingBarId_active_idx" ON "CuttingBarItem"("cuttingBarId", "active");
CREATE UNIQUE INDEX "CuttingBarItem_one_active_bar_per_unit" ON "CuttingBarItem"("pieceUnitId") WHERE "active" = true;
CREATE INDEX "MachineBarAssignment_machineId_active_assignedAt_idx" ON "MachineBarAssignment"("machineId", "active", "assignedAt");
CREATE INDEX "MachineBarAssignment_assignedById_assignedAt_idx" ON "MachineBarAssignment"("assignedById", "assignedAt");
CREATE INDEX "MachineBarAssignment_cuttingBarId_assignedAt_idx" ON "MachineBarAssignment"("cuttingBarId", "assignedAt");
CREATE UNIQUE INDEX "MachineBarAssignment_one_active_per_bar" ON "MachineBarAssignment"("cuttingBarId") WHERE "active" = true;
CREATE INDEX "Assignment_barAssignmentId_idx" ON "Assignment"("barAssignmentId");

ALTER TABLE "CuttingBar"
    ADD CONSTRAINT "CuttingBar_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "CuttingBar_cuttingPlanId_fkey" FOREIGN KEY ("cuttingPlanId") REFERENCES "CuttingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CuttingBarItem"
    ADD CONSTRAINT "CuttingBarItem_cuttingBarId_fkey" FOREIGN KEY ("cuttingBarId") REFERENCES "CuttingBar"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "CuttingBarItem_pieceUnitId_fkey" FOREIGN KEY ("pieceUnitId") REFERENCES "PieceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MachineBarAssignment"
    ADD CONSTRAINT "MachineBarAssignment_cuttingBarId_fkey" FOREIGN KEY ("cuttingBarId") REFERENCES "CuttingBar"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MachineBarAssignment_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MachineBarAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "MachineBarAssignment_unassignedById_fkey" FOREIGN KEY ("unassignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Assignment"
    ADD CONSTRAINT "Assignment_barAssignmentId_fkey" FOREIGN KEY ("barAssignmentId") REFERENCES "MachineBarAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
