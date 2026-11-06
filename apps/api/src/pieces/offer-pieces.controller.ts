import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { PiecesService } from "./pieces.service";

@Controller("offers/:offerId/pieces")
@UseGuards(AuthGuard)
export class OfferPiecesController {
  constructor(@Inject(PiecesService) private readonly piecesService: PiecesService) {}

  @Get()
  async list(
    @Param("offerId") offerId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<PiecesService["listPieces"]>>> {
    return this.piecesService.listPieces(offerId, query);
  }

  @Get("facets")
  async facets(
    @Param("offerId") offerId: string,
  ): Promise<Awaited<ReturnType<PiecesService["listPieceFacets"]>>> {
    return this.piecesService.listPieceFacets(offerId);
  }

  @Get("profiles")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async profiles(
    @Param("offerId") offerId: string,
  ): Promise<Awaited<ReturnType<PiecesService["listAvailableProfiles"]>>> {
    return this.piecesService.listAvailableProfiles(offerId);
  }

  @Post("faconnage/prepare")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async prepareFaconnage(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ): Promise<{ preparation: Awaited<ReturnType<PiecesService["prepareFaconnage"]>> }> {
    return { preparation: await this.piecesService.prepareFaconnage(actor, offerId, body) };
  }

  @Post("import/preview")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async previewImport(
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ): Promise<{ preview: Awaited<ReturnType<PiecesService["previewImport"]>> }> {
    return { preview: await this.piecesService.previewImport(offerId, body) };
  }

  @Post("import")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async import(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ): Promise<{ result: Awaited<ReturnType<PiecesService["commitImport"]>> }> {
    return { result: await this.piecesService.commitImport(actor, offerId, body) };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async create(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["createPiece"]>> }> {
    return { piece: await this.piecesService.createPiece(actor, offerId, body) };
  }

  @Post("batch")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async createBatch(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ): Promise<{ pieces: Awaited<ReturnType<PiecesService["createPiecesBatch"]>>["pieces"] }> {
    return this.piecesService.createPiecesBatch(actor, offerId, body);
  }

  @Get(":id")
  async detail(
    @Param("offerId") offerId: string,
    @Param("id") id: string,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["getPiece"]>> }> {
    return { piece: await this.piecesService.getPiece(id, offerId) };
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async update(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["updatePiece"]>> }> {
    return { piece: await this.piecesService.updatePiece(actor, offerId, id, body) };
  }

  @Post(":id/archive")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async archive(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("id") id: string,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["archivePiece"]>> }> {
    return { piece: await this.piecesService.archivePiece(actor, offerId, id) };
  }

  @Delete("bulk")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async deleteUnused(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Body() body: unknown,
  ): Promise<{ deletedCount: number }> {
    return this.piecesService.deleteUnusedPieces(actor, offerId, body);
  }

  @Post(":id/images")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadImage(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("id") id: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
  ): Promise<{ image: Awaited<ReturnType<PiecesService["addPieceImage"]>> }> {
    await this.piecesService.getPiece(id, offerId);
    return { image: await this.piecesService.addPieceImage(actor, id, file) };
  }

  @Get(":pieceId/images/:imageId")
  @Header("Cache-Control", "private, max-age=300")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async image(
    @Param("offerId") offerId: string,
    @Param("pieceId") pieceId: string,
    @Param("imageId") imageId: string,
  ): Promise<StreamableFile> {
    await this.piecesService.getPiece(pieceId, offerId);
    const image = await this.piecesService.readPieceImage(pieceId, imageId);
    return new StreamableFile(image.buffer, {
      type: image.mimeType,
      disposition: `inline; filename="${image.originalName.replace(/"/g, "")}"`,
    });
  }

  @Delete(":pieceId/images/:imageId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async removeImage(
    @CurrentAuth() actor: AuthContext,
    @Param("offerId") offerId: string,
    @Param("pieceId") pieceId: string,
    @Param("imageId") imageId: string,
  ): Promise<{ success: true }> {
    await this.piecesService.getPiece(pieceId, offerId);
    return this.piecesService.removePieceImage(actor, pieceId, imageId);
  }
}
