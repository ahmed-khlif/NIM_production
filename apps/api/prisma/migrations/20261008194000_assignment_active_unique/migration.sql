-- Keep exactly one active assignment for each traceable piece unit.
CREATE UNIQUE INDEX "Assignment_one_active_per_piece_unit"
ON "Assignment"("pieceUnitId")
WHERE "active" = true;
