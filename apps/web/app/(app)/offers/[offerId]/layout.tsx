import { OfferWorkspaceShell } from "@/features/offers/offer-workspace-shell";

export default async function OfferLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <OfferWorkspaceShell offerId={offerId}>{children}</OfferWorkspaceShell>;
}
