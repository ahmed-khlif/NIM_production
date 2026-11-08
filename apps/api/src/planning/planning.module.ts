import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PlanningController } from "./planning.controller";
import { PlanningService } from "./planning.service";

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
