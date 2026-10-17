import { OfferBarAssignmentsView } from "@/features/offers/offer-bar-assignments-view";

export default async function OfferBarAssignmentsPage({ params }: { params: Promise<{ offerId: string }> }): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <OfferBarAssignmentsView offerId={offerId} />;
}
