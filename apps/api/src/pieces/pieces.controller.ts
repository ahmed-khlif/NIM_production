import {
  BadRequestException,
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

function requireOfferId(body: unknown): string {
  const offerId =
    body && typeof body === "object" && "offerId" in body
      ? String((body as { offerId?: unknown }).offerId ?? "").trim()
      : "";
  if (!offerId) {
    throw new BadRequestException({
      code: "OFFER_CONTEXT_REQUIRED",
      message: "Ouvrez une offre avant de modifier ses pièces.",
    });
  }
  return offerId;
}

@Controller("pieces")
@UseGuards(AuthGuard)
export class PiecesController {
  constructor(@Inject(PiecesService) private readonly piecesService: PiecesService) {}

  @Get()
  async list(
    @Query() query: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<PiecesService["listPieces"]>>> {
    return this.piecesService.listPieces(undefined, query);
  }

  @Get("profiles")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async profiles(): Promise<Awaited<ReturnType<PiecesService["listAvailableProfiles"]>>> {
    return this.piecesService.listAvailableProfiles();
  }

  @Post("faconnage/prepare")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async prepareFaconnage(
    @CurrentAuth() actor: AuthContext,
    @Body() body: unknown,
  ): Promise<{ preparation: Awaited<ReturnType<PiecesService["prepareFaconnage"]>> }> {
    return {
      preparation: await this.piecesService.prepareFaconnage(actor, requireOfferId(body), body),
    };
  }

  @Get(":pieceId/images/:imageId")
  @Header("Cache-Control", "private, max-age=300")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async image(
    @Param("pieceId") pieceId: string,
    @Param("imageId") imageId: string,
  ): Promise<StreamableFile> {
    const image = await this.piecesService.readPieceImage(pieceId, imageId);
    return new StreamableFile(image.buffer, {
      type: image.mimeType,
      disposition: `inline; filename="${image.originalName.replace(/"/g, "")}"`,
    });
  }

  @Get(":id")
  async detail(
    @Param("id") id: string,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["getPiece"]>> }> {
    return { piece: await this.piecesService.getPiece(id) };
  }

  @Post(":id/images")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadImage(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
  ): Promise<{ image: Awaited<ReturnType<PiecesService["addPieceImage"]>> }> {
    return { image: await this.piecesService.addPieceImage(actor, id, file) };
  }

  @Delete(":pieceId/images/:imageId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async removeImage(
    @CurrentAuth() actor: AuthContext,
    @Param("pieceId") pieceId: string,
    @Param("imageId") imageId: string,
  ): Promise<{ success: true }> {
    return this.piecesService.removePieceImage(actor, pieceId, imageId);
  }

  @Post("import/preview")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async previewImport(
    @Body() body: unknown,
  ): Promise<{ preview: Awaited<ReturnType<PiecesService["previewImport"]>> }> {
    return { preview: await this.piecesService.previewImport(requireOfferId(body), body) };
  }

  @Post("import")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async import(
    @CurrentAuth() actor: AuthContext,
    @Body() body: unknown,
  ): Promise<{ result: Awaited<ReturnType<PiecesService["commitImport"]>> }> {
    return { result: await this.piecesService.commitImport(actor, requireOfferId(body), body) };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: unknown,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["createPiece"]>> }> {
    return { piece: await this.piecesService.createPiece(actor, requireOfferId(body), body) };
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async update(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["updatePiece"]>> }> {
    return { piece: await this.piecesService.updatePiece(actor, requireOfferId(body), id, body) };
  }

  @Post(":id/archive")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async archive(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ piece: Awaited<ReturnType<PiecesService["archivePiece"]>> }> {
    return { piece: await this.piecesService.archivePiece(actor, requireOfferId(body), id) };
  }
}
