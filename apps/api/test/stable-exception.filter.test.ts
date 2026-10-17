import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { StableExceptionFilter } from "../src/infrastructure/http/stable-exception.filter";

describe("StableExceptionFilter", () => {
  it("normalizes framework errors without leaking Nest internals", () => {
    const json = vi.fn();
    const response = { status: vi.fn(() => ({ json })) };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };

    new StableExceptionFilter().catch(new BadRequestException({ message: "Invalid JSON", error: "Bad Request" }), host as never);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ code: "BAD_REQUEST", message: "Invalid JSON" });
  });
});
