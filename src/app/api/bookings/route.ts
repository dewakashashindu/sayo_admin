// src/app/api/bookings/route.ts
// src/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity, maskPhoneForLog } from '@/lib/activityLog';
import { timeLabelFromValue } from '@/lib/legacyTime';
import {
  clockToMinutes,
  composeBookingRemarks,
  decodeBookingSchedule,
  minutesToClock,
  stripBookingSchedule,
  type BookingScheduleEntry,
  type StoredBookingScheduleEntry,
} from '@/lib/bookingSchedule';
import {
  HEADER_TABLE,
  TXN_DETAIL_TABLE,
  BOOKING_SERVICE_DETAIL_FROM,
  dedupeBookingDetailRows,
} from '@/lib/bookingReadModel';
import { nextSerialTx, SERIAL_CODES } from '@/lib/serials';
import {
  ITEM_CODE_LENGTH,
  createItemCodeIndex,
  itemCode,
  itemCodeJoinSql,
} from '@/lib/itemCode';
import { rateLimit, rateMessage } from "@/lib/rateLimit";
import { clientIp, ipForLog } from "@/lib/clientIp";

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
─────────────────────────────────────────────────────────────────────────────── */
interface BookingService {
  name:          string;
  price:         string;
  duration:      string;
  /** Optional: some clients send the number of services in one line. */
  qty?:          number | string;
  /** Optional legacy identifiers for clients that already use the master catalog. */
  itemCode?:     string;
  serviceItemID?: string;
}

interface BookingProvider {
  name: string;
  role: string;
}

interface BookingRequestBody {
  name:          string;
  email:         string;
  phone:         string;
  gender?:       string;
  location:      string;
  mode:          string;
  date:          string;
  timeSlot:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  categories?:   string | string[];
  totalDuration:   number;
  totalPrice:      number;
  notes?:          string;
  /** Optional execution order/times selected by the public conflict modal. */
  serviceSchedule?: BookingScheduleEntry[];
}

/* ─────────────────────────────────────────────────────────────────────────────
   SMS — TEXT.LK
─────────────────────────────────────────────────────────────────────────────── */
const TEXTLK_ENDPOINT = 'https://app.text.lk/api/v3/sms/send';

function maskEmail(email: string): string {
  const [localPart, domain] = String(email || '').split('@');
  if (!domain || !localPart) return email;
  const len = localPart.length;
  if (len <= 2) return `${localPart[0]}*@${domain}`;
  if (len <= 4) {
    return `${localPart[0]}${'*'.repeat(len - 2)}${localPart[len - 1]}@${domain}`;
  }
  const visibleFront = Math.min(6, Math.floor(len / 3));
  const visibleBack  = 3;
  if (len <= visibleFront + visibleBack) {
    return `${localPart.slice(0, 2)}${'*'.repeat(Math.max(0, len - 4))}${localPart.slice(-2)}@${domain}`;
  }
  return `${localPart.slice(0, visibleFront)}${'*'.repeat(len - (visibleFront + visibleBack))}${localPart.slice(-visibleBack)}@${domain}`;
}

function maskPhone(phone: string): string {
  const cleaned = phone.trim().replace(/\s+/g, '').replace(/^\+/, '');
  if (cleaned.length < 7) return cleaned;
  return `${cleaned.slice(0, 3)}${'*'.repeat(cleaned.length - 6)}${cleaned.slice(-3)}`;
}

function normalizeSmsPhone(phone: string): string {
  const digits    = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const without00 = digits.startsWith('00') ? digits.slice(2) : digits;
  if (/^0?7\d{8}$/.test(without00)) return `94${without00.replace(/^0/, '')}`;
  if (/^947\d{8}$/.test(without00))  return without00;
  return without00;
}

function smsText(value: string | undefined, fallback: string): string {
  const cleaned = String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function formatSmsDate(dateValue: string): string {
  const match = String(dateValue || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return smsText(dateValue, 'the selected date');
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return match[1];
  return new Intl.DateTimeFormat('en-GB', {
    day:      '2-digit',
    month:    'short',
    year:     'numeric',
    timeZone: 'UTC',
  }).format(date);
}

type AppointmentSMSEvent = 'booked' | 'confirmed' | 'cancelled' | 'rescheduled';

interface AppointmentSMSProps {
  event:             AppointmentSMSEvent;
  phone:             string;
  name:              string;
  bookingId:         string;
  branch?:           string;
  date:              string;
  timeSlot:          string;
  previousDate?:     string;
  previousTimeSlot?: string;
}

interface RegistrationSMSProps {
  name:  string;
  email: string;
  phone: string;
}

interface TextLkResult {
  success: boolean;
  data?:   unknown;
  error?:  string;
}

function buildAppointmentSMS({
  event,
  name,
  bookingId,
  branch,
  date,
  timeSlot,
  previousDate,
  previousTimeSlot,
}: AppointmentSMSProps): string {
  const customerName = smsText(name,      'Customer');
  const reference    = smsText(bookingId, 'your booking');
  const branchLine   = branch ? `\nBranch: ${smsText(branch, 'SAYO Beauty')}` : '';

  if (event === 'rescheduled') {
    const previousSchedule = `${formatSmsDate(previousDate || date)}, ${smsText(previousTimeSlot, 'the previous time')}`;
    const newSchedule      = `${formatSmsDate(date)}, ${smsText(timeSlot, 'the new time')}`;
    return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} has been rescheduled.\nPrevious: ${previousSchedule}\nNew: ${newSchedule}${branchLine}`;
  }

  const schedule = `Date: ${formatSmsDate(date)}\nTime: ${smsText(timeSlot, 'the selected time')}`;

  if (event === 'confirmed') {
    return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} is confirmed.\n${schedule}${branchLine}`;
  }
  if (event === 'cancelled') {
    return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} has been cancelled.\n${schedule}${branchLine}`;
  }
  return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} has been booked successfully.\n${schedule}${branchLine}`;
}

async function sendTextLkSMS(recipient: string, message: string): Promise<TextLkResult> {
  const apiToken = process.env.TEXTLK_API_TOKEN;
  const senderId = process.env.TEXTLK_SENDER_ID;

  if (!apiToken || !senderId) {
    console.error('[SMS] TEXTLK_API_TOKEN or TEXTLK_SENDER_ID missing in .env.local');
    return { success: false, error: 'SMS configuration missing' };
  }

  try {
    const response = await fetch(TEXTLK_ENDPOINT, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({ recipient, sender_id: senderId, message }),
    });

    const responseText = await response.text();
    let data: Record<string, unknown> = {};
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { data = { message: responseText }; }

    if (!response.ok) {
      console.error('[Text.lk SMS Error]', data);
      return { success: false, error: (data?.message as string) || 'Failed to send SMS' };
    }
    return { success: true, data };
  } catch (error) {
    console.error('[Text.lk SMS Fetch Error]', error);
    return { success: false, error: 'Internal server error while sending SMS' };
  }
}

async function sendAppointmentSMS(props: AppointmentSMSProps): Promise<TextLkResult> {
  const recipient = normalizeSmsPhone(props.phone);
  if (!recipient) return { success: false, error: 'Customer phone number is empty' };

  const message = buildAppointmentSMS(props);
  const result  = await sendTextLkSMS(recipient, message);

  if (result.success) {
    console.log(`[SMS_SENT] event=${props.event} booking=${smsText(props.bookingId, 'unknown')}`);
  }
  return result;
}

async function sendRegistrationSMS({ name, email, phone }: RegistrationSMSProps): Promise<TextLkResult> {
  const formattedPhone  = normalizeSmsPhone(phone);
  const maskedEmail     = maskEmail(email);
  const maskedPhoneNum  = maskPhone(formattedPhone);
  const smsMessage      = `Welcome to Sayo, ${name}!\nYour account has been successfully created.\nRegistered Email: ${maskedEmail}\nPhone: ${maskedPhoneNum}`;
  return sendTextLkSMS(formattedPhone, smsMessage);
}

