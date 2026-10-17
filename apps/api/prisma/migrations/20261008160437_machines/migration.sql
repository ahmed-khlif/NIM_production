-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "internalNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "MachineStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Machine_internalNumber_key" ON "Machine"("internalNumber");

-- CreateIndex
CREATE INDEX "Machine_status_updatedAt_idx" ON "Machine"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Machine_type_idx" ON "Machine"("type");
