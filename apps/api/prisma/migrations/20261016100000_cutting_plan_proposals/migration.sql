ALTER TYPE "CuttingPlanStatus" ADD VALUE 'PARTIALLY_VALIDATED';
ALTER TYPE "CuttingPlanStatus" ADD VALUE 'VALIDATED';
ALTER TYPE "CuttingPlanStatus" ADD VALUE 'CANCELLED';

CREATE TYPE "CuttingPlanProposalStatus" AS ENUM ('PROPOSED', 'VALIDATED', 'CANCELLED');

CREATE TABLE "CuttingPlanProposal" (
    "id" TEXT NOT NULL,
    "cuttingPlanId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "profile" TEXT NOT NULL,
    "rawLengthMm" INTEGER NOT NULL,
    "usedLengthMm" INTEGER NOT NULL,
    "wasteMm" INTEGER NOT NULL,
    "cuts" JSONB NOT NULL,
    "status" "CuttingPlanProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "validatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuttingPlanProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuttingPlanProposal_cuttingPlanId_ordinal_key"
ON "CuttingPlanProposal"("cuttingPlanId", "ordinal");
CREATE UNIQUE INDEX "CuttingPlanProposal_cuttingPlanId_reference_key"
ON "CuttingPlanProposal"("cuttingPlanId", "reference");
CREATE INDEX "CuttingPlanProposal_cuttingPlanId_status_ordinal_idx"
ON "CuttingPlanProposal"("cuttingPlanId", "status", "ordinal");

ALTER TABLE "CuttingPlanProposal"
ADD CONSTRAINT "CuttingPlanProposal_cuttingPlanId_fkey"
FOREIGN KEY ("cuttingPlanId") REFERENCES "CuttingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CuttingPlanProposalItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "pieceUnitId" TEXT NOT NULL,
    CONSTRAINT "CuttingPlanProposalItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuttingPlanProposalItem_proposalId_pieceUnitId_key"
ON "CuttingPlanProposalItem"("proposalId", "pieceUnitId");
CREATE INDEX "CuttingPlanProposalItem_pieceUnitId_idx"
ON "CuttingPlanProposalItem"("pieceUnitId");

ALTER TABLE "CuttingPlanProposalItem"
ADD CONSTRAINT "CuttingPlanProposalItem_proposalId_fkey"
FOREIGN KEY ("proposalId") REFERENCES "CuttingPlanProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "CuttingPlanProposalItem_pieceUnitId_fkey"
FOREIGN KEY ("pieceUnitId") REFERENCES "PieceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CuttingBar" ADD COLUMN "proposalId" TEXT;
CREATE UNIQUE INDEX "CuttingBar_proposalId_key" ON "CuttingBar"("proposalId");

-- Preserve the existing materialized bars as already-validated proposals.
WITH ranked_bars AS (
    SELECT bar.*, row_number() OVER (
        PARTITION BY bar."cuttingPlanId" ORDER BY bar."createdAt", bar."id"
    )::INTEGER AS ordinal
    FROM "CuttingBar" bar
)
INSERT INTO "CuttingPlanProposal" (
    "id", "cuttingPlanId", "reference", "ordinal", "profile", "rawLengthMm",
    "usedLengthMm", "wasteMm", "cuts", "status", "validatedAt", "cancelledAt", "createdAt"
)
SELECT
    'legacy-' || bar."id",
    bar."cuttingPlanId",
    bar."reference",
    bar.ordinal,
    bar."profile",
    bar."rawLengthMm",
    bar."usedLengthMm",
    bar."wasteMm",
    COALESCE((
        SELECT jsonb_agg(jsonb_build_object('lengthMm', cuts."lengthMm", 'quantity', cuts.quantity)
                         ORDER BY cuts."lengthMm" DESC)
        FROM (
            SELECT piece."lengthMm", count(*)::INTEGER AS quantity
            FROM "CuttingBarItem" item
            JOIN "PieceUnit" unit ON unit."id" = item."pieceUnitId"
            JOIN "Piece" piece ON piece."id" = unit."pieceId"
            WHERE item."cuttingBarId" = bar."id" AND item."active" = true
            GROUP BY piece."lengthMm"
        ) cuts
    ), '[]'::jsonb),
    CASE WHEN bar."status" = 'CANCELLED' THEN 'CANCELLED'::"CuttingPlanProposalStatus"
         ELSE 'VALIDATED'::"CuttingPlanProposalStatus" END,
    CASE WHEN bar."status" = 'CANCELLED' THEN NULL ELSE bar."updatedAt" END,
    CASE WHEN bar."status" = 'CANCELLED' THEN bar."updatedAt" ELSE NULL END,
    bar."createdAt"
FROM ranked_bars bar;

UPDATE "CuttingBar" bar
SET "proposalId" = 'legacy-' || bar."id";

INSERT INTO "CuttingPlanProposalItem" ("id", "proposalId", "pieceUnitId")
SELECT 'legacy-item-' || md5(proposal."id" || ':' || item."pieceUnitId"), proposal."id", item."pieceUnitId"
FROM "CuttingBarItem" item
JOIN "CuttingBar" bar ON bar."id" = item."cuttingBarId"
JOIN "CuttingPlanProposal" proposal ON proposal."id" = bar."proposalId"
WHERE item."active" = true;

-- Keep existing saved drafts actionable by assigning their proposed cuts to stable unit IDs.
WITH parsed_bars AS (
    SELECT
        plan."id" AS plan_id,
        plan."offerId" AS offer_id,
        plan."reference" AS plan_reference,
        profile.value ->> 'profile' AS profile,
        profile.ordinality AS profile_ordinal,
        bar.value AS bar,
        bar.ordinality AS bar_ordinal,
        row_number() OVER (PARTITION BY plan."id" ORDER BY profile.ordinality, bar.ordinality)::INTEGER AS ordinal
    FROM "CuttingPlan" plan
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(plan."result" -> 'profiles') = 'array'
             THEN plan."result" -> 'profiles' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS profile(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(profile.value -> 'bars') = 'array'
             THEN profile.value -> 'bars' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS bar(value, ordinality)
    WHERE plan."status" = 'DRAFT'
), inserted_drafts AS (
    INSERT INTO "CuttingPlanProposal" (
        "id", "cuttingPlanId", "reference", "ordinal", "profile", "rawLengthMm",
        "usedLengthMm", "wasteMm", "cuts", "status", "createdAt"
    )
    SELECT
        'legacy-draft-' || plan_id || '-' || ordinal,
        plan_id,
        plan_reference || '-P' || lpad(ordinal::TEXT, 3, '0'),
        ordinal,
        profile,
        (bar ->> 'rawLengthMm')::INTEGER,
        (bar ->> 'usedLengthMm')::INTEGER,
        (bar ->> 'wasteMm')::INTEGER,
        COALESCE(bar -> 'cuts', '[]'::jsonb),
        'PROPOSED'::"CuttingPlanProposalStatus",
        CURRENT_TIMESTAMP
    FROM parsed_bars
    WHERE jsonb_typeof(bar -> 'cuts') = 'array'
    RETURNING "id", "cuttingPlanId", "ordinal", "profile", "cuts"
), proposal_slots AS (
    SELECT
        proposal."id" AS proposal_id,
        proposal."cuttingPlanId" AS plan_id,
        upper(regexp_replace(trim(proposal."profile"), '[[:space:]]+', ' ', 'g')) AS profile_key,
        (cut.value ->> 'lengthMm')::INTEGER AS length_mm,
        row_number() OVER (
            PARTITION BY proposal."cuttingPlanId",
                         upper(regexp_replace(trim(proposal."profile"), '[[:space:]]+', ' ', 'g')),
                         (cut.value ->> 'lengthMm')::INTEGER
            ORDER BY proposal."ordinal", cut.ordinality, slot.number
        )::INTEGER AS unit_ordinal
    FROM inserted_drafts proposal
    CROSS JOIN LATERAL jsonb_array_elements(proposal."cuts") WITH ORDINALITY AS cut(value, ordinality)
    CROSS JOIN LATERAL generate_series(1, (cut.value ->> 'quantity')::INTEGER) AS slot(number)
), ranked_units AS (
    SELECT
        plan."id" AS plan_id,
        upper(regexp_replace(trim(piece."profile"), '[[:space:]]+', ' ', 'g')) AS profile_key,
        piece."lengthMm" AS length_mm,
        unit."id" AS unit_id,
        row_number() OVER (
            PARTITION BY plan."id",
                         upper(regexp_replace(trim(piece."profile"), '[[:space:]]+', ' ', 'g')),
                         piece."lengthMm"
            ORDER BY piece."reference", unit."sequenceNumber", unit."id"
        )::INTEGER AS unit_ordinal
    FROM "CuttingPlan" plan
    JOIN "Piece" piece ON piece."offerId" = plan."offerId" AND piece."status" <> 'ARCHIVED'
    JOIN "PieceUnit" unit ON unit."pieceId" = piece."id" AND unit."status" = 'PENDING'
    WHERE plan."status" = 'DRAFT'
      AND NOT EXISTS (SELECT 1 FROM "Assignment" assignment WHERE assignment."pieceUnitId" = unit."id" AND assignment."active" = true)
      AND NOT EXISTS (SELECT 1 FROM "CuttingBarItem" item WHERE item."pieceUnitId" = unit."id" AND item."active" = true)
)
INSERT INTO "CuttingPlanProposalItem" ("id", "proposalId", "pieceUnitId")
SELECT
    'legacy-draft-item-' || md5(slot.proposal_id || ':' || unit.unit_id),
    slot.proposal_id,
    unit.unit_id
FROM proposal_slots slot
JOIN ranked_units unit
  ON unit.plan_id = slot.plan_id
 AND unit.profile_key = slot.profile_key
 AND unit.length_mm = slot.length_mm
 AND unit.unit_ordinal = slot.unit_ordinal;

ALTER TABLE "CuttingBar"
ADD CONSTRAINT "CuttingBar_proposalId_fkey"
FOREIGN KEY ("proposalId") REFERENCES "CuttingPlanProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
