import { OfferOverviewView } from "@/features/offers/offer-overview-view";

export default async function OfferOverviewPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <OfferOverviewView offerId={offerId} />;
}
