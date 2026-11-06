import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { parseListSort } from "../src/list-sorting";

describe("parseListSort", () => {
  const allowed = ["reference", "profile"] as const;

  it("uses the endpoint default and direction when sorting is omitted", () => {
    expect(parseListSort(undefined, undefined, allowed, { sortBy: "profile", sortDirection: "asc" })).toEqual({
      sortBy: "profile",
      sortDirection: "asc",
    });
  });

  it("accepts a whitelisted database sort", () => {
    expect(parseListSort("reference", "desc", allowed, { sortBy: "profile", sortDirection: "asc" })).toEqual({
      sortBy: "reference",
      sortDirection: "desc",
    });
  });

  it("rejects unsupported fields and directions", () => {
    expect(() => parseListSort("secret", "asc", allowed, { sortBy: "profile", sortDirection: "asc" })).toThrow(BadRequestException);
    expect(() => parseListSort("reference", "sideways", allowed, { sortBy: "profile", sortDirection: "asc" })).toThrow(BadRequestException);
  });
});
