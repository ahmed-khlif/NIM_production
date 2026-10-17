import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("NIM API integration", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("serves health and protects authenticated domains", async () => {
    await request(app.getHttpServer()).get("/health").expect(200).expect(({ body }) => {
      expect(body).toMatchObject({ status: "ok", service: "nim-api" });
    });
    await request(app.getHttpServer()).get("/dashboard/overview").expect(401);
    await request(app.getHttpServer()).get("/settings").expect(401);
    await request(app.getHttpServer()).get("/notifications").expect(401);
  });

  it("serves a database-backed readiness probe", async () => {
    await request(app.getHttpServer()).get("/health/ready").expect(200).expect(({ body }) => {
      expect(body).toMatchObject({
        status: "ok",
        service: "nim-api",
        dependencies: { database: "ok" },
      });
    });
  });

  it("rejects unauthenticated import mutations before parsing input", async () => {
    await request(app.getHttpServer()).post("/pieces/import/preview").send({}).expect(401);
    await request(app.getHttpServer()).post("/pieces/import").send({}).expect(401);
  });
});
