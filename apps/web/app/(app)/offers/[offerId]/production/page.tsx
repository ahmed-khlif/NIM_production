import { OfferProductionView } from "@/features/offers/offer-production-view";

export default async function OfferProductionPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <OfferProductionView offerId={offerId} />;
}
