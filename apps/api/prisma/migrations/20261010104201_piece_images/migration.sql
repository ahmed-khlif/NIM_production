-- CreateTable
CREATE TABLE "PieceImage" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PieceImage_storageKey_key" ON "PieceImage"("storageKey");

-- CreateIndex
CREATE INDEX "PieceImage_pieceId_sortOrder_createdAt_idx" ON "PieceImage"("pieceId", "sortOrder", "createdAt");

-- CreateIndex
CREATE INDEX "PieceImage_uploadedById_createdAt_idx" ON "PieceImage"("uploadedById", "createdAt");

-- AddForeignKey
ALTER TABLE "PieceImage" ADD CONSTRAINT "PieceImage_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "Piece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceImage" ADD CONSTRAINT "PieceImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
