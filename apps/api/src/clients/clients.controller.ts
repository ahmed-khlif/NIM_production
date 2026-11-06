import {
  Controller,
  Delete,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Header,
  StreamableFile,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import type { AuthContext } from "../auth/auth.types";
import { ClientsService } from "./clients.service";

@Controller("clients")
@UseGuards(AuthGuard, RolesGuard)
@Roles("ADMIN", "PRODUCTION_MANAGER")
export class ClientsController {
  constructor(@Inject(ClientsService) private readonly clientsService: ClientsService) {}

  @Get()
  list(
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("includeArchived") includeArchived?: string,
    @Query("status") status?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDirection") sortDirection?: string,
  ) {
    return this.clientsService.list({
      search,
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      includeArchived: includeArchived === "true",
      status,
      sortBy,
      sortDirection,
    });
  }

  @Get("export/data")
  @Header("Cache-Control", "private, no-store")
  exportData(@Query("search") search?: string, @Query("status") status?: string) {
    return this.clientsService.exportData({ search, status });
  }

  @Get("export")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @Header("Content-Disposition", 'attachment; filename="nim-clients.xlsx"')
  async exportWorkbook(
    @Query("search") search?: string,
    @Query("status") status?: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.clientsService.exportWorkbook({ search, status }));
  }

  @Post()
  create(@CurrentAuth() actor: AuthContext, @Body() body: unknown) {
    return this.clientsService.create(actor, body);
  }

  @Get(":id/photo")
  @Header("Cache-Control", "private, max-age=300")
  @Header("Cross-Origin-Resource-Policy", "cross-origin")
  async photo(@Param("id") id: string): Promise<StreamableFile> {
    const photo = await this.clientsService.readPhoto(id);
    return new StreamableFile(photo.buffer, { type: photo.mimeType, disposition: "inline" });
  }

  @Post(":id/photo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  replacePhoto(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
  ) {
    return this.clientsService.replacePhoto(actor, id, file);
  }

  @Delete(":id/photo")
  removePhoto(@CurrentAuth() actor: AuthContext, @Param("id") id: string) {
    return this.clientsService.removePhoto(actor, id);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return { client: await this.clientsService.get(id) };
  }

  @Patch(":id")
  update(@CurrentAuth() actor: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.clientsService.update(actor, id, body);
  }

  @Post(":id/archive")
  @Roles("ADMIN")
  archive(@CurrentAuth() actor: AuthContext, @Param("id") id: string) {
    return this.clientsService.archive(actor, id);
  }

  @Post(":id/restore")
  @Roles("ADMIN")
  restore(@CurrentAuth() actor: AuthContext, @Param("id") id: string) {
    return this.clientsService.restore(actor, id);
  }
}
