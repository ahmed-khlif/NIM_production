import { describe, expect, it } from "vitest";
import { buildClientsPrintDocument } from "@/features/clients/client-exports";

describe("client directory exports", () => {
  it("builds a printable directory and escapes client-controlled text", () => {
    const html = buildClientsPrintDocument(
      [
        {
          id: "client-1",
          name: "NIM <Société>",
          taxId: '"<script>alert(1)</script>',
          phoneNumbers: ["+216 70 000 000"],
          emails: ["contact@example.tn"],
          imageUrl: null,
          archivedAt: null,
          createdAt: "2026-11-01T09:00:00.000Z",
          updatedAt: "2026-11-01T09:00:00.000Z",
          offerCount: 3,
        },
      ],
      { search: "NIM", status: "ALL" },
    );

    expect(html).toContain("Tous les clients · recherche : NIM");
    expect(html).toContain("NIM &lt;Société&gt;");
    expect(html).toContain("&quot;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("+216 70 000 000");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
