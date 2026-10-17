import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentAuth, Roles } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { OffersService } from "./offers.service";

@Controller("offers")
@UseGuards(AuthGuard)
export class OffersController {
  constructor(@Inject(OffersService) private readonly offersService: OffersService) {}

  @Get()
  async list(
    @Query("search") search?: string,
    @Query("includeArchived") includeArchived?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("clientName") clientName?: string,
    @Query("site") site?: string,
  ): Promise<Awaited<ReturnType<OffersService["list"]>>> {
    return {
      ...await this.offersService.list({
        search,
        includeArchived: includeArchived === "true",
        page: page === undefined ? 1 : Number(page),
        pageSize: pageSize === undefined ? 20 : Number(pageSize),
        status,
        clientName,
        site,
      }),
    };
  }

  @Get(":id")
  async detail(
    @Param("id") id: string,
  ): Promise<{ offer: Awaited<ReturnType<OffersService["get"]>> }> {
    return { offer: await this.offersService.get(id) };
  }

  @Get(":id/production-summary")
  async productionSummary(
    @Param("id") id: string,
  ): Promise<{ summary: Awaited<ReturnType<OffersService["getProductionSummary"]>> }> {
    return { summary: await this.offersService.getProductionSummary(id) };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: unknown,
  ): Promise<{ offer: Awaited<ReturnType<OffersService["create"]>> }> {
    return { offer: await this.offersService.create(actor, body) };
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async update(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ offer: Awaited<ReturnType<OffersService["update"]>> }> {
    return { offer: await this.offersService.update(actor, id, body) };
  }

  @Post(":id/archive")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async archive(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<{ offer: Awaited<ReturnType<OffersService["archive"]>> }> {
    return { offer: await this.offersService.archive(actor, id) };
  }

  @Post(":id/restore")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async restore(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<{ offer: Awaited<ReturnType<OffersService["restore"]>> }> {
    return { offer: await this.offersService.restore(actor, id) };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  async remove(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<{ success: true }> {
    return this.offersService.remove(actor, id);
  }
}