/* ─────────────────────────────────────────────────────────────────────────────
   NODEMAILER TRANSPORTER
─────────────────────────────────────────────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls:            { rejectUnauthorized: false },
  pool:           true,
  maxConnections: 5,
  rateDelta:      1000,
  rateLimit:      5,
});

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
─────────────────────────────────────────────────────────────────────────────── */
function formatDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtMins(m: number): string {
  if (m <= 0) return '—';
  return m >= 60
    ? `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}min` : ''}`
    : `${m} min`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

/* ─────────────────────────────────────────────────────────────────────────────
   CUSTOMER CODE GENERATOR
─────────────────────────────────────────────────────────────────────────────── */
/**
 * Customer code — CUS0000001, CUS0000002, …
 * The number is taken from the CUS series in Tbl_Serials (src/lib/serials.ts)
 * instead of scanning tbl_CustomerMaster for the highest existing code.
 */
async function generateCusCode(
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  return nextSerialTx(db, SERIAL_CODES.customer);
}

/* ─────────────────────────────────────────────────────────────────────────────
   LEGACY BOOKING BRIDGE
   -----------------------------------------------------------------------------
   The public page sends display values ("Colombo", service names and provider
   names), while the appointment tables use branch/item/user codes. Resolve
   those values here and write the header and details together. An unmatched
   service/provider is rejected with a configuration error; display names are
   never truncated into a legacy code.
─────────────────────────────────────────────────────────────────────────────── */
interface LegacyItem {
  ItemCode: string;
  ItemDes: string;
  ItemPrintDes: string | null;
  SerDuration: number | string | null;
  Retailprice: number | string | null;
}

interface PreparedService {
  serviceItemID: string;
  itemPrice: number;
  durationMin: number;
}

interface PreparedProvider extends BookingProvider {
  techID: string;
}

interface LegacyCapacityRow {
  BookingID: string;
  GuessID?: string;
  StartMin: number;
  TechID: string;
  ServiceItemID: string;
  Remarks: string | null;
  ScheduleStartMin: number | string | null;
  ScheduleEndMin: number | string | null;
  DurationMin: number;
  Qty: string | number | null;
}

interface ProviderWindow {
  techID: string;
  startMin: number;
  endMin: number;
}

interface PreparedServiceScheduleEntry extends StoredBookingScheduleEntry {
  techID: string;
}

class BookingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingConfigurationError';
  }
}

class ProviderCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderCapacityError';
  }
}

function toChar(value: unknown, length: number): string {
  return String(value ?? '').substring(0, length).padEnd(length, ' ');
}

function normalizeLookup(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parsePrice(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value: unknown): number {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function parseDuration(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function slotToMinutes(timeValue: string): number {
  const match = String(timeValue || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return -1;
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

function hasOverlap(first: ProviderWindow, second: ProviderWindow): boolean {
  return first.techID === second.techID &&
    first.startMin < second.endMin &&
    second.startMin < first.endMin;
}

function nextPublicGridStart(minutes: number): number {
  return Math.ceil(minutes / 30) * 30;
}

function buildDefaultServiceSchedule(
  services: Array<PreparedService & { techID: string }>,
  startMin: number,
): PreparedServiceScheduleEntry[] {
  let cursor = startMin;

  return services.map((service, serviceIndex) => {
    const durationMin = parseDuration(service.durationMin);
    const start = cursor;
    const end = start + durationMin;
    const nextTechID = services[serviceIndex + 1]?.techID?.trim() || '';

    // A single technician moves directly into the next service. When the
    // technician changes, the next service must begin on a public 30-minute
    // slot; a 09:15 boundary is not a selectable slot.
    cursor = serviceIndex < services.length - 1 && service.techID.trim() !== nextTechID
      ? nextPublicGridStart(end)
      : end;

    return {
      serviceIndex,
      itemCode: service.serviceItemID.trim(),
      techID: service.techID.trim(),
      startMin: start,
      endMin: end,
    };
  });
}

function normalizeServiceSchedule(
  rawSchedule: unknown,
  services: Array<PreparedService & { techID: string }>,
  startMin: number,
): PreparedServiceScheduleEntry[] {
  const fallback = () => buildDefaultServiceSchedule(services, startMin);
  if (!Array.isArray(rawSchedule) || rawSchedule.length !== services.length) {
    return fallback();
  }

  const byIndex = new Map<number, BookingScheduleEntry>();
  for (const rawEntry of rawSchedule) {
    if (!rawEntry || typeof rawEntry !== 'object') return fallback();
    const entry = rawEntry as Partial<BookingScheduleEntry>;
    const serviceIndex = Number(entry.serviceIndex);
    const entryStart = clockToMinutes(entry.startTime);
    const entryEnd = clockToMinutes(entry.endTime);
    if (
      !Number.isInteger(serviceIndex) ||
      serviceIndex < 0 ||
      serviceIndex >= services.length ||
      byIndex.has(serviceIndex) ||
      entryStart < startMin ||
      entryEnd <= entryStart
    ) return fallback();

    const expectedDuration = parseDuration(services[serviceIndex].durationMin);
    if (entryEnd - entryStart !== expectedDuration) return fallback();
    byIndex.set(serviceIndex, entry as BookingScheduleEntry);
  }

  if (byIndex.size !== services.length) return fallback();

  /* Map insertion order is the execution order sent by the evaluator. Keep
     it intact for persistence; callers that need an index lookup use
     serviceIndex explicitly. */
  return [...byIndex.entries()].map(([serviceIndex, entry]) => {
    const service = services[serviceIndex];
    return {
      serviceIndex,
      itemCode: service.serviceItemID.trim(),
      techID: service.techID.trim(),
      startMin: clockToMinutes(entry.startTime),
      endMin: clockToMinutes(entry.endTime),
    };
  });
}

function publicProviderWindows(
  services: Array<PreparedService & { techID: string }>,
  startMin: number,
  schedule?: PreparedServiceScheduleEntry[],
): ProviderWindow[] {
  const effectiveSchedule = schedule ?? buildDefaultServiceSchedule(services, startMin);
  return services.flatMap((service, serviceIndex) => {
    const techID = service.techID.trim();
    if (!techID || techID === '0') return [];

    const scheduled = effectiveSchedule.find((entry) => entry.serviceIndex === serviceIndex);
    const duration = Math.max(30, service.durationMin || 30);
    return [{
      techID,
      startMin: scheduled?.startMin ?? startMin,
      endMin: (scheduled?.startMin ?? startMin) + duration,
    }];
  });
}

async function assertNoProviderCapacityConflict(
  tx: Prisma.TransactionClient,
  locCode: string,
  date: string,
  incoming: ProviderWindow[],
  providerNames: Map<string, string>,
): Promise<void> {
  if (incoming.length === 0) return;

  const rawRows = await tx.$queryRaw<LegacyCapacityRow[]>`
    SELECT
      RTRIM(h.BookingID) AS BookingID,
      RTRIM(d.GuessID) AS GuessID,
      (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
      RTRIM(d.TechID) AS TechID,
      RTRIM(d.ServiceItemID) AS ServiceItemID,
      h.Remarks AS Remarks,
      d.ScheduleStartMin AS ScheduleStartMin,
      d.ScheduleEndMin AS ScheduleEndMin,
      COALESCE(NULLIF(i.SerDuration, 0), 30) AS DurationMin,
      d.Qty AS Qty
    FROM tbl_bookingheder h
    JOIN tbl_bookingservicedetail d
      ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
    LEFT JOIN tbl_itemmaster i
      ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
     AND ${Prisma.raw(itemCodeJoinSql('i.ItemCode', 'd.ServiceItemID'))}
    WHERE RTRIM(h.LocCode) = ${locCode.trim()}
      AND DATE(h.BookingDate) = ${date}
      AND UPPER(RTRIM(h.Status)) NOT IN ('CANCELLED', 'CANCEL')
    FOR UPDATE
  `;

  // A legacy 10-character detail code whose prefix is shared by two items comes
  // back once per item. Keep one row per detail key so a duplicated row can
  // never create a second busy window and a false "technician is busy".
  const rows = dedupeBookingDetailRows(rawRows);

  const existingByBookingAndProvider = new Map<string, ProviderWindow>();
  const scheduledExistingWindows: ProviderWindow[] = [];
  for (const row of rows) {
    const techID = String(row.TechID || '').trim();
    if (!techID || techID === '0') continue;

    const bookingID = String(row.BookingID || '').trim();
    const quantity = Number(row.Qty) > 0 ? Number(row.Qty) : 1;
    const duration = Math.max(30, Number(row.DurationMin) || 30) * quantity;
    const columnStart = Number(row.ScheduleStartMin);
    const columnEnd = Number(row.ScheduleEndMin);
    const storedSchedule = decodeBookingSchedule(row.Remarks);
    const legacyScheduled = storedSchedule.find((entry) =>
      entry.itemCode &&
      normalizeLookup(entry.itemCode) === normalizeLookup(row.ServiceItemID),
    );
    const scheduledStart =
      Number.isFinite(columnStart) && Number.isFinite(columnEnd) && columnEnd > columnStart
        ? columnStart
        : legacyScheduled?.startMin;

    if (scheduledStart !== undefined && Number.isFinite(scheduledStart)) {
      // New rows carry the actual service placement in service-detail columns.
      // Older rows are still read from the legacy Remarks metadata. Keep each
      // service as its own interval so a later service is not moved back to
      // the booking's overall start time.
      scheduledExistingWindows.push({
        techID,
        startMin: scheduledStart,
        endMin: scheduledStart + duration,
      });
      continue;
    }

    // Legacy rows without schedule metadata retain the original continuous
    // per-booking/per-provider capacity behaviour.
    const key = `${bookingID}|${techID}`;
    const current = existingByBookingAndProvider.get(key);
    const startMin = Number(row.StartMin) || 0;
    if (current) {
      current.endMin += duration;
    } else {
      existingByBookingAndProvider.set(key, {
        techID,
        startMin,
        endMin: startMin + duration,
      });
    }
  }

  const existingWindows = [
    ...existingByBookingAndProvider.values(),
    ...scheduledExistingWindows,
  ];

  for (const incomingWindow of incoming) {
    const conflict = existingWindows
      .find((existingWindow) => hasOverlap(incomingWindow, existingWindow));
    if (!conflict) continue;

    const providerName = providerNames.get(incomingWindow.techID) || 'selected provider';
    throw new ProviderCapacityError(
      `${providerName} is already booked during the selected time. Please choose another provider or time.`,
    );
  }
}

function toBookingDateTime(dateValue: string, timeValue: string): string | null {
  const dateMatch = String(dateValue || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const period = timeMatch[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;

  return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

async function resolveLegacyBranch(location: string) {
  const rows = await prisma.tbl_LocationMaster.findMany({
    where: { Enable: true },
    select: { LocCode: true, LocDes: true },
  });
  const wanted = normalizeLookup(location);
  return rows.find((row) => {
    const code = normalizeLookup(row.LocCode);
    const description = normalizeLookup(row.LocDes);
    return code === wanted || description === wanted ||
      description.includes(wanted) || wanted.includes(description);
  }) ?? null;
}

async function resolveLegacyServices(
  services: BookingService[],
  locCode: string,
): Promise<PreparedService[]> {
  const items = await prisma.tbl_ItemMaster.findMany({
    where: { LocCode: locCode, ServiceItem: true, Enable: true },
    select: {
      ItemCode: true,
      ItemDes: true,
      ItemPrintDes: true,
      SerDuration: true,
      Retailprice: true,
    },
  }) as LegacyItem[];

  const usedCodes = new Set<string>();

  // Item codes are CHAR(15) and are the real identity of a service. Older
  // clients (and rows written before scripts/migrate-itemcode-char15.sql) can
  // still hold the 10-character prefix, so one index answers for both — and it
  // refuses a prefix that belongs to more than one item instead of picking an
  // arbitrary (wrong) service.
  const itemByCode = createItemCodeIndex(items, (item) => item.ItemCode);

  return services.map((service) => {
    const requestedCode = String(service.itemCode || service.serviceItemID || '').trim();
    const wantedName = normalizeLookup(service.name);

    let item = requestedCode ? itemByCode.get(requestedCode) : undefined;

    if (!item && requestedCode) {
      // A partially typed code is only accepted while it points at exactly one
      // of the location's services.
      const partial = normalizeLookup(requestedCode);
      const candidates = items.filter((candidate) => {
        const full = normalizeLookup(candidate.ItemCode);
        return full.startsWith(partial) || partial.startsWith(full);
      });
      if (candidates.length === 1) [item] = candidates;
    }

    if (!item && wantedName) {
      const byName = items.filter((candidate) => {
        const candidateNames = [
          normalizeLookup(candidate.ItemPrintDes),
          normalizeLookup(candidate.ItemDes),
        ].filter(Boolean);
        return candidateNames.some((candidateName) =>
          candidateName === wantedName ||
          (candidateName.length >= 6 &&
            (candidateName.startsWith(wantedName) || wantedName.startsWith(candidateName))),
        );
      });
      // Same name configured more than once at this location: the first code
      // wins, so a retry always lands on the same item.
      if (byName.length > 0) {
        item = [...byName].sort((a, b) =>
          itemCode(a.ItemCode).localeCompare(itemCode(b.ItemCode)),
        )[0];
      }
    }

    if (!item) {
      throw new BookingConfigurationError(
        `Service "${service.name}" is not configured as a service item for the selected location.`,
      );
    }

    const fullItemCode = itemCode(item.ItemCode);
    if (!fullItemCode) {
      throw new BookingConfigurationError(
        `Service "${service.name}" has an invalid legacy item code for the selected location.`,
      );
    }

    // tbl_itemmaster.ItemCode is CHAR(15) and is stored AS IT IS in
    // tbl_bookingservicedetail.ServiceItemID (CHAR(15) after
    // scripts/migrate-itemcode-char15.sql). Never cut it to 10 characters: two
    // services sharing a prefix used to resolve to the same — wrong — service.
    const serviceItemID = fullItemCode;
    if (!serviceItemID) {
      throw new BookingConfigurationError(
        `Service "${service.name}" has an invalid legacy item code for the selected location.`,
      );
    }
    if (usedCodes.has(serviceItemID)) {
      throw new BookingConfigurationError(
        `Service "${service.name}" is selected more than once.`,
      );
    }
    usedCodes.add(serviceItemID);

    // ── Server-authoritative pricing ─────────────────────────────────────
    // Never trust the price sent by the browser. It is recomputed from
    // tbl_itemmaster.Retailprice (× qty for clients that send a quantity), so
    // a tampered payload (devtools) cannot book a LKR 5,000 service at LKR 500
    // and then have the bill use that price. A mismatch is logged and the
    // database price is stored, exactly like the admin appointment form does.
    const retailPrice = Number(item.Retailprice) || 0;
    const qty = parseQuantity(service.qty);
    const sentPrice = parsePrice(service.price);
    let itemPrice = sentPrice;

    if (retailPrice > 0) {
      const correctPrice = Math.round(retailPrice * qty * 100) / 100;
      if (Math.abs(sentPrice - correctPrice) > 0.009) {
        console.warn(
          `[PRICE_FIXED] Item "${fullItemCode}": client sent LKR ${sentPrice}, ` +
            `tbl_ItemMaster.Retailprice = LKR ${retailPrice} × ${qty} = LKR ${correctPrice}. ` +
            `Storing the DB price.`,
        );
      }
      itemPrice = correctPrice;
    } else if (sentPrice <= 0) {
      console.warn(
        `[PRICE_MISSING] Item "${fullItemCode}" has no Retailprice in tbl_itemmaster ` +
          `and the booking arrived without a price — booking it at LKR 0.`,
      );
    } else {
      console.warn(
        `[PRICE_MISSING] Item "${fullItemCode}" has no Retailprice in tbl_itemmaster — ` +
          `keeping the LKR ${sentPrice} sent by the page. Set the price in the Item Master.`,
      );
    }

    // Duration still comes from the Item Master (never from the payload) so the
    // availability and overlap checks cannot be shortened by a client.
    return {
      serviceItemID,
      itemPrice,
      durationMin: parseDuration(item.SerDuration),
    };
  });
}

async function resolveLegacyProviders(
  providers: BookingProvider[],
  locCode: string,
): Promise<PreparedProvider[]> {
  if (providers.length === 0) return [];

  const users = await prisma.tbl_userdetails.findMany({
    where: { Enable: true },
    select: { UserId: true, UserName: true, WorkingLocID: true },
  });
  const belongsToBranch = (workingLocations: string): boolean => {
    const locations = String(workingLocations || '')
      .split(/[\s,]+/)
      .map((value) => normalizeLookup(value))
      .filter(Boolean);
    return locations.length === 0 || locations.includes('0') || locations.includes(normalizeLookup(locCode));
  };

  return providers.map((provider) => {
    const wanted = normalizeLookup(provider.name);
    if (!wanted) {
      throw new BookingConfigurationError('Every selected provider must have a configured name.');
    }
    const user = users.find((candidate) => {
      const candidateName = normalizeLookup(candidate.UserName);
      const nameMatches = candidateName === wanted ||
        (candidateName.length >= 6 &&
          (candidateName.startsWith(wanted) || wanted.startsWith(candidateName)));
      return nameMatches && belongsToBranch(candidate.WorkingLocID);
    });

    if (!user || !user.UserId.trim() || user.UserId.trim().length > 10) {
      throw new BookingConfigurationError(
        `Provider "${provider.name}" is not configured for the selected location.`,
      );
    }
    return { ...provider, techID: user.UserId.trim() };
  });
}

async function resolveOnlineBookingTypeID(): Promise<string> {
  try {
    const types = await prisma.tbl_bookingtypes.findMany({
      where: { Enabel: true },
      select: { BooikingTypeID: true, BookingTypeDes: true },
    });
    const online = types.find((type) => normalizeLookup(type.BookingTypeDes).includes('online'));
    return online?.BooikingTypeID?.trim() || 'BKT0000002';
  } catch {
    return 'BKT0000002';
  }
}

/**
 * Serialize booking-ID allocation for a branch. Locking the location row also
 * protects the first booking, when no booking header exists yet.
 */
async function lockBookingIDNamespaceTx(
  tx: Prisma.TransactionClient,
  locCode: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT LocCode
    FROM tbl_locationmaster
    WHERE RTRIM(LocCode) = ${locCode.trim()}
    LIMIT 1
    FOR UPDATE
  `;
}

