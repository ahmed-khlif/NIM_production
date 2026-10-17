-- Prevent concurrent execution of the same unit or two units by one operator.
CREATE UNIQUE INDEX "ProductionOperation_one_active_per_piece_unit"
ON "ProductionOperation"("pieceUnitId")
WHERE "status" = 'IN_PROGRESS';

CREATE UNIQUE INDEX "ProductionOperation_one_active_per_operator"
ON "ProductionOperation"("operatorId")
WHERE "status" = 'IN_PROGRESS';
