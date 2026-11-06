import { describe, expect, it } from "vitest";
import { eventLabel } from "../features/history/event-labels";

describe("history event labels", () => {
  it("localizes machine bar lifecycle events in French", () => {
    expect(eventLabel("BAR_UNASSIGNED_FROM_MACHINE")).toBe("Barre retirée de la machine");
    expect(eventLabel("BAR_PRODUCTION_STARTED")).toBe("Fabrication de la barre démarrée");
    expect(eventLabel("BAR_PRODUCTION_COMPLETED")).toBe("Fabrication de la barre terminée");
  });

  it("localizes client directory audit events", () => {
    expect(eventLabel("CLIENT_CREATED")).toBe("Client cr\u00e9\u00e9");
    expect(eventLabel("CLIENT_PHOTO_UPDATED")).toBe("Photo client modifi\u00e9e");
  });

  it("keeps an understandable fallback for unknown future events", () => {
    expect(eventLabel("FUTURE_EVENT_TYPE")).toBe("Future event type");
  });
});
