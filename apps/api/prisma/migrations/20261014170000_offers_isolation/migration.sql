-- Introduce Offer as the business root for Pieces, imports and cutting plans.
-- Existing data is attached to one migration offer so the new required foreign keys are safe.

CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'READY', 'IN_PRODUCTION', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "CuttingPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "site" TEXT,
    "description" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "materialRevision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Offer_reference_key" ON "Offer"("reference");
CREATE INDEX "Offer_status_updatedAt_idx" ON "Offer"("status", "updatedAt");
CREATE INDEX "Offer_clientName_idx" ON "Offer"("clientName");
CREATE INDEX "Offer_site_idx" ON "Offer"("site");
CREATE INDEX "Offer_createdById_createdAt_idx" ON "Offer"("createdById", "createdAt");

ALTER TABLE "Offer"
ADD CONSTRAINT "Offer_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Piece" ADD COLUMN "offerId" TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "offerId" TEXT;

-- Migrate all existing data into an isolated legacy offer.
INSERT INTO "Offer" (
    "id", "reference", "revision", "name", "description", "status", "createdById", "version", "createdAt", "updatedAt"
)
SELECT
    'legacy-offer-migration-20261014',
    'LEGACY-2026',
    'A',
    'Données existantes',
    'Offre créée automatiquement pendant la migration afin de rattacher les pièces/imports existants.',
    'DRAFT',
    u."id",
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Piece") OR EXISTS (SELECT 1 FROM "ImportBatch")
ORDER BY u."createdAt" ASC
LIMIT 1
ON CONFLICT ("reference") DO NOTHING;

UPDATE "Piece"
SET "offerId" = 'legacy-offer-migration-20261014'
WHERE "offerId" IS NULL;

UPDATE "ImportBatch"
SET "offerId" = 'legacy-offer-migration-20261014'
WHERE "offerId" IS NULL;

-- Preserve continuity for an existing workshop already using assignments/production.
-- A legacy offer with active or previously started production must not be locked as a new draft.
UPDATE "Offer"
SET "status" = 'IN_PRODUCTION'
WHERE "id" = 'legacy-offer-migration-20261014'
  AND (
    EXISTS (
      SELECT 1
      FROM "Piece" p
      WHERE p."offerId" = 'legacy-offer-migration-20261014'
        AND p."status" IN ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED')
    )
    OR EXISTS (
      SELECT 1
      FROM "Assignment" a
      JOIN "PieceUnit" pu ON pu."id" = a."pieceUnitId"
      JOIN "Piece" p ON p."id" = pu."pieceId"
      WHERE p."offerId" = 'legacy-offer-migration-20261014'
        AND a."active" = true
    )
  );

ALTER TABLE "Piece" ALTER COLUMN "offerId" SET NOT NULL;
ALTER TABLE "ImportBatch" ALTER COLUMN "offerId" SET NOT NULL;

DROP INDEX IF EXISTS "Piece_reference_key";
CREATE UNIQUE INDEX "Piece_offerId_reference_key" ON "Piece"("offerId", "reference");
CREATE INDEX "Piece_offerId_status_dueDate_idx" ON "Piece"("offerId", "status", "dueDate");
CREATE INDEX "Piece_offerId_status_profile_idx" ON "Piece"("offerId", "status", "profile");
CREATE INDEX "Piece_offerId_profile_lengthMm_idx" ON "Piece"("offerId", "profile", "lengthMm");
CREATE INDEX "ImportBatch_offerId_createdAt_idx" ON "ImportBatch"("offerId", "createdAt");

ALTER TABLE "Piece"
ADD CONSTRAINT "Piece_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
ADD CONSTRAINT "ImportBatch_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CuttingPlan" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "CuttingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "profileCount" INTEGER NOT NULL,
    "totalBars" INTEGER NOT NULL,
    "totalRawLengthMm" INTEGER NOT NULL,
    "totalUsedLengthMm" INTEGER NOT NULL,
    "totalWasteMm" INTEGER NOT NULL,
    "utilizationRate" DECIMAL(6,2) NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuttingPlan_reference_key" ON "CuttingPlan"("reference");
CREATE INDEX "CuttingPlan_offerId_status_createdAt_idx" ON "CuttingPlan"("offerId", "status", "createdAt");
CREATE INDEX "CuttingPlan_createdById_createdAt_idx" ON "CuttingPlan"("createdById", "createdAt");
-- Defense in depth against concurrent approvals: only one approved plan per offer.
CREATE UNIQUE INDEX "CuttingPlan_offerId_one_approved_idx"
ON "CuttingPlan"("offerId")
WHERE "status" = 'APPROVED';

ALTER TABLE "CuttingPlan"
ADD CONSTRAINT "CuttingPlan_offerId_fkey"
FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CuttingPlan"
ADD CONSTRAINT "CuttingPlan_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CuttingPlan"
ADD CONSTRAINT "CuttingPlan_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
