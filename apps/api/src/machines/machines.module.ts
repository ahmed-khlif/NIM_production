import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { MachinesController } from "./machines.controller";
import { MachinesService } from "./machines.service";

@Module({ imports: [AuthModule, PrismaModule, RealtimeModule], controllers: [MachinesController], providers: [MachinesService] })
export class MachinesModule {}
