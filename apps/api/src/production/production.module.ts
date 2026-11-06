import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { OperatorsModule } from "../operators/operators.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProductionController } from "./production.controller";
import {
  ProductionMonitorController,
  TabletProductionController,
} from "./tablet-production.controller";
import { ProductionService } from "./production.service";
import { TabletProductionService } from "./tablet-production.service";

@Module({
  imports: [AuthModule, OperatorsModule, NotificationsModule, PrismaModule, RealtimeModule],
  controllers: [ProductionController, TabletProductionController, ProductionMonitorController],
  providers: [ProductionService, TabletProductionService],
})
export class ProductionModule {}
