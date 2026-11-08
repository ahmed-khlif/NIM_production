import type { RealtimeEvent } from "@nim/types";

const sharedActivityKeys = [["history"], ["notifications"]] as const;

const keysByEntity: Record<string, readonly (readonly unknown[])[]> = {
  OFFER: [["offer"], ["offers"], ["pieces"], ["piece-facets"], ["dashboard"]],
  PIECE: [["pieces"], ["piece-facets"], ["offer"], ["dashboard"], ["quality"]],
  MACHINE: [["machines"], ["machine"], ["assignments"], ["production"], ["offer"], ["dashboard"]],
  ASSIGNMENT: [["assignments"], ["machines"], ["machine"], ["pieces"], ["offer"], ["production"], ["dashboard"]],
  CUTTING_PLAN: [["offer"], ["pieces"], ["dashboard"]],
  CUTTING_BAR: [["offer"], ["machines"], ["machine"], ["assignments"], ["pieces"], ["production"], ["dashboard"]],
  PRODUCTION_OPERATION: [["production"], ["machines"], ["machine"], ["assignments"], ["pieces"], ["offer"], ["dashboard"], ["quality"]],
  PRODUCTION_RUN: [["production"], ["tablet"], ["machines"], ["machine"], ["assignments"], ["pieces"], ["offer"], ["dashboard"], ["quality"]],
  MACHINE_SESSION: [["tablet"], ["machines"], ["machine"], ["production"], ["offer"], ["users"], ["dashboard"]],
  QUALITY_CONTROL: [["quality"], ["pieces"], ["offer"], ["dashboard"]],
  QUALITY_DISPOSITION: [["quality"], ["pieces"], ["offer"], ["dashboard"]],
  NON_CONFORMITY: [["quality"], ["production"], ["offer"], ["dashboard"]],
  SCHEDULE_EVENT: [["planning"]],
};

export function getRealtimeInvalidationKeys(event: RealtimeEvent): readonly (readonly unknown[])[] {
  return [...(keysByEntity[event.entityType] ?? [["dashboard"]]), ...sharedActivityKeys];
}