/**
 * Booking ID — BK0000001, BK0000002, …
 *
 * The number is issued by the BK series in Tbl_Serials (src/lib/serials.ts):
 * the counter row is read, one is added, and the new value is written back.
 * The read and the write happen under a row lock, so two bookings saved at the
 * very same moment can never end up with the same ID.
 */
async function generateBookingIDTx(
  tx: Prisma.TransactionClient,
): Promise<string> {
  return nextSerialTx(tx, SERIAL_CODES.booking);
}

function isDuplicateKeyError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 'P2002' ||
    (error?.code === 'P2010' && (message.includes('1062') || message.includes('duplicate entry')));
}

/* ─────────────────────────────────────────────────────────────────────────────
   PAYLOAD VALIDATOR
─────────────────────────────────────────────────────────────────────────────── */
function validateBookingBody(body: Partial<BookingRequestBody>): string | null {
  if (!body.name?.trim())     return 'Name is required.';
  if (!body.email?.trim())    return 'Email is required.';
  if (!body.phone?.trim())    return 'Phone number is required.';
  if (!body.location?.trim()) return 'Location is required.';
  if (!body.date?.trim())     return 'Date is required.';
  if (!body.timeSlot?.trim()) return 'Time slot is required.';

  if (!Array.isArray(body.services) || body.services.length === 0) {
    return 'At least one service is required.';
  }

  const isWalkin = body.mode === 'without_confirmation';
  if (isWalkin && (!Array.isArray(body.providers) || body.providers.length === 0)) {
    return 'At least one provider is required.';
  }
  if (!Array.isArray(body.providers)) return 'Invalid providers format.';

  return null;
}

