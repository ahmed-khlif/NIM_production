CREATE TYPE "ScheduleEventType" AS ENUM ('PRODUCTION', 'MAINTENANCE', 'MACHINE_BLOCK');
CREATE TYPE "ScheduleEventStatus" AS ENUM ('PLANNED', 'CANCELLED');

CREATE TABLE "ScheduleEvent" (
    "id" TEXT NOT NULL,
    "type" "ScheduleEventType" NOT NULL,
    "status" "ScheduleEventStatus" NOT NULL DEFAULT 'PLANNED',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "machineId" TEXT NOT NULL,
    "cuttingBarId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ScheduleEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleEvent_valid_interval_check" CHECK ("startAt" < "endAt"),
    CONSTRAINT "ScheduleEvent_production_requires_bar_check" CHECK (("type" = 'PRODUCTION') = ("cuttingBarId" IS NOT NULL))
);

CREATE TABLE "ScheduleEventOperator" (
    "id" TEXT NOT NULL,
    "scheduleEventId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "role" "MachineSessionOperatorRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),
    CONSTRAINT "ScheduleEventOperator_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleEventOperator_active_removed_check" CHECK (("active" AND "removedAt" IS NULL) OR (NOT "active" AND "removedAt" IS NOT NULL))
);

ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_machineId_fkey"
    FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_cuttingBarId_fkey"
    FOREIGN KEY ("cuttingBarId") REFERENCES "CuttingBar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEventOperator" ADD CONSTRAINT "ScheduleEventOperator_scheduleEventId_fkey"
    FOREIGN KEY ("scheduleEventId") REFERENCES "ScheduleEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEventOperator" ADD CONSTRAINT "ScheduleEventOperator_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ScheduleEvent_machineId_status_startAt_endAt_idx"
    ON "ScheduleEvent"("machineId", "status", "startAt", "endAt");
CREATE INDEX "ScheduleEvent_cuttingBarId_status_idx"
    ON "ScheduleEvent"("cuttingBarId", "status");
CREATE INDEX "ScheduleEvent_type_status_startAt_idx"
    ON "ScheduleEvent"("type", "status", "startAt");
CREATE INDEX "ScheduleEvent_createdById_createdAt_idx"
    ON "ScheduleEvent"("createdById", "createdAt");
CREATE UNIQUE INDEX "ScheduleEvent_one_active_production_per_bar_key"
    ON "ScheduleEvent"("cuttingBarId")
    WHERE "type" = 'PRODUCTION' AND "status" = 'PLANNED' AND "cuttingBarId" IS NOT NULL;

CREATE INDEX "ScheduleEventOperator_scheduleEventId_active_role_idx"
    ON "ScheduleEventOperator"("scheduleEventId", "active", "role");
CREATE INDEX "ScheduleEventOperator_operatorId_active_idx"
    ON "ScheduleEventOperator"("operatorId", "active");
CREATE UNIQUE INDEX "ScheduleEventOperator_one_active_membership_key"
    ON "ScheduleEventOperator"("scheduleEventId", "operatorId") WHERE "active";
CREATE UNIQUE INDEX "ScheduleEventOperator_one_active_lead_key"
    ON "ScheduleEventOperator"("scheduleEventId") WHERE "active" AND "role" = 'LEAD';

-- All planning writers take transaction-scoped advisory locks keyed by machine/operator
-- before checking ranges. This keeps overlap validation atomic across concurrent API calls.
