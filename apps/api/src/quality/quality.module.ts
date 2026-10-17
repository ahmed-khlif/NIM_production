import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PieceImageStorage } from "../pieces/piece-image.storage";
import { QualityController } from "./quality.controller";
import { QualityService } from "./quality.service";

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [QualityController],
  providers: [QualityService, PieceImageStorage],
})
export class QualityModule {}
