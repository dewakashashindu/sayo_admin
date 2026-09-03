// src/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  clockToMinutes,
  composeBookingRemarks,
  decodeBookingSchedule,
  minutesToClock,
  stripBookingSchedule,
  type BookingScheduleEntry,
  type StoredBookingScheduleEntry,
} from '@/lib/bookingSchedule';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
─────────────────────────────────────────────────────────────────────────────── */
interface BookingService {
  name:          string;
  price:         string;
  duration:      string;
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
async function generateCusCode(): Promise<string> {
  const last = await prisma.tbl_CustomerMaster.findFirst({
    orderBy: { CreateDateTime: 'desc' },
    select:  { CusCode: true },
  });
  if (!last) return 'CUS0000001';
  const num  = parseInt(last.CusCode.replace(/\D/g, ''), 10) || 0;
  const next = num + 1;
  return `CUS${String(next).padStart(7, '0')}`;
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
  StartMin: number;
  TechID: string;
  ServiceItemID: string;
  Remarks: string | null;
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

  // Lock the branch row as well as the existing appointments. This keeps two
  // simultaneous public no-confirmation requests from both passing an empty
  // capacity check before either one inserts its booking.
  await tx.$queryRaw`
    SELECT LocCode
    FROM tbl_locationmaster
    WHERE RTRIM(LocCode) = ${locCode.trim()}
    FOR UPDATE
  `;

  const rows = await tx.$queryRaw<LegacyCapacityRow[]>`
    SELECT
      RTRIM(h.BookingID) AS BookingID,
      (HOUR(h.BookingDate) * 60 + MINUTE(h.BookingDate)) AS StartMin,
      RTRIM(d.TechID) AS TechID,
      RTRIM(d.ServiceItemID) AS ServiceItemID,
      h.Remarks AS Remarks,
      COALESCE(NULLIF(i.DurationMin, 0), 30) AS DurationMin,
      d.Qty AS Qty
    FROM tbl_bookingheder h
    JOIN tbl_bookingdetail d
      ON d.LocCode = h.LocCode AND d.BookingID = h.BookingID
    LEFT JOIN tbl_itemmaster i
      ON RTRIM(i.LocCode) = RTRIM(d.LocCode)
     AND (RTRIM(i.ItemCode) = RTRIM(d.ServiceItemID)
       OR LEFT(RTRIM(i.ItemCode), 10) = RTRIM(d.ServiceItemID))
    WHERE RTRIM(h.LocCode) = ${locCode.trim()}
      AND DATE(h.BookingDate) = ${date}
      AND UPPER(RTRIM(h.Status)) NOT IN ('CANCELLED', 'CANCEL')
    FOR UPDATE
  `;

  const existingByBookingAndProvider = new Map<string, ProviderWindow>();
  const scheduledExistingWindows: ProviderWindow[] = [];
  for (const row of rows) {
    const techID = String(row.TechID || '').trim();
    if (!techID || techID === '0') continue;

    const bookingID = String(row.BookingID || '').trim();
    const quantity = Number(row.Qty) > 0 ? Number(row.Qty) : 1;
    const duration = Math.max(30, Number(row.DurationMin) || 30) * quantity;
    const storedSchedule = decodeBookingSchedule(row.Remarks);
    const scheduled = storedSchedule.find((entry) =>
      entry.itemCode &&
      normalizeLookup(entry.itemCode) === normalizeLookup(row.ServiceItemID),
    );

    if (scheduled) {
      // Split and swapped public bookings carry the actual service start in
      // Remarks. Keep each service as its own interval so a later service is
      // not incorrectly moved back to the booking's overall start time.
      scheduledExistingWindows.push({
        techID,
        startMin: scheduled.startMin,
        endMin: scheduled.startMin + duration,
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
    },
  }) as LegacyItem[];

  const usedCodes = new Set<string>();

  return services.map((service) => {
    const requestedCode = String(service.itemCode || service.serviceItemID || '').trim();
    const wantedName = normalizeLookup(service.name);
    const item = items.find((candidate) => {
      if (requestedCode && normalizeLookup(candidate.ItemCode) === normalizeLookup(requestedCode)) {
        return true;
      }
      if (!wantedName) return false;
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

    if (!item) {
      throw new BookingConfigurationError(
        `Service "${service.name}" is not configured as a service item for the selected location.`,
      );
    }

    const serviceItemID = item.ItemCode.trim();
    if (!serviceItemID || serviceItemID.length > 10) {
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

    // Keep the public price in the booking detail. This change only moves the
    // write path; pricing and duration policy remain outside its scope.
    return {
      serviceItemID,
      itemPrice: parsePrice(service.price),
      durationMin: parseDuration(service.duration),
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

async function generateBookingIDTx(
  tx: Prisma.TransactionClient,
  locCode: string,
): Promise<string> {
  const rows = await tx.$queryRaw<{ maxID: string | null }[]>`
    SELECT MAX(RTRIM(BookingID)) AS maxID
    FROM tbl_bookingheder
    WHERE RTRIM(LocCode) = ${locCode.trim()}
    FOR UPDATE
  `;
  const maxID = rows[0]?.maxID?.trim() || '';
  const current = maxID.startsWith('BK') ? Number.parseInt(maxID.slice(2), 10) || 0 : 0;
  return `BK${String(current + 1).padStart(7, '0')}`;
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
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BookingRequestBody>;

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

    const resolvedServices = await resolveLegacyServices(
      services,
      branch.LocCode.trim(),
    );
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

    // ── 3. Upsert customer (existing public behaviour) ────────────────────────
    let customer = await prisma.tbl_CustomerMaster.findFirst({
      where: { CusEmail: email.trim().toLowerCase() },
    });

    if (!customer) {
      const placeholderHash = await bcrypt.hash(
        `guest_${email}_${Date.now()}`,
        10,
      );
      const cusCode = await generateCusCode();

      customer = await prisma.tbl_CustomerMaster.create({
        data: {
          CusCode: cusCode,
          CusName: name.trim(),
          CusEmail: email.trim().toLowerCase(),
          RegTel: phone.trim().slice(0, 15),
          PSW: placeholderHash,
          Gender: gender?.trim().slice(0, 50) ?? null,
        },
      });
    } else {
      customer = await prisma.tbl_CustomerMaster.update({
        where: { CusCode: customer.CusCode },
        data: {
          CusName: name.trim(),
          RegTel: phone.trim().slice(0, 15),
          Gender: gender?.trim().slice(0, 50) || customer.Gender,
        },
      });
    }

    const bookingTypeID = await resolveOnlineBookingTypeID();
    const bookingRemarks = composeBookingRemarks(notes, preparedServiceSchedule);
    let bookingID = '';
    let detailRowCount = 0;

    // ── 4. One atomic write to tbl_bookingheder + tbl_bookingdetail ───────────
    // No public booking is created in the former public table anymore. Both legacy rows
    // are committed or rolled back together, so the admin calendar sees the
    // same booking the public customer flow created.
    await prisma.$transaction(
      async (tx) => {
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

        bookingID = await generateBookingIDTx(tx, branch.LocCode.trim());
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
            CancelledDate,
            CancelledBy,
            Pax,
            Confirmed,
            ConfirmedBy,
            ConfirmedDate,
            CheckInTime,
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
            ${null},
            ${' '},
            ${1},
            ${confirmed},
            ${isWithoutConfirmation ? publicActor : ' '},
            ${isWithoutConfirmation ? createdAt : null},
            ${null},
            ${null}
          )
        `;

        detailRowCount = 0;
        for (const service of detailRows) {
          await tx.$executeRaw`
            INSERT INTO tbl_bookingdetail (
              LocCode,
              BookingID,
              GuessID,
              ServiceItemID,
              Qty,
              ItemPrice,
              TechID
            ) VALUES (
              ${toChar(branch.LocCode, 10)},
              ${toChar(bookingID, 10)},
              ${toChar('MAIN', 10)},
              ${toChar(service.serviceItemID, 10)},
              ${toChar('1', 10)},
              ${service.itemPrice},
              ${toChar(service.techID || '0', 10)}
            )
          `;
          detailRowCount += 1;
        }
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
      if (!result.success) {
        console.error(`[SMS_FAILED] BookingId=${bookingID.trim()} error=${result.error}`);
      }
    }).catch((error) => {
      console.error('[SMS_UNHANDLED_ERROR]', error);
    });

    return NextResponse.json({
      success: true,
      bookingId: bookingID.trim(),
      customerId: customer.CusCode,
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
─────────────────────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, message: 'Email is required.' },
        { status: 400 }
      );
    }

    const customer = await prisma.tbl_CustomerMaster.findFirst({
      where: { CusEmail: email.toLowerCase() },
    });

    if (!customer) {
      return NextResponse.json(
        { success: false, message: 'No customer found with this email.' },
        { status: 404 }
      );
    }

    const headers = await prisma.tbl_bookingheder.findMany({
      where: { CusCode: customer.CusCode },
      orderBy: { BookingDate: 'desc' },
      take: 10,
    });

    const detailGroups = await Promise.all(
      headers.map((header) =>
        prisma.tbl_bookingdetail.findMany({
          where: {
            LocCode: header.LocCode,
            BookingID: header.BookingID,
          },
          orderBy: { ServiceItemID: 'asc' },
        }),
      ),
    );

    const bookings = headers.map((header, index) => {
      const details = detailGroups[index];
      const bookingDate = header.BookingDate;
      const dateValue = bookingDate.toISOString().slice(0, 10);
      const hour = bookingDate.getHours();
      const minute = bookingDate.getMinutes();
      const period = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      const timeValue = `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
      const serviceValue = details.map((detail) => ({
        name: detail.ServiceItemID.trim(),
        price: `LKR ${Number(detail.ItemPrice || 0).toLocaleString()}`,
        duration: '',
        category: '',
      }));
      const providerValue = details
        .map((detail) => detail.TechID.trim())
        .filter((techID) => techID && techID !== '0')
        .filter((techID, providerIndex, all) => all.indexOf(techID) === providerIndex)
        .map((name) => ({ name, role: '' }));
      const serviceSchedule = decodeBookingSchedule(header.Remarks).map((entry) => ({
        ...entry,
        startTime: minutesToClock(entry.startMin),
        endTime: minutesToClock(entry.endMin),
      }));

      return {
        BookingId: header.BookingID.trim(),
        CusCode: header.CusCode.trim(),
        BookingMode: header.ConfirmationType.trim().toLowerCase() === 'wo'
          ? 'without_confirmation'
          : 'confirmed',
        Gender: customer.Gender || '',
        Location: header.LocCode.trim(),
        Services: JSON.stringify(serviceValue),
        Categories: '',
        TotalDuration: 0,
        TotalPrice: details.reduce((sum, detail) => sum + Number(detail.ItemPrice || 0), 0),
        Providers: JSON.stringify(providerValue),
        ServiceSchedule: serviceSchedule,
        BookingDate: dateValue,
        TimeSlot: timeValue,
        SpecialNotes: stripBookingSchedule(header.Remarks) || null,
        Status: header.Status.trim().toLowerCase(),
        CreatedAt: header.TxnDateTime,
        UpdatedAt: header.TxnDateTime,
        ConfirmationType: header.ConfirmationType.trim(),
      };
    });

    return NextResponse.json({ success: true, customer, bookings });

  } catch (error) {
    console.error('[BOOKING_GET_ERROR]', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error.' },
      { status: 500 }
    );
  }
}