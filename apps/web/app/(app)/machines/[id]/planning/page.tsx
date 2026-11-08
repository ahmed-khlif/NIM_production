import { PlanningCalendarView } from "@/features/planning/planning-calendar-view";

export default async function MachinePlanningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactNode> {
  const { id } = await params;
  return <PlanningCalendarView machineId={id} />;
}
