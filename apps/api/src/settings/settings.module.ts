import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({ imports: [AuthModule, PrismaModule], controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
