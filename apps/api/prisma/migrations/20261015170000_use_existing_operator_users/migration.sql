ALTER TABLE "User"
    ADD COLUMN "tabletAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "connectionKeyId" TEXT,
    ADD COLUMN "connectionKeyHash" TEXT;

CREATE TEMP TABLE "_OperatorUserMap" AS
SELECT operator."id" AS "operatorId", matched."id" AS "userId"
FROM "Operator" operator
JOIN LATERAL (
    SELECT account."id"
    FROM "User" account
    WHERE account."role" = 'OPERATOR'
      AND lower(regexp_replace(trim(account."displayName"), '\s+', ' ', 'g')) =
          lower(regexp_replace(trim(operator."firstName" || ' ' || operator."lastName"), '\s+', ' ', 'g'))
    ORDER BY account."id"
    LIMIT 1
) matched ON true
WHERE (
    SELECT count(*)
    FROM "User" account
    WHERE account."role" = 'OPERATOR'
      AND lower(regexp_replace(trim(account."displayName"), '\s+', ' ', 'g')) =
          lower(regexp_replace(trim(operator."firstName" || ' ' || operator."lastName"), '\s+', ' ', 'g'))
) = 1;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Operator" operator
        WHERE (
            SELECT count(*)
            FROM "User" account
            WHERE account."role" = 'OPERATOR'
              AND lower(regexp_replace(trim(account."displayName"), '\s+', ' ', 'g')) =
                  lower(regexp_replace(trim(operator."firstName" || ' ' || operator."lastName"), '\s+', ' ', 'g'))
        ) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot unify operator identities: a legacy operator name matches multiple OPERATOR users.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "_OperatorUserMap" GROUP BY "userId" HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot unify operator identities: multiple legacy profiles match one user.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "Operator" operator
        WHERE NOT EXISTS (SELECT 1 FROM "_OperatorUserMap" mapping WHERE mapping."operatorId" = operator."id")
          AND (
            EXISTS (SELECT 1 FROM "MachineSession" row WHERE row."leadOperatorId" = operator."id") OR
            EXISTS (SELECT 1 FROM "MachineSessionOperator" row WHERE row."operatorId" = operator."id") OR
            EXISTS (SELECT 1 FROM "ProductionRun" row WHERE row."startedByOperatorId" = operator."id") OR
            EXISTS (SELECT 1 FROM "NonConformity" row WHERE row."reportedByOperatorId" = operator."id") OR
            EXISTS (SELECT 1 FROM "PieceUnit" row WHERE row."currentProductionOperatorId" = operator."id") OR
            EXISTS (SELECT 1 FROM "HistoryEvent" row WHERE row."actorOperatorId" = operator."id") OR
            EXISTS (SELECT 1 FROM "OperatorAuthSession" row WHERE row."operatorId" = operator."id")
          )
    ) THEN
        RAISE EXCEPTION 'Cannot unify operator identities: an unmatched legacy profile has production history or an active tablet session. Link it to its exact User before retrying.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "HistoryEvent" event
        JOIN "_OperatorUserMap" mapping ON mapping."operatorId" = event."actorOperatorId"
        WHERE event."actorUserId" IS NOT NULL AND event."actorUserId" <> mapping."userId"
    ) THEN
        RAISE EXCEPTION 'Cannot unify operator history: an event already has a different user actor.';
    END IF;
END $$;

CREATE TABLE "TabletAuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "TabletAuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LegacyOperatorArchive" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "connectionKeyId" TEXT NOT NULL,
    "connectionKeyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LegacyOperatorArchive_pkey" PRIMARY KEY ("id")
);
INSERT INTO "LegacyOperatorArchive" SELECT * FROM "Operator";

CREATE TABLE "LegacyOperatorAuthSessionArchive" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "LegacyOperatorAuthSessionArchive_pkey" PRIMARY KEY ("id")
);
INSERT INTO "LegacyOperatorAuthSessionArchive" SELECT * FROM "OperatorAuthSession";

UPDATE "User" account
SET "connectionKeyId" = operator."connectionKeyId",
    "connectionKeyHash" = operator."connectionKeyHash",
    "tabletAccessEnabled" = operator."active" AND account."isActive",
    "lastLoginAt" = GREATEST(account."lastLoginAt", operator."lastActivityAt")
FROM "_OperatorUserMap" mapping
JOIN "Operator" operator ON operator."id" = mapping."operatorId"
WHERE account."id" = mapping."userId";

