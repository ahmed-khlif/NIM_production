import { Module } from "@nestjs/common";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthGuard, RolesGuard } from "./auth.guards";
import { AuthService } from "./auth.service";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard],
  exports: [AuthService, AuthGuard, RolesGuard],
})
export class AuthModule {}
