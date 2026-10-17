import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AssignmentsController } from "./assignments.controller";
import { AssignmentsService } from "./assignments.service";

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
