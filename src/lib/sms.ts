const TEXTLK_ENDPOINT = "https://app.text.lk/api/v3/sms/send";

function maskEmail(email: string): string {
  const [localPart, domain] = String(email || "").split("@");
  if (!domain || !localPart) return email;

  const len = localPart.length;

  if (len <= 2) {
    return `${localPart[0]}*@${domain}`;
  }

  if (len <= 4) {
    const front = localPart[0];
    const back = localPart[len - 1];
    const stars = "*".repeat(len - 2);
    return `${front}${stars}${back}@${domain}`;
  }

  const visibleFront = Math.min(6, Math.floor(len / 3));
  const visibleBack = 3;

  if (len <= visibleFront + visibleBack) {
    const front = localPart.slice(0, 2);
    const back = localPart.slice(-2);
    const stars = "*".repeat(Math.max(0, len - 4));
    return `${front}${stars}${back}@${domain}`;
  }

  const front = localPart.slice(0, visibleFront);
  const back = localPart.slice(-visibleBack);
  const stars = "*".repeat(len - (visibleFront + visibleBack));

  return `${front}${stars}${back}@${domain}`;
}

function maskPhone(phone: string): string {
  const cleaned = phone.trim().replace(/\s+/g, "").replace(/^\+/, "");

  if (cleaned.length < 7) return cleaned;

  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(-3);
  const maskedMiddle = "*".repeat(cleaned.length - 6);

  return `${prefix}${maskedMiddle}${suffix}`;
}

/**
 * Convert all supported Sri Lankan mobile formats to the Text.lk format.
 *
 * 07XXXXXXXX     -> 947XXXXXXXX
 * 947XXXXXXXX    -> 947XXXXXXXX
 * +947XXXXXXXX   -> 947XXXXXXXX
 * 00947XXXXXXXX  -> 947XXXXXXXX
 */
export function normalizeSmsPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";

  const without00 = digits.startsWith("00") ? digits.slice(2) : digits;

  if (/^0?7\d{8}$/.test(without00)) {
    return `94${without00.replace(/^0/, "")}`;
  }

  if (/^947\d{8}$/.test(without00)) {
    return without00;
  }

  // Keep a non-mobile number usable rather than silently dropping it. The
  // Text.lk account can reject it with a useful provider error if necessary.
  return without00;
}

function smsText(value: string | undefined, fallback: string): string {
  const cleaned = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function formatSmsDate(dateValue: string): string {
  const match = String(dateValue || "")
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return smsText(dateValue, "the selected date");

  const date = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return match[1];

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type AppointmentSMSEvent =
  "booked" | "confirmed" | "cancelled" | "rescheduled";

export interface AppointmentSMSProps {
  event: AppointmentSMSEvent;
  phone: string;
  name: string;
  bookingId: string;
  branch?: string;
  date: string;
  timeSlot: string;
  previousDate?: string;
  previousTimeSlot?: string;
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
  const customerName = smsText(name, "Customer");
  const reference = smsText(bookingId, "your booking");
  const branchLine = branch
    ? `\nBranch: ${smsText(branch, "SAYO Beauty")}`
    : "";

  if (event === "rescheduled") {
    const previousSchedule = `${formatSmsDate(
      previousDate || date,
    )}, ${smsText(previousTimeSlot, "the previous time")}`;
    const newSchedule = `${formatSmsDate(date)}, ${smsText(
      timeSlot,
      "the new time",
    )}`;

    return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} has been rescheduled.\nPrevious: ${previousSchedule}\nNew: ${newSchedule}${branchLine}`;
  }

  const schedule = `Date: ${formatSmsDate(date)}\nTime: ${smsText(
    timeSlot,
    "the selected time",
  )}`;

  if (event === "confirmed") {
    return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} is confirmed.\n${schedule}${branchLine}`;
  }

  if (event === "cancelled") {
    return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} has been cancelled.\n${schedule}${branchLine}`;
  }

  return `SAYO Beauty: Hi ${customerName}, your appointment ${reference} has been booked successfully.\n${schedule}${branchLine}`;
}

interface TextLkResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function sendTextLkSMS(
  recipient: string,
  message: string,
): Promise<TextLkResult> {
  const apiToken = process.env.TEXTLK_API_TOKEN;
  const senderId = process.env.TEXTLK_SENDER_ID;

  if (!apiToken || !senderId) {
    console.error(
      "[SMS Service] TEXTLK_API_TOKEN or TEXTLK_SENDER_ID is missing in .env.local",
    );
    return { success: false, error: "SMS configuration missing" };
  }

  try {
    const response = await fetch(TEXTLK_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient,
        sender_id: senderId,
        message,
      }),
    });

    const responseText = await response.text();
    let data: any = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { message: responseText };
    }

    if (!response.ok) {
      console.error("[Text.lk SMS Error]", data);
      return {
        success: false,
        error: data?.message || "Failed to send SMS",
      };
    }

    return { success: true, data };
  } catch (error) {
    console.error("[Text.lk SMS Fetch Error]", error);
    return {
      success: false,
      error: "Internal server error while sending SMS",
    };
  }
}

export async function sendAppointmentSMS(
  props: AppointmentSMSProps,
): Promise<TextLkResult> {
  const recipient = normalizeSmsPhone(props.phone);

  if (!recipient) {
    return { success: false, error: "Customer phone number is empty" };
  }

  const message = buildAppointmentSMS(props);
  const result = await sendTextLkSMS(recipient, message);

  if (result.success) {
    console.log(
      `[SMS_SENT] event=${props.event} booking=${smsText(props.bookingId, "unknown")}`,
    );
  }

  return result;
}

interface RegistrationSMSProps {
  name: string;
  email: string;
  phone: string;
}

export async function sendRegistrationSMS({
  name,
  email,
  phone,
}: RegistrationSMSProps): Promise<TextLkResult> {
  const formattedPhone = normalizeSmsPhone(phone);
  const maskedEmail = maskEmail(email);
  const maskedPhoneNum = maskPhone(formattedPhone);
  const smsMessage = `Welcome to Sayo, ${name}!\nYour account has been successfully created.\nRegistered Email: ${maskedEmail}\nPhone: ${maskedPhoneNum}`;

  return sendTextLkSMS(formattedPhone, smsMessage);
}
