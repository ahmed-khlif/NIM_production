-- AlterEnum
ALTER TYPE "PieceUnitStatus" ADD VALUE 'ASSIGNED';

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "pieceUnitId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "queuePosition" INTEGER,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_pieceUnitId_active_idx" ON "Assignment"("pieceUnitId", "active");

-- CreateIndex
CREATE INDEX "Assignment_machineId_active_queuePosition_idx" ON "Assignment"("machineId", "active", "queuePosition");

-- CreateIndex
CREATE INDEX "Assignment_assignedById_assignedAt_idx" ON "Assignment"("assignedById", "assignedAt");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_pieceUnitId_fkey" FOREIGN KEY ("pieceUnitId") REFERENCES "PieceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
