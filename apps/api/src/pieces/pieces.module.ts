import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../infrastructure/prisma/prisma.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PiecesController } from "./pieces.controller";
import { OfferPiecesController } from "./offer-pieces.controller";
import { PieceImageStorage } from "./piece-image.storage";
import { PiecesService } from "./pieces.service";

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [PiecesController, OfferPiecesController],
  providers: [PiecesService, PieceImageStorage],
})
export class PiecesModule {}
