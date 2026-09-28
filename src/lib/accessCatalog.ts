// src/lib/accessCatalog.ts
// The access-permission tree — mirrors the sidebar EXACTLY: every top-level
// title is a node (with its own ACCESS chip), and titles expand into their
// sub items, which can expand further (nested accordions on the profile screen).

export interface AccessAction { code: string; label: string }
export interface AccessNode {
  code: string;
  name: string;
  actions: AccessAction[];      // every clickable title/action node has at least ACCESS
  children?: AccessNode[];
}

const A = (code: string, label?: string): AccessAction => ({
  code,
  label: label ?? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " "),
});
const ACCESS = A("ACCESS");
const MASTER_ACTIONS = [ACCESS, A("CLEAR"), A("VIEW"), A("PRINT"), A("DELETE"), A("SAVE")];
const DOC_EMAIL = [ACCESS, A("CLEAR"), A("CONFIRM"), A("PRINT"), A("EMAIL"), A("DELETE"), A("SAVE")];
const DOC_PLAIN = [ACCESS, A("CLEAR"), A("CONFIRM"), A("PRINT"), A("DELETE"), A("SAVE")];

export const ACCESS_TREE: AccessNode[] = [
  { code: "DASH", name: "Dashboard", actions: [ACCESS] },

  {
    code: "APPTGRP", name: "Appointments", actions: [ACCESS],
    children: [
      { code: "APPT",     name: "Appointments Dashboard",  actions: [ACCESS, A("NEW_BOOKING", "New Booking"), A("CANCEL_BOOKING", "Cancel Booking"), A("CHECK_IN", "Check In"), A("RESCHEDULE", "Reschedule")] },
      { code: "APPTFORM", name: "Perform New Booking",     actions: [ACCESS] },
      { code: "TECHAPPT", name: "Technician Appointments", actions: [ACCESS, A("CHANGE_TECH", "Change Technician")] },
    ],
  },

  {
    code: "BILLGRP", name: "Billing", actions: [ACCESS],
    children: [
      { code: "BILLDASH", name: "Billing Dashboard",          actions: [ACCESS, A("CREATE_BILL", "Create Bill")] },
      { code: "BILLTXN",  name: "Billing Transactions",       actions: [ACCESS] },
      { code: "BILL",     name: "BILL",                      actions: [ACCESS] },
      { code: "BILLREP",  name: "Billing Reports",            actions: [ACCESS] },
      { code: "BILLFUNC", name: "Billing (POS Functions)",    actions: [ACCESS, A("REVERT_BILL", "Revert Bill"), A("PRINT")] },
    ],
  },

  {
    code: "INV", name: "Inventory", actions: [ACCESS],
    children: [
      {
        code: "INVREF", name: "Reference", actions: [ACCESS],
        children: [
          { code: "LOC",  name: "Location Master",  actions: MASTER_ACTIONS },
          { code: "CAT",  name: "Categories",       actions: MASTER_ACTIONS },
          { code: "ITEM", name: "Item Master",      actions: MASTER_ACTIONS },
          { code: "UNIT", name: "Unit Master",      actions: MASTER_ACTIONS },
          { code: "SUP",  name: "Supplier Master",  actions: MASTER_ACTIONS },
        ],
      },
      {
        code: "INVTXN", name: "Transactions", actions: [ACCESS],
        children: [
          { code: "PO",  name: "Purchase Orders", actions: [...DOC_EMAIL, A("CANCEL")] },
          { code: "GRN", name: "GRN / DGRN",      actions: DOC_EMAIL },
          { code: "SRN", name: "SRN",             actions: DOC_EMAIL },
          { code: "DMG", name: "Damage",          actions: DOC_PLAIN },
          {
            code: "TRN", name: "Transfer", actions: [ACCESS],
            children: [
              { code: "TREQ",  name: "Requisition Note", actions: DOC_PLAIN },
              { code: "TNOTE", name: "Transfer Note",    actions: DOC_PLAIN },
              { code: "TRET",  name: "Return Note",      actions: DOC_PLAIN },
            ],
          },
          {
            code: "ISS", name: "Issue", actions: [ACCESS],
            children: [
              { code: "IREQ",  name: "Requisition Note", actions: DOC_PLAIN },
              { code: "INOTE", name: "Issue Note",       actions: [...DOC_PLAIN, A("RECEIVE", "Confirm Receipt")] },
            ],
          },
          { code: "RECON", name: "Stock Recon.", actions: DOC_PLAIN },
        ],
      },
      { code: "INVREP", name: "Inventory Reports", actions: [ACCESS, A("PRINT")] },
    ],
  },

  {
    code: "CRM", name: "CRM", actions: [ACCESS],
    children: [
      { code: "CRMSTATS", name: "Customer Statistics", actions: [ACCESS, A("VIEW")] },
      { code: "CRMQRY",   name: "Enquiry & Report",    actions: [ACCESS, A("VIEW"), A("PRINT")] },
      { code: "CRMCUST",  name: "Customer Mgmt",       actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "CRMFB",    name: "Feedback Mgmt",       actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "CRMNOTES", name: "Notes & Allergies",   actions: [ACCESS, A("SAVE"), A("DELETE")] },
    ],
  },

  {
    code: "ADMINGRP", name: "Administration", actions: [ACCESS],
    children: [
      { code: "ADSCH", name: "Staff Schedules",   actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "ADHRS", name: "Operational Hours", actions: [ACCESS, A("SAVE")] },
      {
        code: "USERGEN", name: "User Creation", actions: [ACCESS],
        children: [
          { code: "UGROUPS", name: "User Groups", actions: [ACCESS, A("CLEAR"), A("VIEW"), A("DELETE"), A("SAVE")] },
          { code: "USERS",   name: "Users",       actions: [ACCESS, A("CLEAR"), A("VIEW"), A("DELETE"), A("SAVE")] },
        ],
      },
    ],
  },

  {
    code: "PROMO", name: "Promo Management", actions: [ACCESS],
    children: [
      { code: "PRCOUP",   name: "Coupons / Vouchers", actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "PRPACK",   name: "Promo Packages",     actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "PRREWRD",  name: "Reward Points",      actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "PRDISC",   name: "Discount Circles",   actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "PRGREET",  name: "Special Greetings",  actions: [ACCESS, A("SAVE"), A("DELETE")] },
    ],
  },

  {
    code: "ACC", name: "Accounting", actions: [ACCESS],
    children: [
      { code: "ACCSAL", name: "Staff Salary",   actions: [ACCESS, A("SAVE"), A("DELETE"), A("PRINT")] },
      { code: "ACCRAW", name: "Raw Items",      actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "ACCOTH", name: "Other Expenses", actions: [ACCESS, A("SAVE"), A("DELETE")] },
      { code: "ACCREV", name: "Revenue",        actions: [ACCESS, A("SAVE"), A("DELETE"), A("PRINT")] },
    ],
  },

  {
    code: "SYSSET", name: "System Settings", actions: [ACCESS],
    children: [
      { code: "SETUP",   name: "Start-up Settings", actions: [ACCESS, A("SAVE")] },
      { code: "ACCESSP", name: "Access Profiles",   actions: [ACCESS, A("SAVE")] },
    ],
  },

  { code: "REPORTS", name: "Reports (Overall)", actions: [ACCESS, A("VIEW"), A("PRINT")] },
];

