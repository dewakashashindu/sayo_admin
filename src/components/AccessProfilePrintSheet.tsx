// src/components/AccessProfilePrintSheet.tsx
// Prints one access profile (role or user customization) using the same
// unified frame as the master prints (Location Master etc.). Render it hidden
// in the page, setState the data, then window.print() — @media print shows
// only this sheet.
import React from "react";
import ReportPrintCore, { REPORT_PRINT_CSS, type RepColumn, type RepMetaItem } from "@/components/reportPrintCore";
import { poPrintClock } from "@/lib/poPrint";
import { ACCESS_TREE, type AccessNode } from "@/lib/accessCatalog";

export interface AccessProfilePrintSheetProps {
  title: string;            // "ROLE ACCESS PROFILE" | "USER ROLE CUSTOMIZATION"
  subject: string;          // "Role: Manager (GRP0000002)" | "User: Dilani (USR0000005) · Role: Manager"
  keys: { screenCode: string; actionCode: string }[];
  locations: string[];      // "COLOMBO MAIN BRANCH (LOC0000001)" labels
}

export const ACCESS_PROFILE_PRINT_CSS = `
  ${REPORT_PRINT_CSS}
  .access-print-root { display:none; }
  @media print {
    html, body { overflow:visible !important; height:auto !important; }
    body * { visibility:hidden !important; }
    .access-print-root, .access-print-root * { visibility:visible !important; }
    .access-print-root { display:block !important; position:absolute; inset:0 0 auto 0; }
  }
`;

export default function AccessProfilePrintSheet(p: AccessProfilePrintSheetProps) {
  const granted = new Set(p.keys.map((k) => `${k.screenCode}.${k.actionCode}`));
  const rows: string[][] = [];
  const walk = (nodes: AccessNode[], depth: number) => {
    for (const n of nodes) {
      const acts = n.actions.filter((a) => granted.has(`${n.code}.${a.code}`)).map((a) => a.label);
      const pad = "\u00A0\u00A0".repeat(depth);
      rows.push([String(rows.length + 1), `${pad}${n.children?.length ? n.name.toUpperCase() : n.name}`, acts.join(", ")]);
      if (n.children) walk(n.children, depth + 1);
    }
  };
  walk(ACCESS_TREE, 0);

  const clock = poPrintClock(new Date());
  const meta: RepMetaItem[] = [
    { key: "Print Date", value: clock.date },
    { key: "Print Time", value: clock.time },
    { key: "For", value: p.subject },
    { key: "Records", value: String(rows.length) },
    { key: "Locations Allowed", value: p.locations.length ? p.locations.join(" · ") : "—" },
  ];
  const columns: RepColumn[] = [
    { label: "#", width: "34px", align: "r" },
    { label: "Screen / Section", width: "42%" },
    { label: "Granted Actions" },
  ];
  return (
    <div className="access-print-root" aria-hidden="true">
      <ReportPrintCore title={p.title} companyName="SAYO BEAUTY" meta={meta} columns={columns} rows={rows} emptyText="No permissions granted" />
    </div>
  );
}
