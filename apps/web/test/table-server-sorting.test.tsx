import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Table } from "@/components/ui/table";

describe("server-backed table sorting", () => {
  it("sends the next sort direction to the page query instead of sorting only visible rows", async () => {
    const user = userEvent.setup();
    const onServerSort = vi.fn();
    render(
      <Table serverSorting={{ column: "Référence", direction: "asc" }} onServerSort={onServerSort}>
        <thead><tr><th>Référence</th><th data-sortable="false">Action</th></tr></thead>
        <tbody><tr><td>Z-100</td><td>Open</td></tr><tr><td>A-1</td><td>Open</td></tr></tbody>
      </Table>,
    );

    await user.click(screen.getByRole("button", { name: "Trier par Référence" }));

    expect(onServerSort).toHaveBeenCalledWith("Référence", "desc");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Z-100");
  });
});
