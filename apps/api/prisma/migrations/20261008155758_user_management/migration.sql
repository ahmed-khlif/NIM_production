-- AlterTable
ALTER TABLE "HistoryEvent" ADD COLUMN     "actorRole" "UserRole";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledAt" TIMESTAMP(3);
