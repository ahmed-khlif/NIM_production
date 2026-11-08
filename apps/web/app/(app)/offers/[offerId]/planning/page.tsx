import { PlanningCalendarView } from "@/features/planning/planning-calendar-view";

export default async function OfferPlanningPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}): Promise<React.ReactNode> {
  const { offerId } = await params;
  return <PlanningCalendarView offerId={offerId} />;
}
