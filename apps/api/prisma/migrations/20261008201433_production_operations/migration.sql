-- CreateEnum
CREATE TYPE "ProductionOperationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "ProductionOperation" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceUnitId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "status" "ProductionOperationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductionOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionOperation_operatorId_status_idx" ON "ProductionOperation"("operatorId", "status");

-- CreateIndex
CREATE INDEX "ProductionOperation_machineId_status_idx" ON "ProductionOperation"("machineId", "status");

-- CreateIndex
CREATE INDEX "ProductionOperation_pieceUnitId_status_idx" ON "ProductionOperation"("pieceUnitId", "status");

-- CreateIndex
CREATE INDEX "ProductionOperation_pieceId_startedAt_idx" ON "ProductionOperation"("pieceId", "startedAt");

-- AddForeignKey
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "Piece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_pieceUnitId_fkey" FOREIGN KEY ("pieceUnitId") REFERENCES "PieceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
