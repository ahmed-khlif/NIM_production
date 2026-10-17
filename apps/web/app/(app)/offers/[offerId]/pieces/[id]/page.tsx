import { PieceDetailView } from "@/features/pieces/piece-detail-view";

export default async function OfferPieceDetailPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <PieceDetailView offerId={offerId} />;
}