/** Flat list of every tickable (screen, action) pair in the tree. */
export const ALL_ACCESS_KEYS: { screenCode: string; actionCode: string }[] = (function walk(nodes: AccessNode[], acc: { screenCode: string; actionCode: string }[]): { screenCode: string; actionCode: string }[] {
  for (const n of nodes) {
    for (const a of n.actions) acc.push({ screenCode: n.code, actionCode: a.code });
    if (n.children) walk(n.children, acc);
  }
  return acc;
})(ACCESS_TREE, []);

/** Flat list of every node with its parent code ('RT' = root/top-level). */
export const ALL_ACCESS_NODES: { code: string; parent: string; actions: string[] }[] = (function walk(
  nodes: AccessNode[], parent: string, acc: { code: string; parent: string; actions: string[] }[],
): { code: string; parent: string; actions: string[] }[] {
  for (const n of nodes) {
    acc.push({ code: n.code, parent, actions: n.actions.map((a) => a.code) });
    if (n.children?.length) walk(n.children, n.code, acc);
  }
  return acc;
})(ACCESS_TREE, "RT", []);

/** child code → parent code ('RT' for roots) — used to auto-tick ancestors. */
export const PARENT_OF: Record<string, string> = Object.fromEntries(ALL_ACCESS_NODES.map((n) => [n.code, n.parent]));

/** Codes of every node that has children — used to start the tree collapsed. */
export const ALL_GROUP_CODES: string[] = (function walk(nodes: AccessNode[], acc: string[]): string[] {
  for (const n of nodes) {
    if (n.children?.length) {
      acc.push(n.code);
      walk(n.children, acc);
    }
  }
  return acc;
})(ACCESS_TREE, []);

export function isKnownAccessKey(screenCode: string, actionCode: string): boolean {
  return ALL_ACCESS_KEYS.some((k) => k.screenCode === screenCode && k.actionCode === actionCode);
}
