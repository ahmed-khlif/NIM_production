ALTER TABLE "MaterialProfile" ADD COLUMN "reference" TEXT;

-- Existing catalogue rows keep working; their designation becomes the initial reference.
UPDATE "MaterialProfile" SET "reference" = "profile" WHERE "reference" IS NULL;

ALTER TABLE "MaterialProfile" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "MaterialProfile_reference_key" ON "MaterialProfile"("reference");
