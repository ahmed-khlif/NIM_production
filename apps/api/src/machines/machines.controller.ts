import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
  ) {
    if (page === undefined && pageSize === undefined && search === undefined && status === undefined) {
      return { machines: await this.machinesService.listMachines() };
    }
    return this.machinesService.listMachinesPage({
      page: page === undefined ? 1 : Number(page),
      pageSize: pageSize === undefined ? 20 : Number(pageSize),
      search,
      status,
    });
  }

  @Get(":id/queue")
  async queue(
    @Param("id") id: string,
  ): Promise<{
    machine: MachineDetail;
    queue: MachineDetail["queue"];
    activeOperationCount: number;
  }> {
    const detail = await this.machinesService.getMachine(id);
    return {
      machine: detail,
      queue: detail.queue,
      activeOperationCount: detail.activeOperationCount,
    };
  }

  @Get(":id")
  async detail(
    @Param("id") id: string,
  ): Promise<{ machine: Awaited<ReturnType<MachinesService["getMachine"]>> }> {
    return { machine: await this.machinesService.getMachine(id) };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async create(@CurrentAuth() actor: AuthContext, @Body() body: unknown): Promise<{ machine: Awaited<ReturnType<MachinesService["createMachine"]>> }> {
    return { machine: await this.machinesService.createMachine(actor, body) };
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async update(@CurrentAuth() actor: AuthContext, @Param("id") id: string, @Body() body: unknown): Promise<{ machine: Awaited<ReturnType<MachinesService["updateMachine"]>> }> {
    return { machine: await this.machinesService.updateMachine(actor, id, body) };
  }

  @Post(":id/maintenance")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async maintenance(@CurrentAuth() actor: AuthContext, @Param("id") id: string): Promise<{ machine: Awaited<ReturnType<MachinesService["setStatus"]>> }> {
    return { machine: await this.machinesService.setStatus(actor, id, "MAINTENANCE") };
  }

  @Post(":id/reactivate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async reactivate(@CurrentAuth() actor: AuthContext, @Param("id") id: string): Promise<{ machine: Awaited<ReturnType<MachinesService["setStatus"]>> }> {
    return { machine: await this.machinesService.setStatus(actor, id, "ACTIVE") };
  }

  @Post(":id/deactivate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "PRODUCTION_MANAGER")
  async deactivate(@CurrentAuth() actor: AuthContext, @Param("id") id: string): Promise<{ machine: Awaited<ReturnType<MachinesService["setStatus"]>> }> {
    return { machine: await this.machinesService.setStatus(actor, id, "INACTIVE") };
  }
}
