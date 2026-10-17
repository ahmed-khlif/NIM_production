import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { OperatorAuthGuard } from "./operator-auth.guard";
import { OperatorAuthService } from "./operator-auth.service";
import { OperatorTabletAuthController } from "./operator-tablet-auth.controller";
import { OperatorsController } from "./operators.controller";
import { OperatorsService } from "./operators.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [OperatorsController, OperatorTabletAuthController],
  providers: [OperatorsService, OperatorAuthService, OperatorAuthGuard],
  exports: [OperatorsService, OperatorAuthService, OperatorAuthGuard],
})
export class OperatorsModule {}
