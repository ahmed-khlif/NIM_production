import { FaconnagePreparationView } from "@/features/pieces/faconnage-preparation-view";

export default async function OfferFaconnagePage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <FaconnagePreparationView offerId={offerId} />;
}
