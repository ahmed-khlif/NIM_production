import { Suspense } from "react";
import { QualityView } from "@/features/quality/quality-view";

export default async function OfferQualityPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <Suspense fallback={<div role="status" className="p-6 text-sm text-slate-500">Chargement du contrôle qualité…</div>}><QualityView offerId={offerId} /></Suspense>;
}
