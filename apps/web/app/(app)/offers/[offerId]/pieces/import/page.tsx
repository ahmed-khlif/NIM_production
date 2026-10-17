import { PieceImportView } from "@/features/pieces/piece-import-view";

export default async function OfferPieceImportPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <PieceImportView offerId={offerId} />;
}
