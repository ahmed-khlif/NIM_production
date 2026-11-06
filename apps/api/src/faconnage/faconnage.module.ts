import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { CuttingOptimizer } from "./cutting-optimizer";
import { CuttingOptimizerExecution } from "./cutting-optimizer-execution";
import { FaconnageController } from "./faconnage.controller";
import { FaconnageService } from "./faconnage.service";
import { CuttingBarsModule } from "../cutting-bars/cutting-bars.module";

@Module({
  imports: [AuthModule, PrismaModule, CuttingBarsModule],
  controllers: [FaconnageController],
  providers: [CuttingOptimizer, CuttingOptimizerExecution, FaconnageService],
})
export class FaconnageModule {}
