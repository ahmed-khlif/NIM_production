import { HistoryView } from "@/features/history/history-view";

export default async function OfferHistoryPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <HistoryView offerId={offerId} />;
}
