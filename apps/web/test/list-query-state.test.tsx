import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("list URL state", () => {
  it("reads a deep-linked filter and writes bounded list state without dropping unrelated params", () => {
    window.history.replaceState(null, "", "/machines?tab=overview&search=CNC");
    expect(getInitialListParam("search")).toBe("CNC");
    const { result } = renderHook(() => useListQueryState());

    act(() => result.current.update({ search: "CNC-02", status: "MAINTENANCE", page: 3, pageSize: 50 }));

    expect(window.location.pathname).toBe("/machines");
    expect(window.location.search).toContain("tab=overview");
    expect(window.location.search).toContain("search=CNC-02");
    expect(result.current.params.get("status")).toBe("MAINTENANCE");
    expect(result.current.params.get("page")).toBe("3");
  });

  it("removes default filters from the URL", () => {
    window.history.replaceState(null, "", "/users?role=OPERATOR&status=active");
    const { result } = renderHook(() => useListQueryState());

    act(() => result.current.update({ role: null, status: "all", search: "", page: 1 }));

    expect(window.location.search).toBe("");
  });

  it("does not emit another sync when a list update leaves the URL unchanged", () => {
    window.history.replaceState(null, "", "/machines?search=CNC");
    const { result } = renderHook(() => useListQueryState());
    const onChange = vi.fn();
    window.addEventListener("nim:list-query-change", onChange);

    act(() => result.current.update({ search: "CNC" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.params.toString()).toBe("search=CNC");
    window.removeEventListener("nim:list-query-change", onChange);
  });
});
