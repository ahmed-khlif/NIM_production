import { Suspense } from "react";
import { QualityView } from "@/features/quality/quality-view";

export default function QualityPage(): React.ReactNode {
  return <Suspense fallback={<div role="status" className="p-6 text-sm text-slate-500">Chargement du contrôle qualité…</div>}><QualityView /></Suspense>;
}
