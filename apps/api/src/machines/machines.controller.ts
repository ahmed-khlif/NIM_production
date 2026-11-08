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
import type { MachineDetail } from "@nim/types";
import { Roles, CurrentAuth } from "../auth/auth.decorators";
import { AuthGuard, RolesGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.types";
import { MachinesService } from "./machines.service";

@Controller("machines")
@UseGuards(AuthGuard)
export class MachinesController {
  constructor(@Inject(MachinesService) private readonly machinesService: MachinesService) {}

  @Get()
  async list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDirection") sortDirection?: string,
  ) {
    if (
      page === undefined &&
      pageSize === undefined &&
      search === undefined &&
      status === undefined
    ) {
      return { machines: await this.machinesService.listMachines() };
    }
    return this.machinesService.listMachinesPage({
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      search,
      status,
      sortBy,
      sortDirection,
    });
  }

  @Get(":id/queue")
  async queue(
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ): Promise<{
    machine: MachineDetail;
    queue: MachineDetail["queue"];
    pagination: MachineDetail["queuePagination"];
    activeOperationCount: number;
    activeProductionRunCount: number;
  }> {
    const detail = await this.machinesService.getMachine(id, {
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      search,
    });
    return {
      machine: detail,
      queue: detail.queue,
      pagination: detail.queuePagination,
      activeOperationCount: detail.activeOperationCount,
      activeProductionRunCount: detail.activeProductionRunCount,
    };
  }

  @Get(":id/releasable-bars")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async releasableBars(
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
  ) {
    return this.machinesService.getMachineReleasableBars(id, {
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 50 : Number(pageSize),
      search,
    });
  }

  @Get(":id")
  async detail(
    @Param("id") id: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDirection") sortDirection?: string,
  ): Promise<{ machine: Awaited<ReturnType<MachinesService["getMachine"]>> }> {
    return {
      machine: await this.machinesService.getMachine(id, {
        page: page === undefined ? 1 : Number(page),
        pageSize: pageSize === undefined ? 10 : Number(pageSize),
        search,
        status,
        sortBy,
        sortDirection,
      }),
    };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async create(
    @CurrentAuth() actor: AuthContext,
    @Body() body: unknown,
  ): Promise<{ machine: Awaited<ReturnType<MachinesService["createMachine"]>> }> {
    return { machine: await this.machinesService.createMachine(actor, body) };
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async update(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<{ machine: Awaited<ReturnType<MachinesService["updateMachine"]>> }> {
    return { machine: await this.machinesService.updateMachine(actor, id, body) };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async remove(@CurrentAuth() actor: AuthContext, @Param("id") id: string) {
    return { machine: await this.machinesService.deleteMachine(actor, id) };
  }

  @Post(":id/maintenance")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async maintenance(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<{ machine: Awaited<ReturnType<MachinesService["setStatus"]>> }> {
    return { machine: await this.machinesService.setStatus(actor, id, "MAINTENANCE") };
  }

  @Post(":id/reactivate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async reactivate(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<{ machine: Awaited<ReturnType<MachinesService["setStatus"]>> }> {
    return { machine: await this.machinesService.setStatus(actor, id, "ACTIVE") };
  }

  @Post(":id/deactivate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async deactivate(
    @CurrentAuth() actor: AuthContext,
    @Param("id") id: string,
  ): Promise<{ machine: Awaited<ReturnType<MachinesService["setStatus"]>> }> {
    return { machine: await this.machinesService.setStatus(actor, id, "INACTIVE") };
  }
}
