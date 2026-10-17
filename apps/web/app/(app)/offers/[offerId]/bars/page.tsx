import { OfferBarsView } from "@/features/offers/offer-bars-view";

export default async function OfferBarsPage({ params }: { params: Promise<{ offerId: string }> }): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <OfferBarsView offerId={offerId} />;
}
