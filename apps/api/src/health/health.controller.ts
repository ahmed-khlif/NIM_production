import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Check API availability" })
  @ApiResponse({ status: 200, description: "API is available" })
  getHealth(): { status: "ok"; service: string; timestamp: string } {
    return { status: "ok", service: "nim-api", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  @ApiOperation({ summary: "Check API and database readiness" })
  @ApiResponse({ status: 200, description: "API and database are ready" })
  @ApiResponse({ status: 503, description: "A required dependency is unavailable" })
  async getReadiness(): Promise<{
    status: "ok";
    service: string;
    dependencies: { database: "ok" };
    timestamp: string;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        code: "DATABASE_UNAVAILABLE",
        message: "La base de données est indisponible.",
      });
    }

    return {
      status: "ok",
      service: "nim-api",
      dependencies: { database: "ok" },
      timestamp: new Date().toISOString(),
    };
  }
}
