import { QueryClient } from "@tanstack/react-query";

export const queryFreshness = {
  defaultStaleTime: 15_000,
  defaultGcTime: 10 * 60_000,
  referenceData: 10 * 60_000,
  dashboard: 10_000,
  operations: 5_000,
  lists: 15_000,
  activity: 30_000,
  userDirectory: 60_000,
} as const;

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: queryFreshness.defaultStaleTime,
        gcTime: queryFreshness.defaultGcTime,
      },
    },
  });

  // Query key prefixes define freshness by domain: live queues stay hot while
  // catalogs and account/reference data survive normal route navigation.
  const policies: Array<[readonly unknown[], number]> = [
    [["auth"], 60_000],
    [["settings"], queryFreshness.referenceData],
    [["material-profiles"], queryFreshness.referenceData],
    [["piece-profiles"], queryFreshness.referenceData],
    [["offers"], queryFreshness.lists],
    [["offers", "form-recommendations"], queryFreshness.referenceData],
    [["offer"], queryFreshness.operations],
    [["pieces"], queryFreshness.lists],
    [["piece-facets"], queryFreshness.referenceData],
    [["piece"], queryFreshness.lists],
    [["machines"], queryFreshness.lists],
    [["machine"], queryFreshness.operations],
    [["users"], queryFreshness.userDirectory],
    [["history"], queryFreshness.activity],
    [["notifications"], queryFreshness.operations],
    [["dashboard"], queryFreshness.dashboard],
    [["production"], queryFreshness.operations],
    [["assignments"], queryFreshness.operations],
    [["quality"], queryFreshness.lists],
    [["tablet"], queryFreshness.operations],
  ];
  for (const [queryKey, staleTime] of policies) {
    client.setQueryDefaults(queryKey, { staleTime, gcTime: queryFreshness.defaultGcTime });
  }
  return client;
}