function resolveGender(raw: string | undefined): string {
  const val = (raw ?? '').trim().slice(0, 10);
  return val.length > 0 ? val : 'Unknown';
}

function resolveCategories(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw.join(',').slice(0, 255) || 'General';
  const val = (raw ?? '').trim().slice(0, 255);
  return val.length > 0 ? val : 'General';
}

/* ─────────────────────────────────────────────────────────────────────────────
   buildPlainText
─────────────────────────────────────────────────────────────────────────────── */
function buildPlainText(data: {
  name:          string;
  bookingId:     string;
  mode:          string;
  location:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  date:          string;
  timeSlot:      string;
  totalDuration: number;
  notes:         string | null;
  phone:         string;
}): string {
  const isWithout = data.mode === 'without_confirmation';

  const lines = [
    `SAYO Beauty — ${isWithout ? 'Booking Registered' : 'Appointment Request Received'}`,
    `Reference: #${data.bookingId}`,
    ``,
    `Dear ${data.name},`,
    ``,
    isWithout
      ? `Your appointment has been registered. No confirmation call is needed — please arrive on time.`
      : `Thank you for your booking. Our team will call you at ${data.phone} shortly to confirm your appointment.`,
    ``,
    `── APPOINTMENT DETAILS ──────────────────`,
    `Date:        ${formatDate(data.date)}`,
    `Time:        ${data.timeSlot}`,
    `Branch:      ${data.location}`,
    `Provider(s): ${data.providers.map(p => p.name).join(', ')}`,
    `Duration:    ${fmtMins(data.totalDuration)}`,
    ``,
    `── SERVICES ─────────────────────────────`,
    ...data.services.map(s => `  • ${s.name}  |  ${s.price}  |  ${s.duration}`),
    ``,
    data.notes ? `Notes: ${data.notes.trim()}` : '',
    `── NOTE ─────────────────────────────────`,
    isWithout
      ? `Slots are first-come-first-served. Please arrive at least 5 minutes early. Payment is collected at the salon.`
      : `We will call ${data.phone} as soon as possible to confirm. If you do not receive a call within 24 hours, please contact us directly.`,
    ``,
    `────────────────────────────────────────`,
    `SAYO Beauty  |  Colombo • Negombo • Kiribathgoda`,
    `sayo.worksofficial@gmail.com`,
    ``,
    `You are receiving this email because you made a booking at SAYO Beauty.`,
    `This is a transactional notification.`,
  ];

  return lines.join('\n');
}

