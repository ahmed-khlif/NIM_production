-- Accelerate profile discovery and Façonnage preparation without changing Piece business data.
CREATE INDEX "Piece_status_profile_idx" ON "Piece"("status", "profile");
CREATE INDEX "Piece_profile_lengthMm_idx" ON "Piece"("profile", "lengthMm");
