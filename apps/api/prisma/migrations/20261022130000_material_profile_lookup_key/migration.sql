ALTER TABLE "MaterialProfile" ADD COLUMN "profileKey" TEXT;

UPDATE "MaterialProfile"
SET "profileKey" = UPPER(REGEXP_REPLACE("profile", '[[:space:]]+', '', 'g'));

ALTER TABLE "MaterialProfile" ALTER COLUMN "profileKey" SET NOT NULL;

CREATE UNIQUE INDEX "MaterialProfile_profileKey_key" ON "MaterialProfile"("profileKey");