/* ─────────────────────────────────────────────────────────────────────────────
   buildConfirmedEmail
─────────────────────────────────────────────────────────────────────────────── */
function buildConfirmedEmail(data: {
  name:          string;
  email:         string;
  phone:         string;
  bookingId:     string;
  location:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  date:          string;
  timeSlot:      string;
  totalDuration: number;
  notes:         string | null;
}) {
  const safe = {
    name:      escapeHtml(data.name),
    phone:     escapeHtml(data.phone),
    location:  escapeHtml(data.location),
    timeSlot:  escapeHtml(data.timeSlot),
    providers: data.providers.map(p => ({ ...p, name: escapeHtml(p.name) })),
    services:  data.services.map(s => ({
      ...s,
      name:     escapeHtml(s.name),
      price:    escapeHtml(s.price),
      duration: escapeHtml(s.duration),
    })),
  };

  const serviceRows = safe.services.map(s => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e8e0cc;
                 color:#2d2000;font-size:13px;font-family:Arial,sans-serif;">
        ${s.name}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e8e0cc;
                 color:#7a5800;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;font-weight:bold;">
        ${s.price}
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #e8e0cc;
                 color:#9a7820;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;">
        ${s.duration}
      </td>
    </tr>`).join('');

  const providerNames = safe.providers.map(p => p.name).join(', ');
  const subject       = `Your SAYO Beauty Appointment — Ref ${data.bookingId}`;
  const preheader     = `Our team will call ${data.phone} shortly to confirm your appointment on ${formatDate(data.date)}.`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Appointment Request — SAYO Beauty</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f0e8;
             -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <div style="display:none;font-size:1px;color:#f5f0e8;line-height:1px;
              max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#f5f0e8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;
                 border:1px solid #d4b96a;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background-color:#7a4f00;padding:36px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;color:#f0c96a;font-size:10px;font-weight:bold;
                         letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;
                          letter-spacing:1px;font-family:Arial,sans-serif;">
                Appointment <strong style="color:#f0c96a;">Request Received</strong>
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.6);font-size:12px;
                         font-family:Arial,sans-serif;">
                Reference&nbsp;<strong style="color:#f0c96a;">Ref ${data.bookingId}</strong>
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 24px;color:#3d3000;font-size:14px;
                          line-height:1.8;font-family:Arial,sans-serif;">
                Dear <strong style="color:#1a1000;">${safe.name}</strong>,<br/>
                Thank you for choosing SAYO Beauty. We have received your booking
                request and it is currently
                <strong style="color:#7a4f00;">pending confirmation</strong>.
              </p>

              <!-- CALL BANNER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#fff8e8;border:2px solid #d4a843;
                       border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:28px;">📞</p>
                    <p style="margin:0 0 8px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;">
                      CONFIRMATION CALL
                    </p>
                    <p style="margin:0 0 12px;color:#1a1000;font-size:16px;
                               font-weight:bold;font-family:Arial,sans-serif;">
                      We will call you shortly at
                    </p>
                    <div style="display:inline-block;background-color:#7a4f00;
                                border-radius:999px;padding:8px 24px;margin-bottom:12px;">
                      <span style="color:#ffffff;font-size:17px;font-weight:bold;
                                   letter-spacing:2px;font-family:Arial,sans-serif;">
                        ${safe.phone}
                      </span>
                    </div>
                    <p style="margin:0;color:#6b5a30;font-size:12px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Our team will contact you
                      <strong style="color:#3d3000;">as soon as possible</strong>
                      to confirm your appointment.<br/>
                      Please keep your phone nearby.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- BOOKING DETAILS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#faf6ee;border:1px solid #d4b96a;
                       border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 22px 6px;">
                    <p style="margin:0;color:#7a4f00;font-size:10px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      YOUR BOOKING DETAILS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 22px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="padding:6px 0;color:#9a8060;
                                               font-size:12px;font-family:Arial,sans-serif;">Date</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${formatDate(data.date)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Time</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.timeSlot}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Branch</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.location}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Provider(s)</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${providerNames}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;
                                   font-size:12px;font-family:Arial,sans-serif;">Duration</td>
                        <td style="padding:6px 0;color:#1a1000;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${fmtMins(data.totalDuration)}
                        </td>
                      </tr>
                      ${data.notes ? `
                      <tr>
                        <td style="padding:6px 0;color:#9a8060;font-size:12px;
                                   font-family:Arial,sans-serif;vertical-align:top;">Notes</td>
                        <td style="padding:6px 0;color:#4a3800;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${escapeHtml(data.notes)}
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SERVICES TABLE -->
              <p style="margin:0 0 8px;color:#7a4f00;font-size:10px;font-weight:bold;
                          letter-spacing:3px;text-transform:uppercase;
                          font-family:Arial,sans-serif;">
                SERVICES REQUESTED
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid #d4b96a;border-radius:8px;
                       overflow:hidden;margin-bottom:24px;">
                <thead>
                  <tr style="background-color:#faf0d4;">
                    <th style="padding:10px 14px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:2px;text-align:left;font-family:Arial,sans-serif;">
                      SERVICE
                    </th>
                    <th style="padding:10px 14px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:2px;text-align:right;font-family:Arial,sans-serif;">
                      PRICE
                    </th>
                    <th style="padding:10px 14px;color:#7a4f00;font-size:11px;font-weight:bold;
                               letter-spacing:2px;text-align:right;font-family:Arial,sans-serif;">
                      TIME
                    </th>
                  </tr>
                </thead>
                <tbody>${serviceRows}</tbody>
              </table>

              <!-- WHAT HAPPENS NEXT -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#faf6ee;border:1px solid #e0d0a0;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;color:#7a4f00;font-size:10px;font-weight:bold;
                               letter-spacing:2px;font-family:Arial,sans-serif;">
                      WHAT HAPPENS NEXT
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;width:22px;">
                          <span style="color:#7a4f00;font-size:13px;font-family:Arial,sans-serif;">1.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          Our team will call
                          <strong style="color:#3d3000;">${safe.phone}</strong>
                          shortly to confirm your slot.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#7a4f00;font-size:13px;font-family:Arial,sans-serif;">2.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          Once confirmed, your booking is locked in.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#7a4f00;font-size:13px;font-family:Arial,sans-serif;">3.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          Payment is collected at the salon on the day.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;vertical-align:top;">
                          <span style="color:#7a4f00;font-size:13px;font-family:Arial,sans-serif;">4.</span>
                        </td>
                        <td style="padding:4px 0;color:#6b5a30;font-size:12px;
                                   line-height:1.6;font-family:Arial,sans-serif;">
                          To cancel or reschedule, please notify us at least
                          <strong style="color:#3d3000;">24 hours in advance</strong>.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#7a4f00;padding:22px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:#f0c96a;font-size:11px;font-weight:bold;
                         letter-spacing:3px;font-family:Arial,sans-serif;">SAYO BEAUTY</p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.6);font-size:11px;
                         font-family:Arial,sans-serif;">
                Colombo &bull; Negombo &bull; Kiribathgoda
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:10px;
                         line-height:1.6;font-family:Arial,sans-serif;">
                You are receiving this email because you made a booking at SAYO Beauty.<br/>
                This is a transactional notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/* ─────────────────────────────────────────────────────────────────────────────
   buildWithoutConfirmationEmail
─────────────────────────────────────────────────────────────────────────────── */
function buildWithoutConfirmationEmail(data: {
  name:          string;
  email:         string;
  phone:         string;
  bookingId:     string;
  location:      string;
  services:      BookingService[];
  providers:     BookingProvider[];
  date:          string;
  timeSlot:      string;
  totalDuration: number;
  notes:         string | null;
}) {
  const safe = {
    name:      escapeHtml(data.name),
    location:  escapeHtml(data.location),
    timeSlot:  escapeHtml(data.timeSlot),
    providers: data.providers.map(p => ({ ...p, name: escapeHtml(p.name) })),
    services:  data.services.map(s => ({
      ...s,
      name:     escapeHtml(s.name),
      price:    escapeHtml(s.price),
      duration: escapeHtml(s.duration),
    })),
  };

  const providerNames = safe.providers.map(p => p.name).join(', ');

  const serviceList = safe.services.map(s => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;
                 color:#1a3a1a;font-size:13px;font-family:Arial,sans-serif;">
        ${s.name}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;
                 color:#1a6b1a;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;font-weight:bold;">
        ${s.price}
      </td>
      <td style="padding:9px 0;border-bottom:1px solid #d4e8d4;
                 color:#4a8a4a;font-size:13px;font-family:Arial,sans-serif;
                 text-align:right;white-space:nowrap;">
        ${s.duration}
      </td>
    </tr>`).join('');

  const subject   = `Your SAYO Beauty Booking Confirmed — ${formatDate(data.date)}`;
  const preheader = `Your booking at ${data.location} on ${formatDate(data.date)} at ${data.timeSlot} is registered. No confirmation call needed.`;

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <title>Booking Confirmed — SAYO Beauty</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f7f0;
             -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <div style="display:none;font-size:1px;color:#f0f7f0;line-height:1px;
              max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="background-color:#f0f7f0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0"
          style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;
                 border:1px solid #7bc47b;box-shadow:0 2px 20px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="background-color:#1a6b1a;padding:36px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;color:#a0e8a0;font-size:10px;font-weight:bold;
                         letter-spacing:4px;text-transform:uppercase;
                         font-family:Arial,sans-serif;">
                SAYO BEAUTY
              </p>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;
                          letter-spacing:1px;font-family:Arial,sans-serif;">
                Booking <strong style="color:#a0e8a0;">Confirmed</strong>
              </h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.6);font-size:12px;
                         font-family:Arial,sans-serif;">
                Reference&nbsp;<strong style="color:#a0e8a0;">Ref ${data.bookingId}</strong>
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background-color:#ffffff;padding:32px 40px;">
              <p style="margin:0 0 22px;color:#1a3a1a;font-size:14px;
                          line-height:1.8;font-family:Arial,sans-serif;">
                Dear <strong style="color:#0a200a;">${safe.name}</strong>,<br/>
                Your appointment has been
                <strong style="color:#1a6b1a;">confirmed</strong>.
                No confirmation call is needed — simply arrive at the salon on time.
              </p>

              <!-- NO-CALL NOTICE -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f0fff0;border:2px solid #7bc47b;
                       border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 22px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:28px;">✅</p>
                    <p style="margin:0 0 6px;color:#1a6b1a;font-size:11px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      NO CONFIRMATION NEEDED
                    </p>
                    <p style="margin:0;color:#3a5a3a;font-size:13px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Just show up at
                      <strong style="color:#0a200a;">${safe.location}</strong> on<br/>
                      <strong style="color:#0a200a;">${formatDate(data.date)}</strong>
                      at <strong style="color:#0a200a;">${safe.timeSlot}</strong>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- BOOKING DETAILS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f5faf5;border:1px solid #b0d8b0;
                       border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 22px 6px;">
                    <p style="margin:0;color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:3px;text-transform:uppercase;
                               font-family:Arial,sans-serif;">
                      BOOKING DETAILS
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 22px 18px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="38%" style="padding:6px 0;color:#6a8a6a;
                                               font-size:12px;font-family:Arial,sans-serif;">Date</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${formatDate(data.date)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">Time</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.timeSlot}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">Branch</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-weight:bold;font-family:Arial,sans-serif;">
                          ${safe.location}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">Provider(s)</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${providerNames}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;
                                   font-size:12px;font-family:Arial,sans-serif;">Duration</td>
                        <td style="padding:6px 0;color:#0a200a;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${fmtMins(data.totalDuration)}
                        </td>
                      </tr>
                      ${data.notes ? `
                      <tr>
                        <td style="padding:6px 0;color:#6a8a6a;font-size:12px;
                                   font-family:Arial,sans-serif;vertical-align:top;">Notes</td>
                        <td style="padding:6px 0;color:#2a4a2a;font-size:13px;
                                   font-family:Arial,sans-serif;">
                          ${escapeHtml(data.notes)}
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SERVICES -->
              <p style="margin:0 0 8px;color:#1a6b1a;font-size:10px;font-weight:bold;
                          letter-spacing:3px;text-transform:uppercase;
                          font-family:Arial,sans-serif;">
                SERVICES
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:24px;border:1px solid #b0d8b0;
                       border-radius:8px;overflow:hidden;">
                <thead>
                  <tr style="background-color:#e8f5e8;">
                    <th style="padding:8px 12px;border-bottom:1px solid #b0d8b0;
                               color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;text-align:left;
                               font-family:Arial,sans-serif;">SERVICE</th>
                    <th style="padding:8px 12px;border-bottom:1px solid #b0d8b0;
                               color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;text-align:right;
                               font-family:Arial,sans-serif;">PRICE</th>
                    <th style="padding:8px 12px;border-bottom:1px solid #b0d8b0;
                               color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;text-align:right;
                               font-family:Arial,sans-serif;">TIME</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colspan="3" style="padding:0 12px;">
                      <table role="presentation" width="100%"
                             cellpadding="0" cellspacing="0">
                        ${serviceList}
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- REMINDER -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background-color:#f5faf5;border:1px solid #b0d8b0;border-radius:8px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0 0 5px;color:#1a6b1a;font-size:10px;font-weight:bold;
                               letter-spacing:2px;font-family:Arial,sans-serif;">REMINDER</p>
                    <p style="margin:0;color:#4a6a4a;font-size:12px;
                               line-height:1.7;font-family:Arial,sans-serif;">
                      Slots are
                      <strong style="color:#1a3a1a;">first-come-first-served</strong>.
                      Please arrive at least
                      <strong style="color:#1a3a1a;">5 minutes early</strong>.
                      Payment is collected at the salon.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1a6b1a;padding:22px 40px;text-align:center;">
              <p style="margin:0 0 4px;color:#a0e8a0;font-size:11px;font-weight:bold;
                         letter-spacing:3px;font-family:Arial,sans-serif;">SAYO BEAUTY</p>
              <p style="margin:0 0 12px;color:rgba(255,255,255,0.6);font-size:11px;
                         font-family:Arial,sans-serif;">
                Colombo &bull; Negombo &bull; Kiribathgoda
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.45);font-size:10px;
                         line-height:1.6;font-family:Arial,sans-serif;">
                You are receiving this email because you made a booking at SAYO Beauty.<br/>
                This is a transactional notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/* ─────────────────────────────────────────────────────────────────────────────
   SEND EMAIL HELPER
─────────────────────────────────────────────────────────────────────────────── */
async function sendBookingEmail(
  to:        string,
  subject:   string,
  html:      string,
  text:      string,
  bookingId: string,
): Promise<void> {
  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || 'SAYO Beauty <sayo.worksofficial@gmail.com>',
      replyTo: process.env.SMTP_FROM || 'SAYO Beauty <sayo.worksofficial@gmail.com>',
      to,
      subject,
      text,
      html,
      headers: {
        'List-Unsubscribe':
          '<mailto:sayo.worksofficial@gmail.com?subject=unsubscribe>',
        'List-Unsubscribe-Post':          'List-Unsubscribe=One-Click',
        'X-Mailer':                       'SAYO-Beauty-Booking/1.0',
        'X-Priority':                     '3',
        'X-MS-Exchange-Organization-SCL': '-1',
        'Precedence':                     'transactional',
        'Auto-Submitted':                 'auto-generated',
        'Message-ID':
          `<booking-${bookingId}-${Date.now()}@sayo.beauty>`,
        'X-Entity-Ref-ID': `booking-${bookingId}`,
        'Feedback-ID':     `booking:sayo-beauty`,
      },
    });
    console.log(`[EMAIL_SENT] → ${to} | ${subject}`);
  } catch (err) {
    console.error('[EMAIL_ERROR]', err);
  }
}

