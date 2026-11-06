import { describe, expect, it } from "vitest";
import { createAppQueryClient, queryFreshness } from "../lib/query-client";

describe("application query policy", () => {
  it("sets freshness by data type while retaining cached route data", () => {
    const client = createAppQueryClient();
    const options = client.getDefaultOptions().queries;

    expect(options?.staleTime).toBe(queryFreshness.defaultStaleTime);
    expect(options?.gcTime).toBe(queryFreshness.defaultGcTime);
    expect(client.getQueryDefaults(["dashboard", "overview"])?.staleTime).toBe(queryFreshness.dashboard);
    expect(client.getQueryDefaults(["production", "monitor"])?.staleTime).toBe(queryFreshness.operations);
    expect(client.getQueryDefaults(["piece-facets", "offer-1"])?.staleTime).toBe(queryFreshness.referenceData);
    expect(client.getQueryDefaults(["users", 1])?.staleTime).toBe(queryFreshness.userDirectory);
    expect(options?.refetchOnWindowFocus).toBeUndefined();
    client.clear();
  });
});
