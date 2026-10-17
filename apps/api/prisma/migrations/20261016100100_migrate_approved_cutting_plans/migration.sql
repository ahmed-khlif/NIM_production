-- Historical APPROVED plans already materialized every bar in one transaction.
-- Preserve that fact explicitly before enabling partial validation for new plans.
UPDATE "CuttingPlan"
SET "status" = 'VALIDATED'
WHERE "status" = 'APPROVED';

DROP INDEX "CuttingPlan_offerId_one_approved_idx";
CREATE UNIQUE INDEX "CuttingPlan_offerId_one_active_validation_idx"
ON "CuttingPlan"("offerId")
WHERE "status" IN ('APPROVED', 'PARTIALLY_VALIDATED');