/* ═════════════════════════════════════════════════════════════════════════════
   POST — create booking
═════════════════════════════════════════════════════════════════════════════ */
/* ── how often one caller may book ───────────────────────────────────────── *
 * Every accepted booking sends an SMS to the customer and an e-mail, so this is
 * the endpoint where an unlimited caller costs real money. Two counters: one
 * per caller (per IP) and one per phone number — a script that changes its IP
 * still cannot make the same number ring twenty times. */
const BOOKING_IP_LIMIT = 8;              // per 15 minutes
const BOOKING_PHONE_LIMIT = 3;           // per hour, for one phone number
const BOOKING_WINDOW_MS = 15 * 60 * 1000;
const BOOKING_PHONE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    /* counted BEFORE anything else — no parsing, no database, no SMS */
    const callerIp = clientIp(req);
    const byIp = rateLimit({
      bucket: "booking:ip",
      key: callerIp,
      limit: BOOKING_IP_LIMIT,
      windowMs: BOOKING_WINDOW_MS,
    });
    if (!byIp.ok) {
      console.warn(`[bookings] rate limited ip=${ipForLog(callerIp)}`);
      return NextResponse.json(
        { success: false, message: rateMessage("booking", byIp.retryAfterSec) },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfterSec) } },
      );
    }

    const body = (await req.json()) as Partial<BookingRequestBody>;

    /* the same phone number cannot be made to ring over and over */
    const phoneKey = String(body.phone ?? "").replace(/\D/g, "").slice(-9);
    if (phoneKey.length >= 9) {
      const byPhone = rateLimit({
        bucket: "booking:phone",
        key: phoneKey,
        limit: BOOKING_PHONE_LIMIT,
        windowMs: BOOKING_PHONE_WINDOW_MS,
      });
      if (!byPhone.ok) {
        console.warn(`[bookings] rate limited phone=***${phoneKey.slice(-4)}`);
        return NextResponse.json(
          { success: false, message: rateMessage("booking", byPhone.retryAfterSec) },
          { status: 429, headers: { "Retry-After": String(byPhone.retryAfterSec) } },
        );
      }
    }

    // ── 1. Validate ───────────────────────────────────────────────────────────
    const validationError = validateBookingBody(body);
    if (validationError) {
      return NextResponse.json(
        { success: false, message: validationError },
        { status: 400 },
      );
    }

    const {
      name,
      email,
      phone,
      gender,
      location,
      mode,
      date,
      timeSlot,
      services,
      providers,
      totalDuration,
      notes,
      serviceSchedule,
    } = body as BookingRequestBody;

    const normalizedMode = String(mode || '').trim().toLowerCase();
    const isWithoutConfirmation =
      normalizedMode === 'without_confirmation' ||
      normalizedMode === 'without confirmation' ||
      normalizedMode === 'wo';

    // WC = with confirmation (the salon will call the customer).
    // WO = without confirmation (the booking is accepted immediately).
    const confirmationType = isWithoutConfirmation ? 'wo' : 'wc';
    const legacyStatus = isWithoutConfirmation ? 'CONFIRMED' : 'PENDING';

    // ── 2. Resolve public display values to legacy master values ──────────────
    const branch = await resolveLegacyBranch(location);
    if (!branch) {
      return NextResponse.json(
        { success: false, message: 'Selected location is not configured.' },
        { status: 422 },
      );
    }

    const resolvedServicesRaw = await resolveLegacyServices(
      services,
      branch.LocCode.trim(),
    );
    // One detail row per legacy service item: if the client sends the same
    // service more than once, collapse the duplicates so a booking can never
    // store repeated identical rows (and never inflate the total).
    const resolvedServices = (() => {
      const seen = new Map<string, (typeof resolvedServicesRaw)[number]>();
      for (const service of resolvedServicesRaw) {
        const key = String(service.serviceItemID || '').trim().toUpperCase();
        if (!key || seen.has(key)) continue;
        seen.set(key, service);
      }
      return Array.from(seen.values());
    })();
    const resolvedProviders = await resolveLegacyProviders(
      providers,
      branch.LocCode.trim(),
    );

    // The public flow sends one provider per selected category. The legacy
    // detail table stores one TechID per service row, so a single selected
    // provider owns all service rows; otherwise service rows follow the
    // provider order and use the last provider for any remaining rows.
    const detailRows = resolvedServices.map((service, index) => ({
      ...service,
      techID: resolvedProviders.length === 0
        ? '0'
        : resolvedProviders.length === 1
          ? resolvedProviders[0].techID
          : resolvedProviders[Math.min(index, resolvedProviders.length - 1)].techID,
    }));
    const providerNames = new Map(
      resolvedProviders.map((provider) => [provider.techID, provider.name]),
    );

    const bookingDateTime = toBookingDateTime(date, timeSlot);
    if (!bookingDateTime) {
      return NextResponse.json(
        { success: false, message: 'A valid booking date and time are required.' },
        { status: 400 },
      );
    }
    const startMin = slotToMinutes(timeSlot);
    if (startMin < 0) {
      return NextResponse.json(
        { success: false, message: 'A valid time slot is required.' },
        { status: 400 },
      );
    }

    const preparedServiceSchedule = normalizeServiceSchedule(
      serviceSchedule,
      detailRows,
      startMin,
    );

    // ── 3. Customer resolution ───────────────────────────────────────────────
    // Done INSIDE the write transaction below: a `SELECT … FOR UPDATE` on the
    // email serialises concurrent public submissions, so two simultaneous
    // bookings for the same e-mail can never create duplicate customer rows.
    let customer: {
      CusCode:  string;
      CusName:  string;
      CusEmail: string;
      RegTel:   string;
      Gender:   string | null;
    } | null = null;

    const bookingTypeID = await resolveOnlineBookingTypeID();
    // Remarks stores human notes only; service placement is saved per detail row.
    const bookingRemarks = composeBookingRemarks(notes, []);
    let bookingID = '';
    let detailRowCount = 0;

    // ── 4. Atomic write to header + service detail + transaction detail ───────
    // The views are read-only projections. All three base-table rows are
    // committed or rolled back together so the public flow and admin calendar
    // always see the same booking.
    customer = await prisma.$transaction(
      async (tx) => {
        // Use the branch row as the shared booking-ID/capacity lock. This is
        // required even for WC, which does not claim provider capacity.
        await lockBookingIDNamespaceTx(tx, branch.LocCode.trim());

        // Resolve (or create) the customer under the transaction lock so
        // concurrent submissions for the same e-mail cannot duplicate rows.
        const emailNorm = email.trim().toLowerCase();
        const locked = await tx.$queryRaw<{ CusCode: string }[]>`
          SELECT CusCode FROM tbl_customermaster WHERE CusEmail = ${emailNorm} FOR UPDATE
        `;
        if (locked.length > 0) {
          customer = await tx.tbl_CustomerMaster.update({
            where: { CusCode: locked[0].CusCode },
            data: {
              CusName: name.trim(),
              RegTel: phone.trim().slice(0, 15),
              Gender: gender?.trim().slice(0, 50) || undefined,
            },
          });
        } else {
          const placeholderHash = await bcrypt.hash(
            `guest_${emailNorm}_${Date.now()}`,
            10,
          );
          customer = await tx.tbl_CustomerMaster.create({
            data: {
              CusCode: await generateCusCode(tx),
              CusName: name.trim(),
              CusEmail: emailNorm,
              RegTel: phone.trim().slice(0, 15),
              PSW: placeholderHash,
              Gender: gender?.trim().slice(0, 50) ?? null,
            },
          });
        }

        // A WC request is intentionally allowed through: the salon will call
        // the customer and resolve the slot manually. Only WO bookings claim
        // capacity automatically and are rejected on overlap.
        if (isWithoutConfirmation) {
          await assertNoProviderCapacityConflict(
            tx,
            branch.LocCode.trim(),
            date,
            publicProviderWindows(detailRows, startMin, preparedServiceSchedule),
            providerNames,
          );
        }

        bookingID = await generateBookingIDTx(tx);
        const createdAt = new Date();
        const publicActor = toChar('PUBLIC', 10);
        const confirmed = isWithoutConfirmation ? 1 : 0;

        await tx.$executeRaw`
          INSERT INTO tbl_bookingheder (
            LocCode,
            BookingID,
            CusCode,
            BookingDate,
            TxnDateTime,
            BookingTypeID,
            Status,
            ConfirmationType,
            AdvBookingPayMode,
            AdvBookingAmount,
            Remarks,
            UserID,
            Pax,
            BillingTime
          ) VALUES (
            ${toChar(branch.LocCode, 10)},
            ${toChar(bookingID, 10)},
            ${toChar(customer.CusCode, 10)},
            ${bookingDateTime},
            ${createdAt},
            ${toChar(bookingTypeID, 10)},
            ${toChar(legacyStatus, 10)},
            ${toChar(confirmationType, 2)},
            ${' '},
            ${0},
            ${bookingRemarks},
            ${publicActor},
            ${1},
            ${null}
          )
        `;

        await tx.$executeRaw`
          INSERT INTO tbl_bookingtxndetail (
            LocCode,
            BookingID,
            GuessID,
            BookingDate,
            CancelledDate,
            CancelledBy,
            Confirmed,
            ConfirmedBy,
            ConfirmedDate,
            CheckInTime
          ) VALUES (
            ${toChar(branch.LocCode, 10)},
            ${toChar(bookingID, 10)},
            ${toChar('MAIN', 10)},
            ${bookingDateTime},
            ${null},
            ${' '},
            ${confirmed},
            ${isWithoutConfirmation ? publicActor : ' '},
            ${isWithoutConfirmation ? createdAt : null},
            ${null}
          )
        `;

        detailRowCount = 0;
        for (const [serviceIndex, service] of detailRows.entries()) {
          const schedule = preparedServiceSchedule.find(
            (entry) => entry.serviceIndex === serviceIndex,
          );
          await tx.$executeRaw`
            INSERT INTO tbl_bookingservicedetail (
              LocCode,
              BookingID,
              GuessID,
              ServiceItemID,
              Qty,
              ItemPrice,
              TechID,
              ScheduleIndex,
              ScheduleStartMin,
              ScheduleEndMin
            ) VALUES (
              ${toChar(branch.LocCode, 10)},
              ${toChar(bookingID, 10)},
              ${toChar('MAIN', 10)},
              ${toChar(service.serviceItemID, ITEM_CODE_LENGTH)},
              ${toChar('1', 10)},
              ${service.itemPrice},
              ${toChar(service.techID || '0', 10)},
              ${schedule?.serviceIndex ?? serviceIndex},
              ${schedule?.startMin ?? null},
              ${schedule?.endMin ?? null}
            )
          `;
          detailRowCount += 1;
        }

        return customer as NonNullable<typeof customer>;
      },
      { timeout: 15000 },
    );

    // ── 5. Preserve the existing notification behaviour ───────────────────────
    const emailPayload = {
      name,
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      bookingId: bookingID.trim(),
      location,
      services,
      providers,
      date,
      timeSlot,
      totalDuration: Number(totalDuration) || 0,
      notes: notes || null,
    };

    const plainText = buildPlainText({
      ...emailPayload,
      mode: isWithoutConfirmation ? 'without_confirmation' : 'confirmed',
    });
    if (isWithoutConfirmation) {
      const { subject, html } = buildWithoutConfirmationEmail(emailPayload);
      sendBookingEmail(emailPayload.email, subject, html, plainText, bookingID.trim());
    } else {
      const { subject, html } = buildConfirmedEmail(emailPayload);
      sendBookingEmail(emailPayload.email, subject, html, plainText, bookingID.trim());
    }

    sendAppointmentSMS({
      event: 'booked',
      phone: phone.trim(),
      name: name.trim(),
      bookingId: `Ref #${bookingID.trim()}`,
      branch: location,
      date,
      timeSlot,
    }).then((result) => {
      if (result.success) {
        void logActivity(
          'system', 'sms',
          `SMS sent to ${maskPhoneForLog(phone)} — booking ${bookingID.trim()} (${date} ${timeSlot})`,
        );
      } else {
        console.error(`[SMS_FAILED] BookingId=${bookingID.trim()} error=${result.error}`);
        void logActivity(
          'system', 'sms',
          `SMS FAILED to ${maskPhoneForLog(phone)} — booking ${bookingID.trim()}: ${result.error || 'unknown error'}`,
        );
      }
    }).catch((error) => {
      console.error('[SMS_UNHANDLED_ERROR]', error);
      void logActivity(
        'system', 'sms',
        `SMS FAILED to ${maskPhoneForLog(phone)} — booking ${bookingID.trim()}: unhandled send error`,
      );
    });

    void logActivity(
      'public', 'bookings',
      `New online booking ${bookingID.trim()} — ${name.trim()} on ${date} ${timeSlot} (${isWithoutConfirmation ? 'without confirmation' : 'with confirmation'})`,
    );

    return NextResponse.json({
      success: true,
      bookingId: bookingID.trim(),
      customerId: customer?.CusCode ?? '',
      confirmationType,
      status: legacyStatus,
      serviceRows: detailRowCount,
      message: isWithoutConfirmation
        ? 'Booking registered without confirmation.'
        : 'Booking request received. We will call you shortly to confirm.',
    });
  } catch (error: any) {
    console.error('[BOOKING_API_ERROR]', error);

    if (error instanceof BookingConfigurationError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 422 },
      );
    }

    if (error instanceof ProviderCapacityError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 409 },
      );
    }

    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { success: false, message: 'A booking conflict occurred. Please try submitting again.' },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: false, message: 'Internal server error. Please try again.' },
      { status: 500 },
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   GET — fetch bookings by email
   -----------------------------------------------------------------------------
   The three booking views are the read model. Writes still target their base
   tables because MySQL views are projections and are not the write contract.
