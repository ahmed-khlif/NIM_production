import type { ClientDirectoryStatus, ManagedClient } from "@/features/auth/auth-client";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildClientsPrintDocument(
  clients: ManagedClient[],
  filters: { search: string; status: ClientDirectoryStatus },
): string {
  const rows = clients
    .map(
      (client) => `<tr>
        <td><strong>${escapeHtml(client.name)}</strong></td>
        <td>${escapeHtml(client.taxId ?? "—")}</td>
        <td>${escapeHtml(client.phoneNumbers.join(" · ") || "—")}</td>
        <td>${escapeHtml(client.emails.join(" · ") || "—")}</td>
        <td class="number">${client.offerCount}</td>
        <td>${client.archivedAt ? "Archivé" : "Actif"}</td>
      </tr>`,
    )
    .join("");
  const statusLabel = {
    ACTIVE: "Clients actifs",
    ARCHIVED: "Clients archivés",
    ALL: "Tous les clients",
  }[filters.status];
  const filterSummary = filters.search
    ? `${statusLabel} · recherche : ${escapeHtml(filters.search)}`
    : statusLabel;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Répertoire des clients NIM</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #111827; font: 11px/1.45 Arial, sans-serif; margin: 0; }
    header { border-bottom: 2px solid #dc0000; margin-bottom: 16px; padding-bottom: 10px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    p { color: #475569; margin: 0; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d7dee8; padding: 7px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eef2f7; color: #172033; font-size: 10px; text-transform: uppercase; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .number { text-align: right; }
    footer { color: #64748b; font-size: 9px; margin-top: 10px; }
    @media screen { body { margin: 24px auto; max-width: 1200px; padding: 0 20px; } }
  </style>
</head>
<body>
  <header><h1>Répertoire des clients</h1><p>${escapeHtml(filterSummary)} · ${clients.length} client(s)</p></header>
  <table>
    <thead><tr><th>Client</th><th>Matricule fiscal</th><th>Téléphones</th><th>E-mails</th><th>Affaires liées</th><th>État</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">Aucun client à exporter.</td></tr>'}</tbody>
  </table>
  <footer>Document généré depuis NIM · ${new Intl.DateTimeFormat("fr-TN", { dateStyle: "long" }).format(new Date())}</footer>
</body>
</html>`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
