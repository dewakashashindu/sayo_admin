
import { normalizeSmsPhone } from "./sms";

export interface GrnNotifyFacts {
  grnNo: string;
  locCode?: string;
  locationName?: string;
  supplierName?: string;
  poNo?: string;
  grnDate?: string;
  netTotal?: number | string;
  lineCount?: number;
  actorName?: string;
  companyName?: string;
}

/** 70950 → "70,950.00" — the same money the screens show. */
export function notifyMoney(value: number | string | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function grnNotifyMessage(facts: GrnNotifyFacts): string {
  const salon = (facts.companyName || "SAYO Beauty").trim().slice(0, 30);
  const grnNo = String(facts.grnNo || "").trim() || "a good received note";
  const lines: string[] = [
    `${salon}: GRN ${grnNo} is saved and waiting for Confirmation.`,
  ];

  const details = [
    String(facts.poNo || "").trim(),
    String(facts.supplierName || "").trim(),
    notifyMoney(facts.netTotal),
  ].filter(Boolean);
  if (details.length) lines.push(details.join(" · "));

  const where = [
    String(facts.locationName || facts.locCode || "").trim(),
    facts.lineCount ? `${Number(facts.lineCount)} item line(s)` : "",
    String(facts.actorName || "").trim() ? `by ${String(facts.actorName).trim()}` : "",
  ].filter(Boolean);
  if (where.length) lines.push(where.join(" · "));

  return lines.join("\n");
}

/** How many SMS parts this text needs (160 characters per part, near enough). */
export function smsPartCount(text: string): number {
  const length = String(text ?? "").length;
  return Math.max(1, Math.ceil(length / 160));
}

/** One row of tbl_userdetails, as far as this feature cares. */
export interface StaffRow {
  UserId?: string | null;
  UserName?: string | null;
  LogName?: string | null;
  ContNo?: string | null;
  GroupId?: string | null;
  Enable?: boolean | number | null;
}

/** A group name from tbl_usergroups. */
export interface GroupRow {
  GroupId?: string | null;
  GroupDes?: string | null;
}

export interface NotifyContact {
  userId: string;
  name: string;
  group: string;
  phone: string;
  /** shown first in the list — the people whose job is confirming */
  isAdmin: boolean;
}

const trim = (v: unknown) => String(v ?? "").trim();

/** "ADMIN", "Administrator", "ADMIN GROUP" … any of them counts. */
export function isAdminGroup(group: string): boolean {
  return /admin/i.test(trim(group));
}

/**
 * A number we are willing to text: a Sri Lankan mobile once normalised
 * (947XXXXXXXX). Land lines and half-typed numbers are left out — Text.lk
 * would reject them, and the popup should only offer people it can reach.
 */
export function isMobileForSms(phone: string): boolean {
  return /^947\d{8}$/.test(normalizeSmsPhone(phone));
}

export function notifyContacts(rows: StaffRow[], groups: GroupRow[] = []): NotifyContact[] {
  const groupName = new Map(
    groups.map((g) => [trim(g.GroupId).toUpperCase(), trim(g.GroupDes)]),
  );

  const contacts: NotifyContact[] = [];
  for (const row of rows) {
    /* Enable is 1/0 in the table, true/false by the time Prisma has it. Only an
       explicit "no" is skipped — a row that does not carry the flag is kept. */
    if (row.Enable === false || row.Enable === 0) continue;

    const rawPhone = trim(row.ContNo);
    if (!isMobileForSms(rawPhone)) continue;

    const group = groupName.get(trim(row.GroupId).toUpperCase()) ?? trim(row.GroupId);
    contacts.push({
      userId: trim(row.UserId),
      name: trim(row.UserName) || trim(row.LogName) || trim(row.UserId),
      group,
      phone: normalizeSmsPhone(rawPhone),
      isAdmin: isAdminGroup(group),
    });
  }

  contacts.sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });

  const seen = new Set<string>();
  return contacts.filter((c) => {
    if (seen.has(c.phone)) return false;
    seen.add(c.phone);
    return true;
  });
}

/** "0771 234 567" → "077 123 4567" — what to show in the popup. */
export function displayPhone(phone: string): string {
  const normalized = normalizeSmsPhone(phone);
  const local = normalized.replace(/^94/, "0");
  if (!/^0\d{9}$/.test(local)) return normalized || trim(phone);
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** The default sentence the popup starts with, editable before sending. */
export function defaultNotifyMessage(facts: GrnNotifyFacts): string {
  return grnNotifyMessage(facts);
}
