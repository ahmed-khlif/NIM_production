import nextConfig from "../next.config";
import { describe, expect, it } from "vitest";

describe("Next.js development configuration", () => {
  it("allows the workshop LAN hostname for development assets", () => {
    expect(nextConfig.allowedDevOrigins).toContain("192.168.1.149");
  });
});
