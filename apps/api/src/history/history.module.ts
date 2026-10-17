import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { HistoryController } from "./history.controller";
import { HistoryService } from "./history.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
