-- CreateEnum
CREATE TYPE "PieceStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PiecePriority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "PieceUnitStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'QUALITY_PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Piece" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "profile" TEXT NOT NULL,
    "lengthMm" INTEGER NOT NULL,
    "unitWeightKg" DECIMAL(65,30),
    "priority" "PiecePriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "status" "PieceStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Piece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PieceUnit" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" "PieceUnitStatus" NOT NULL DEFAULT 'PENDING',
    "currentMachineId" TEXT,
    "currentOperatorId" TEXT,
    "startedAt" TIMESTAMP(3),
    "manufacturedAt" TIMESTAMP(3),
    "controlledAt" TIMESTAMP(3),
    "qualityResult" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PieceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Piece_reference_key" ON "Piece"("reference");

-- CreateIndex
CREATE INDEX "Piece_status_dueDate_idx" ON "Piece"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Piece_priority_dueDate_idx" ON "Piece"("priority", "dueDate");

-- CreateIndex
CREATE INDEX "Piece_createdById_createdAt_idx" ON "Piece"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "PieceUnit_status_currentMachineId_idx" ON "PieceUnit"("status", "currentMachineId");

-- CreateIndex
CREATE INDEX "PieceUnit_currentOperatorId_status_idx" ON "PieceUnit"("currentOperatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PieceUnit_pieceId_sequenceNumber_key" ON "PieceUnit"("pieceId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "Piece" ADD CONSTRAINT "Piece_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceUnit" ADD CONSTRAINT "PieceUnit_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "Piece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceUnit" ADD CONSTRAINT "PieceUnit_currentMachineId_fkey" FOREIGN KEY ("currentMachineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceUnit" ADD CONSTRAINT "PieceUnit_currentOperatorId_fkey" FOREIGN KEY ("currentOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
