import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CuttingBarsController } from "./cutting-bars.controller";
import { CuttingBarsService } from "./cutting-bars.service";

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [CuttingBarsController],
  providers: [CuttingBarsService],
  exports: [CuttingBarsService],
})
export class CuttingBarsModule {}
