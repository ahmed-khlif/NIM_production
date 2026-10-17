import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { parseEnvironment } from "@nim/validation";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infrastructure/prisma/prisma.module";
import { UsersModule } from "./users/users.module";
import { MachinesModule } from "./machines/machines.module";
import { PiecesModule } from "./pieces/pieces.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { ProductionModule } from "./production/production.module";
import { QualityModule } from "./quality/quality.module";
import { HistoryModule } from "./history/history.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SettingsModule } from "./settings/settings.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { FaconnageModule } from "./faconnage/faconnage.module";
import { OffersModule } from "./offers/offers.module";
import { CuttingBarsModule } from "./cutting-bars/cutting-bars.module";
import { OperatorsModule } from "./operators/operators.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) =>
        parseEnvironment(config as Record<string, string | undefined>),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MachinesModule,
    PiecesModule,
    AssignmentsModule,
    ProductionModule,
    QualityModule,
    HistoryModule,
    DashboardModule,
    SettingsModule,
    NotificationsModule,
    RealtimeModule,
    FaconnageModule,
    OffersModule,
    CuttingBarsModule,
    OperatorsModule,
  ],
})
export class AppModule {}
