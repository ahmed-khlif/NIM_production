-- CreateEnum
CREATE TYPE "QualityControlResult" AS ENUM ('CONFORM', 'NON_CONFORM');

-- CreateTable
CREATE TABLE "QualityControl" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceUnitId" TEXT NOT NULL,
    "controllerId" TEXT NOT NULL,
    "result" "QualityControlResult" NOT NULL,
    "comment" TEXT,
    "controlledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "QualityControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualityControl_controllerId_controlledAt_idx" ON "QualityControl"("controllerId", "controlledAt");

-- CreateIndex
CREATE INDEX "QualityControl_result_controlledAt_idx" ON "QualityControl"("result", "controlledAt");

-- CreateIndex
CREATE INDEX "QualityControl_pieceId_controlledAt_idx" ON "QualityControl"("pieceId", "controlledAt");

-- CreateIndex
CREATE UNIQUE INDEX "QualityControl_pieceUnitId_key" ON "QualityControl"("pieceUnitId");

-- AddForeignKey
ALTER TABLE "QualityControl" ADD CONSTRAINT "QualityControl_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "Piece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityControl" ADD CONSTRAINT "QualityControl_pieceUnitId_fkey" FOREIGN KEY ("pieceUnitId") REFERENCES "PieceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityControl" ADD CONSTRAINT "QualityControl_controllerId_fkey" FOREIGN KEY ("controllerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
