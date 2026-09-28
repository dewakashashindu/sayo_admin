// src/lib/accessProfilePrint.ts
// Client-side helper — opens a small print window with a SAYO-letterhead
// report of one access profile (group profile or a user's overrides).
'use client';

import { ACCESS_TREE, type AccessNode } from "@/lib/accessCatalog";

export interface AccessPrintInput {
  title: string;              // "Access Profile — Manager (GRP0000002)"
  subject: string;            // "Role: Manager (GRP0000002)" or "User: Dilani (USR0000005) · Role: Manager"
  keys: { screenCode: string; actionCode: string }[];
  locations: string[];        // allowed location labels, e.g. "COLOMBO MAIN BRANCH (LOC0000001)"
  printedBy?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const key = (s: string, a: string) => `${s}.${a}`;

export function printAccessProfile(inp: AccessPrintInput): void {
  const granted = new Set(inp.keys.map((k) => key(k.screenCode, k.actionCode)));
  const rows: string[] = [];

  const walk = (nodes: AccessNode[], depth: number) => {
    for (const n of nodes) {
      const grantedActions = n.actions
        .filter((a) => granted.has(key(n.code, a.code)))
        .map((a) => esc(a.label));
      const isGroup = !!n.children?.length;
      rows.push(
        `<tr class="${isGroup ? "grp" : "leaf"}">` +
          `<td style="padding-left:${6 + depth * 16}px">${isGroup ? "<b>" : ""}${esc(n.name)}${isGroup ? "</b>" : ""}</td>` +
          `<td class="code">${esc(n.code)}</td>` +
          `<td>${grantedActions.length ? grantedActions.join(", ") : "<span class='none'>—</span>"}</td>` +
        `</tr>`,
      );
      if (n.children) walk(n.children, depth + 1);
    }
  };
  walk(ACCESS_TREE, 0);

  const locHtml = inp.locations.length
    ? inp.locations.map((l) => `<span class="chip">${esc(l)}</span>`).join(" ")
    : "<span class='none'>no locations assigned</span>";

  // hidden iframe print — window.open() popups get blocked by browsers
  const frame = document.createElement("iframe");
  frame.setAttribute("style", "position:fixed;right:0;bottom:0;width:0;height:0;border:0");
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  if (!w || !w.document) { frame.remove(); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inp.title)}</title>
<style>
  @page { margin: 12mm 10mm 14mm; }
  * { font-family: 'Segoe UI', Arial, sans-serif; }
  body { margin: 0; color: #122; font-size: 11.5px; }
  .brand { display:flex; align-items:center; gap:10px; border-bottom:2px solid #1e3a40; padding-bottom:8px; }
  .brand img { height:40px; }
  .brand .t1 { font-size:16px; font-weight:800; letter-spacing:.12em; color:#1e3a40; }
  .brand .t2 { font-size:10px; letter-spacing:.2em; color:#5b6d72; margin-top:2px; }
  h1 { font-size:14px; margin:14px 0 2px; color:#1e3a40; }
  .sub { font-size:11px; color:#3c5a60; margin-bottom:10px; }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#3c5a60; margin:14px 0 6px; }
  .chip { display:inline-block; border:1px solid #1e3a40; border-radius:999px; padding:2px 10px; margin:0 4px 4px 0; font-size:10.5px; font-weight:600; }
  table { border-collapse:collapse; width:100%; }
  th,td { border:1px solid #cfd8da; padding:4px 8px; text-align:left; vertical-align:top; }
  th { background:#1e3a40; color:#fff; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; }
  tr.grp td { background:#eef2f3; }
  td.code { font-family:Consolas,monospace; font-size:10px; width:90px; color:#37505a; }
  .none { color:#a7b4b8; }
  .sig { margin-top:22px; font-size:10.5px; color:#5b6d72; }
  @media print { .brand img { -webkit-print-color-adjust:exact; } }
</style></head><body>
  <div class="brand">
    <img src="/sayologo.png" alt="SAYO">
    <div><div class="t1">SAYO BEAUTY</div><div class="t2">ADMIN PORTAL</div></div>
  </div>
  <h1>${esc(inp.title)}</h1>
  <div class="sub">${esc(inp.subject)} &nbsp;·&nbsp; printed ${new Date().toLocaleString()}${inp.printedBy ? " by " + esc(inp.printedBy) : ""}</div>
  <h2>Location Access</h2>
  <div>${locHtml}</div>
  <h2>Screen &amp; Function Permissions</h2>
  <table>
    <thead><tr><th>Screen / Section</th><th>Code</th><th>Granted Actions</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>
  <div class="sig">— end of report —</div>
</body></html>`);
  w.document.close();
  const go = () => { w.focus(); w.print(); };
  if (w.document.readyState === "complete") setTimeout(go, 150);
  else w.addEventListener("load", () => setTimeout(go, 150));
  setTimeout(() => frame.remove(), 60000);
}
