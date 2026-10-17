import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { StableExceptionFilter } from "./infrastructure/http/stable-exception.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser("json", { limit: "8mb" });
  const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isMutatingMethod = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  const httpServer = app.getHttpAdapter().getInstance() as {
    disable: (setting: string) => void;
    set: (setting: string, value: unknown) => void;
  };

  httpServer.disable("x-powered-by");
  httpServer.set("trust proxy", process.env.TRUST_PROXY === "true");
  app.use(helmet());
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.use((request: { method: string; headers: Record<string, string | string[] | undefined> }, response: { status: (status: number) => { json: (body: unknown) => void } }, next: () => void) => {
    const origin = request.headers.origin;
    const normalizedOrigin = Array.isArray(origin) ? origin[0] : origin;
    if (isMutatingMethod.has(request.method) && normalizedOrigin && !corsOrigins.includes(normalizedOrigin)) {
      response.status(403).json({ code: "CSRF_ORIGIN_REJECTED", message: "Origine de requête non autorisée." });
      return;
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new StableExceptionFilter());

  if (process.env.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("NIM Production API")
      .setDescription("Foundation API for the NIM production traceability platform")
      .setVersion("0.1.0")
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(Number(process.env.PORT ?? 4000));
}

void bootstrap();
