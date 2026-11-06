import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
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
import { QualityService } from "./quality.service";

@Controller("quality")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER")
export class QualityController {
  constructor(@Inject(QualityService) private readonly qualityService: QualityService) {}

  @Get("pending")
  async pending(
    @Query("offerId") offerId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDirection") sortDirection?: string,
  ) {
    return this.qualityService.listPending(offerId, { page: page === undefined ? 1 : Number(page), pageSize: pageSize === undefined ? 20 : Number(pageSize), search, sortBy, sortDirection });
  }

  @Get("history")
  async history(
    @Query("offerId") offerId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("result") result?: string,
  ) {
    return this.qualityService.listHistory(offerId, { page: page === undefined ? 1 : Number(page), pageSize: pageSize === undefined ? 20 : Number(pageSize), search, result });
  }

  @Get("controls/:qualityControlId/images/:imageId")
  @Header("Cache-Control", "private, max-age=300")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async defectImage(
    @Param("qualityControlId") qualityControlId: string,
    @Param("imageId") imageId: string,
  ): Promise<StreamableFile> {
    const image = await this.qualityService.readDefectImage(qualityControlId, imageId);
    return new StreamableFile(image.buffer, {
      type: image.mimeType,
      disposition: `inline; filename="${image.originalName.replace(/"/g, "")}"`,
    });
  }

  @Post(":pieceUnitId/validate")
  @Roles("ADMIN", "QUALITY_CONTROLLER")
  async validate(
    @CurrentAuth() actor: AuthContext,
    @Param("pieceUnitId") pieceUnitId: string,
    @Body() body: unknown,
  ): Promise<{ control: Awaited<ReturnType<QualityService["validate"]>> }> {
    return { control: await this.qualityService.validate(actor, pieceUnitId, body) };
  }

  @Post(":pieceUnitId/disposition")
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async disposition(
    @CurrentAuth() actor: AuthContext,
    @Param("pieceUnitId") pieceUnitId: string,
    @Body() body: unknown,
  ): Promise<{ disposition: Awaited<ReturnType<QualityService["requestDisposition"]>> }> {
    return { disposition: await this.qualityService.requestDisposition(actor, pieceUnitId, body) };
  }

  @Post("dispositions/:dispositionId/decision")
  @Roles("ADMIN")
  async decideDeviation(
    @CurrentAuth() actor: AuthContext,
    @Param("dispositionId") dispositionId: string,
    @Body() body: unknown,
  ): Promise<{ disposition: Awaited<ReturnType<QualityService["decideDeviation"]>> }> {
    return { disposition: await this.qualityService.decideDeviation(actor, dispositionId, body) };
  }

  @Post("controls/:qualityControlId/images")
  @Roles("ADMIN", "QUALITY_CONTROLLER")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadDefectImage(
    @CurrentAuth() actor: AuthContext,
    @Param("qualityControlId") qualityControlId: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
  ): Promise<{ image: Awaited<ReturnType<QualityService["addDefectImage"]>> }> {
    return { image: await this.qualityService.addDefectImage(actor, qualityControlId, file) };
  }

  @Delete("controls/:qualityControlId/images/:imageId")
  @Roles("ADMIN", "QUALITY_CONTROLLER")
  async removeDefectImage(
    @CurrentAuth() actor: AuthContext,
    @Param("qualityControlId") qualityControlId: string,
    @Param("imageId") imageId: string,
  ): Promise<{ success: true }> {
    return this.qualityService.removeDefectImage(actor, qualityControlId, imageId);
  }
}