INSERT INTO "TabletAuthSession" ("id", "userId", "tokenHash", "expiresAt", "revokedAt", "createdAt", "lastUsedAt")
SELECT session."id", mapping."userId", session."tokenHash", session."expiresAt", session."revokedAt", session."createdAt", session."lastUsedAt"
FROM "OperatorAuthSession" session
JOIN "_OperatorUserMap" mapping ON mapping."operatorId" = session."operatorId";

ALTER TABLE "OperatorAuthSession" DROP CONSTRAINT "OperatorAuthSession_operatorId_fkey";
ALTER TABLE "MachineSession" DROP CONSTRAINT "MachineSession_leadOperatorId_fkey";
ALTER TABLE "MachineSessionOperator" DROP CONSTRAINT "MachineSessionOperator_operatorId_fkey";
ALTER TABLE "ProductionRun" DROP CONSTRAINT "ProductionRun_startedByOperatorId_fkey";
ALTER TABLE "NonConformity" DROP CONSTRAINT "NonConformity_reportedByOperatorId_fkey";
ALTER TABLE "PieceUnit" DROP CONSTRAINT "PieceUnit_currentProductionOperatorId_fkey";
ALTER TABLE "HistoryEvent" DROP CONSTRAINT "HistoryEvent_actorOperatorId_fkey";

UPDATE "MachineSession" row SET "leadOperatorId" = mapping."userId"
FROM "_OperatorUserMap" mapping WHERE row."leadOperatorId" = mapping."operatorId";
UPDATE "MachineSessionOperator" row SET "operatorId" = mapping."userId"
FROM "_OperatorUserMap" mapping WHERE row."operatorId" = mapping."operatorId";
UPDATE "ProductionRun" row SET "startedByOperatorId" = mapping."userId"
FROM "_OperatorUserMap" mapping WHERE row."startedByOperatorId" = mapping."operatorId";
UPDATE "NonConformity" row SET "reportedByOperatorId" = mapping."userId"
FROM "_OperatorUserMap" mapping WHERE row."reportedByOperatorId" = mapping."operatorId";
UPDATE "PieceUnit" row SET "currentProductionOperatorId" = mapping."userId"
FROM "_OperatorUserMap" mapping WHERE row."currentProductionOperatorId" = mapping."operatorId";
UPDATE "HistoryEvent" row
SET "actorUserId" = COALESCE(row."actorUserId", mapping."userId"),
    "actorRole" = COALESCE(row."actorRole", 'OPERATOR'::"UserRole")
FROM "_OperatorUserMap" mapping WHERE row."actorOperatorId" = mapping."operatorId";

ALTER TABLE "TabletAuthSession"
    ADD CONSTRAINT "TabletAuthSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MachineSession"
    ADD CONSTRAINT "MachineSession_leadOperatorId_fkey"
    FOREIGN KEY ("leadOperatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MachineSessionOperator"
    ADD CONSTRAINT "MachineSessionOperator_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRun"
    ADD CONSTRAINT "ProductionRun_startedByOperatorId_fkey"
    FOREIGN KEY ("startedByOperatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NonConformity"
    ADD CONSTRAINT "NonConformity_reportedByOperatorId_fkey"
    FOREIGN KEY ("reportedByOperatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PieceUnit"
    ADD CONSTRAINT "PieceUnit_currentProductionOperatorId_fkey"
    FOREIGN KEY ("currentProductionOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HistoryEvent" DROP COLUMN "actorOperatorId";
ALTER TABLE "OperatorAuthSession" DROP CONSTRAINT "OperatorAuthSession_pkey";
DROP TABLE "OperatorAuthSession";
DROP TABLE "Operator";

CREATE UNIQUE INDEX "User_connectionKeyId_key" ON "User"("connectionKeyId");
CREATE INDEX "User_role_tabletAccessEnabled_isActive_idx" ON "User"("role", "tabletAccessEnabled", "isActive");
CREATE UNIQUE INDEX "TabletAuthSession_tokenHash_key" ON "TabletAuthSession"("tokenHash");
CREATE INDEX "TabletAuthSession_userId_expiresAt_idx" ON "TabletAuthSession"("userId", "expiresAt");
CREATE INDEX "TabletAuthSession_revokedAt_expiresAt_idx" ON "TabletAuthSession"("revokedAt", "expiresAt");

DROP TABLE "_OperatorUserMap";