─────────────────────────────────────────────────────────────────────────────── */
interface PublicHeaderRow {
  BookingID: string;
  LocCode: string;
  CusCode: string;
  BookingDate: Date | string;
  BookingTypeID: string;
  Status: string;
  ConfirmationType: string;
  Remarks: string | null;
  TxnDateTime: Date | string;
}

interface PublicServiceDetailRow {
  BookingID: string;
  LocCode: string;
  GuessID: string;
  ServiceItemID: string;
  ServiceItem: boolean | number | string | null;
  MOF: string | null;
  SerDuration: number | string | null;
  ItemDes: string | null;
  Qty: string | number | null;
  ItemPrice: number | string | null;
  TechID: string | null;
  ScheduleIndex: number | string | null;
  ScheduleStartMin: number | string | null;
  ScheduleEndMin: number | string | null;
  UserName: string | null;
}

interface PublicTxnDetailRow {
  BookingID: string;
  LocCode: string;
  GuessID: string;
  Confirmed: boolean | number | string | null;
  ConfirmedBy: string | null;
  ConfirmedDate: Date | string | null;
  CancelledBy: string | null;
  CancelledDate: Date | string | null;
  CheckInTime: Date | string | null;
}

function dateOnlyValue(value: unknown): string {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const parsed = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function timeLabelValue(value: unknown): string {
  // Shared wall-clock reader — see src/lib/legacyTime.ts.
  return timeLabelFromValue(value) || '';
}

function eventDateValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = value instanceof Date
    ? value.toISOString().replace('T', ' ').slice(0, 19)
    : String(value);
  if (raw.startsWith('1900-01-01')) return null;
  const parsed = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isTruthyDatabaseValue(value: unknown): boolean {
  return value === true || Number(value) === 1 || value === 'true';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email')?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required.' },
        { status: 400 },
      );
    }

    const customer = await prisma.tbl_CustomerMaster.findFirst({
      where: { CusEmail: email },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: 'No customer found with this email.' },
        { status: 404 },
      );
    }

    const headers = await prisma.$queryRaw<PublicHeaderRow[]>`
      SELECT
        BookingID,
        LocCode,
        CusCode,
        BookingDate,
        BookingTypeID,
        Status,
        ConfirmationType,
        Remarks,
        TxnDateTime
      FROM ${Prisma.raw(HEADER_TABLE)}
      WHERE RTRIM(CusCode) = ${customer.CusCode.trim()}
      ORDER BY BookingDate DESC
      LIMIT 10
    `;

    const groups = await Promise.all(
      headers.map(async (header) => {
        const bookingID = header.BookingID.trim();
        const locCode = header.LocCode.trim();
        const [details, txnDetails] = await Promise.all([
          prisma.$queryRaw<PublicServiceDetailRow[]>`
            SELECT
              RTRIM(h.BookingID) AS BookingID,
              RTRIM(h.LocCode) AS LocCode,
              RTRIM(d.GuessID) AS GuessID,
              RTRIM(d.ServiceItemID) AS ServiceItemID,
              i.ServiceItem AS ServiceItem,
              RTRIM(i.MOF) AS MOF,
              i.SerDuration AS SerDuration,
              RTRIM(i.ItemDes) AS ItemDes,
              d.Qty AS Qty,
              d.ItemPrice AS ItemPrice,
              RTRIM(d.TechID) AS TechID,
              d.ScheduleIndex AS ScheduleIndex,
              d.ScheduleStartMin AS ScheduleStartMin,
              d.ScheduleEndMin AS ScheduleEndMin,
              RTRIM(u.UserName) AS UserName
            ${BOOKING_SERVICE_DETAIL_FROM}
            WHERE RTRIM(h.BookingID) = ${bookingID}
              AND RTRIM(h.LocCode) = ${locCode}
            ORDER BY CASE WHEN d.ScheduleIndex IS NULL THEN 1 ELSE 0 END,
                     d.ScheduleIndex ASC,
                     RTRIM(d.ServiceItemID) ASC
          `,
          prisma.$queryRaw<PublicTxnDetailRow[]>`
            SELECT
              BookingID,
              LocCode,
              GuessID,
              Confirmed,
              ConfirmedBy,
              ConfirmedDate,
              CancelledBy,
              CancelledDate,
              CheckInTime
            FROM ${Prisma.raw(TXN_DETAIL_TABLE)}
            WHERE RTRIM(BookingID) = ${bookingID}
              AND RTRIM(LocCode) = ${locCode}
            ORDER BY GuessID ASC
          `,
        ]);

        const serviceValue = details.map((detail) => {
          const durationMin = parseDuration(detail.SerDuration);
          const quantity = Number(detail.Qty) > 0 ? Number(detail.Qty) : 1;
          return {
            name: detail.ItemDes?.trim() || detail.ServiceItemID.trim(),
            itemCode: detail.ServiceItemID.trim(),
            price: `LKR ${Number(detail.ItemPrice || 0).toLocaleString()}`,
            duration: fmtMins(durationMin),
            durationMin,
            quantity,
            gender: detail.MOF?.trim() || 'O',
            category: '',
          };
        });

        const providerValue = details
          .map((detail) => ({
            id: detail.TechID?.trim() || '0',
            name: detail.UserName?.trim() || detail.TechID?.trim() || '',
            role: '',
          }))
          .filter((provider) => provider.id && provider.id !== '0')
          .filter((provider, providerIndex, all) =>
            all.findIndex((candidate) => candidate.id === provider.id) === providerIndex,
          );

        const columnSchedule = details.map((detail, detailIndex) => {
          const startMin = Number(detail.ScheduleStartMin);
          const endMin = Number(detail.ScheduleEndMin);
          if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
            return null;
          }
          const storedIndex = Number(detail.ScheduleIndex);
          return {
            serviceIndex: Number.isInteger(storedIndex) && storedIndex >= 0
              ? storedIndex
              : detailIndex,
            itemCode: detail.ServiceItemID.trim(),
            startMin,
            endMin,
          };
        });
        // New rows use detail columns. Keep decoding the old Remarks metadata
        // only as a compatibility fallback for bookings created before this
        // migration.
        const nonNullColumnSchedule = columnSchedule.filter(
          (entry): entry is NonNullable<(typeof columnSchedule)[number]> =>
            entry !== null,
        );
        const storedSchedule = nonNullColumnSchedule.length === details.length
          ? nonNullColumnSchedule
          : decodeBookingSchedule(header.Remarks);
        const serviceSchedule = storedSchedule.map((entry) => ({
          ...entry,
          startTime: minutesToClock(entry.startMin),
          endTime: minutesToClock(entry.endMin),
        }));
        const confirmedRow = txnDetails.find((detail) =>
          isTruthyDatabaseValue(detail.Confirmed),
        );
        const cancelledRow = txnDetails.find((detail) =>
          eventDateValue(detail.CancelledDate) !== null,
        );

        return {
          header,
          details,
          txnDetails,
          booking: {
            BookingId: bookingID,
            CusCode: header.CusCode.trim(),
            BookingMode: header.ConfirmationType.trim().toLowerCase() === 'wo'
              ? 'without_confirmation'
              : 'confirmed',
            Gender: customer.Gender || '',
            Location: locCode,
            Services: JSON.stringify(serviceValue),
            Categories: '',
            TotalDuration: details.reduce((sum, detail) => {
              const duration = parseDuration(detail.SerDuration);
              const quantity = Number(detail.Qty) > 0 ? Number(detail.Qty) : 1;
              return sum + duration * quantity;
            }, 0),
            TotalPrice: details.reduce(
              (sum, detail) => sum + Number(detail.ItemPrice || 0),
              0,
            ),
            Providers: JSON.stringify(providerValue),
            ServiceSchedule: serviceSchedule,
            BookingDate: dateOnlyValue(header.BookingDate),
            TimeSlot: timeLabelValue(header.BookingDate),
            SpecialNotes: stripBookingSchedule(header.Remarks) || null,
            Status: header.Status.trim().toLowerCase(),
            CreatedAt: header.TxnDateTime,
            UpdatedAt: header.TxnDateTime,
            ConfirmationType: header.ConfirmationType.trim(),
            Confirmed: Boolean(confirmedRow),
            ConfirmedBy: confirmedRow?.ConfirmedBy?.trim() || '',
            ConfirmedDate: eventDateValue(confirmedRow?.ConfirmedDate),
            CancelledBy: cancelledRow?.CancelledBy?.trim() || '',
            CancelledDate: eventDateValue(cancelledRow?.CancelledDate),
            CheckInTime: eventDateValue(
              txnDetails.find((detail) => eventDateValue(detail.CheckInTime) !== null)?.CheckInTime,
            ),
          },
        };
      }),
    );

    return NextResponse.json({
      success: true,
      customer,
      bookings: groups.map((group) => group.booking),
    });
  } catch (error) {
    console.error('[BOOKING_GET_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 },
    );
  }
}
