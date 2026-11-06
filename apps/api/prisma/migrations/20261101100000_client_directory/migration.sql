CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "taxId" TEXT,
    "taxIdKey" TEXT,
    "phoneNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "imageStorageKey" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_nameKey_key" ON "Client"("nameKey");
CREATE UNIQUE INDEX "Client_taxIdKey_key" ON "Client"("taxIdKey");
CREATE UNIQUE INDEX "Client_imageStorageKey_key" ON "Client"("imageStorageKey");
CREATE INDEX "Client_archivedAt_name_idx" ON "Client"("archivedAt", "name");
CREATE INDEX "Client_createdById_createdAt_idx" ON "Client"("createdById", "createdAt");

ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Convert previously free-typed client names into shared records before requiring selection in the UI.
WITH grouped_clients AS (
    SELECT regexp_replace(lower(btrim("clientName")), '[[:space:]]+', ' ', 'g') AS "nameKey",
           min(btrim("clientName")) AS "name",
           min("createdById") AS "createdById",
           min("createdAt") AS "createdAt",
           max("updatedAt") AS "updatedAt"
    FROM "Offer"
    WHERE "clientName" IS NOT NULL AND btrim("clientName") <> ''
    GROUP BY regexp_replace(lower(btrim("clientName")), '[[:space:]]+', ' ', 'g')
)
INSERT INTO "Client" ("id", "name", "nameKey", "createdById", "createdAt", "updatedAt")
SELECT 'cl_' || md5("nameKey"), "name", "nameKey", "createdById", "createdAt", "updatedAt"
FROM grouped_clients
ON CONFLICT ("nameKey") DO NOTHING;

ALTER TABLE "Offer" ADD COLUMN "clientId" TEXT;

UPDATE "Offer" AS offer
SET "clientId" = client."id"
FROM "Client" AS client
WHERE offer."clientName" IS NOT NULL
  AND regexp_replace(lower(btrim(offer."clientName")), '[[:space:]]+', ' ', 'g') = client."nameKey";

CREATE INDEX "Offer_clientId_status_idx" ON "Offer"("clientId", "status");
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
