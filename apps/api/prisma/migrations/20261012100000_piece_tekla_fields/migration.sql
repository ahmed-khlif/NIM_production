ALTER TABLE "Piece"
ADD COLUMN "quality" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "totalWeightKg" DECIMAL(14, 3),
ADD COLUMN "designation" TEXT NOT NULL DEFAULT 'À compléter';

UPDATE "Piece"
SET "totalWeightKg" = ROUND(("unitWeightKg" * "quantity")::numeric, 3)
WHERE "unitWeightKg" IS NOT NULL;
