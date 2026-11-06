import { BadRequestException, Body, Controller, Get, Header, Inject, Param, Patch, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { MaterialProfilesService } from "./material-profiles.service";

@Controller("material-profiles")
@UseGuards(AuthGuard)
export class MaterialProfilesController {
  constructor(@Inject(MaterialProfilesService) private readonly service: MaterialProfilesService) {}

  @Get()
  list(@CurrentAuth() actor: AuthContext, @Query("search") search?: string, @Query("includeInactive") includeInactive?: string) {
    return this.service.list(search, actor.user.role === "ADMIN" && includeInactive === "true");
  }

  @Post("import/preview")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async previewImport(@Body() body: { filename?: unknown; dataBase64?: unknown }) {
    if (typeof body?.filename !== "string" || typeof body?.dataBase64 !== "string") throw new BadRequestException({ code: "INVALID_FILE", message: "Fichier Excel requis." });
    return { preview: await this.service.previewImport(body.filename, body.dataBase64) };
  }

  @Get("export")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @Header("Content-Disposition", 'attachment; filename="nim-profils-matiere.xlsx"')
  async export(): Promise<StreamableFile> { return new StreamableFile(await this.service.exportWorkbook()); }

  @Post("import")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  import(@CurrentAuth() actor: AuthContext, @Body() body: unknown) { return this.service.import(actor, body); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  create(@CurrentAuth() actor: AuthContext, @Body() body: unknown) {
    return this.service.create(actor, body);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  update(@CurrentAuth() actor: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.service.update(actor, id, body);
  }
}
