import { PiecesView } from "@/features/pieces/pieces-view";

export default async function OfferPiecesPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <PiecesView offerId={offerId} />;
}
