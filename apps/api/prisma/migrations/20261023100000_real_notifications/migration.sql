CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "sourceEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "actorName" TEXT,
    "offerId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_sourceEventId_recipientUserId_key"
    ON "Notification"("sourceEventId", "recipientUserId");
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx"
    ON "Notification"("recipientUserId", "readAt", "createdAt");
CREATE INDEX "Notification_recipientUserId_createdAt_idx"
    ON "Notification"("recipientUserId", "createdAt");
CREATE INDEX "Notification_recipientUserId_offerId_createdAt_idx"
    ON "Notification"("recipientUserId", "offerId", "createdAt");

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_sourceEventId_fkey"
    FOREIGN KEY ("sourceEventId") REFERENCES "HistoryEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
