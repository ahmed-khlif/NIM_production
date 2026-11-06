import { GlobalSearchView } from "@/features/search/global-search-view";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<React.ReactNode> {
  const { q = "" } = await searchParams;
  return <GlobalSearchView initialQuery={q} />;
}
