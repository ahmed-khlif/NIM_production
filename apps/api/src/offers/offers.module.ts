import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
