import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { MaterialProfilesController } from "./material-profiles.controller";
import { MaterialProfilesService } from "./material-profiles.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MaterialProfilesController],
  providers: [MaterialProfilesService],
})
export class MaterialProfilesModule {}
