-- Add a terminal scrap state without deleting existing production history.
ALTER TYPE "PieceUnitStatus" ADD VALUE 'SCRAPPED';

CREATE TYPE "QualityDefectCategory" AS ENUM (
    'DIMENSIONAL',
    'SURFACE',
    'MATERIAL',
    'WELDING',
    'FINISH',
    'DAMAGE',
    'OTHER'
);

CREATE TYPE "QualityDispositionType" AS ENUM ('REWORK', 'SCRAP', 'REMAKE', 'DEVIATION');

CREATE TYPE "QualityDispositionStatus" AS ENUM ('COMPLETED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "QualityControl"
ADD COLUMN "defectCategory" "QualityDefectCategory",
ADD COLUMN "cycle" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "QualityControl_pieceUnitId_key";
CREATE INDEX "QualityControl_pieceUnitId_cycle_idx" ON "QualityControl"("pieceUnitId", "cycle");

CREATE TABLE "QualityControlImage" (
    "id" TEXT NOT NULL,
    "qualityControlId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityControlImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QualityControlImage_storageKey_key" ON "QualityControlImage"("storageKey");
CREATE INDEX "QualityControlImage_qualityControlId_createdAt_idx" ON "QualityControlImage"("qualityControlId", "createdAt");
CREATE INDEX "QualityControlImage_uploadedById_createdAt_idx" ON "QualityControlImage"("uploadedById", "createdAt");

ALTER TABLE "QualityControlImage"
ADD CONSTRAINT "QualityControlImage_qualityControlId_fkey"
FOREIGN KEY ("qualityControlId") REFERENCES "QualityControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QualityControlImage"
ADD CONSTRAINT "QualityControlImage_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QualityDisposition" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceUnitId" TEXT NOT NULL,
    "qualityControlId" TEXT NOT NULL,
    "type" "QualityDispositionType" NOT NULL,
    "status" "QualityDispositionStatus" NOT NULL DEFAULT 'COMPLETED',
    "reason" TEXT NOT NULL,
    "approvalComment" TEXT,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QualityDisposition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QualityDisposition_pieceUnitId_requestedAt_idx" ON "QualityDisposition"("pieceUnitId", "requestedAt");
CREATE INDEX "QualityDisposition_status_type_requestedAt_idx" ON "QualityDisposition"("status", "type", "requestedAt");
CREATE INDEX "QualityDisposition_qualityControlId_requestedAt_idx" ON "QualityDisposition"("qualityControlId", "requestedAt");

ALTER TABLE "QualityDisposition"
ADD CONSTRAINT "QualityDisposition_pieceId_fkey"
FOREIGN KEY ("pieceId") REFERENCES "Piece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QualityDisposition"
ADD CONSTRAINT "QualityDisposition_pieceUnitId_fkey"
FOREIGN KEY ("pieceUnitId") REFERENCES "PieceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QualityDisposition"
ADD CONSTRAINT "QualityDisposition_qualityControlId_fkey"
FOREIGN KEY ("qualityControlId") REFERENCES "QualityControl"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QualityDisposition"
ADD CONSTRAINT "QualityDisposition_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QualityDisposition"
ADD CONSTRAINT "QualityDisposition_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
