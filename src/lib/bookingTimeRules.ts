import {
  clockInSpan,
  clockToMinutes,
  intervalInsideSpan,
} from "./operatingHours";

export interface BookingServiceInput {
  serviceItemID: string;
  qty?: number | string | null;
  techID?: string | null;
}

export interface BookingGuestInput {
  timeSlot?: string | null;
  services?: readonly BookingServiceInput[] | null;
}

export interface PlannedServiceWindow {
  serviceIndex: number;
  itemCode: string;
  techID: string;
  startMin: number;
  endMin: number;
}

export interface BookingCompanyHours {
  open: boolean;
  startMin: number;
  closeMin: number;
}

export interface BookingShiftWindow {
  startMin: number;
  closeMin: number;
}

export interface ResolvedBookingStaffSchedule {
  working: boolean;
  windows: readonly BookingShiftWindow[];
  startMin?: number;
  closeMin?: number;
  reason?: string;
}

export function providerWindowsOverlap(
  first: { techID: string; startMin: number; endMin: number },
  second: { techID: string; startMin: number; endMin: number },
): boolean {
  return String(first.techID ?? "").trim().toUpperCase() ===
      String(second.techID ?? "").trim().toUpperCase() &&
    first.startMin < second.endMin &&
    second.startMin < first.endMin;
}

/**
 * Plan every submitted service using the same provider cursor rules used when
 * persisting the booking. Services assigned to one technician are sequential;
 * services assigned to different technicians may run in parallel. The
 * serviceIndex is stable and matches the flattened guest/service payload.
 */
export function planBookingServiceWindows(
  guests: readonly BookingGuestInput[],
  durationOf: (itemCode: string) => number,
  fallbackStartMin: number,
): PlannedServiceWindow[] {
  const records: {
    serviceIndex: number;
    itemCode: string;
    techID: string;
    startHint: number;
    durationMin: number;
    inputOrder: number;
  }[] = [];

  let serviceIndex = 0;
  let inputOrder = 0;

  for (const guest of guests) {
    const rawGuestTime = String(guest.timeSlot ?? "").trim();
    const parsedGuestStart = rawGuestTime ? clockToMinutes(rawGuestTime) : -1;
    const startHint = parsedGuestStart >= 0 ? parsedGuestStart : fallbackStartMin;

    for (const service of guest.services ?? []) {
      const itemCode = String(service.serviceItemID ?? "").trim();
      const rawDuration = Number(durationOf(itemCode));
      const duration = Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : 30;
      const rawQuantity = Number(service.qty);
      const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0
        ? rawQuantity
        : 1;
      const techID = String(service.techID ?? "").trim() || "0";

      records.push({
        serviceIndex,
        itemCode,
        techID,
        startHint,
        durationMin: duration * quantity,
        inputOrder,
      });
      serviceIndex += 1;
      inputOrder += 1;
    }
  }

  records.sort(
    (a, b) => a.startHint - b.startHint || a.inputOrder - b.inputOrder,
  );

  const providerCursors = new Map<string, number>();
  const planned: PlannedServiceWindow[] = records.map((record) => {
    const providerKey = record.techID === "0"
      ? "__UNASSIGNED__"
      : record.techID.toUpperCase();
    const startMin = Math.max(
      record.startHint,
      providerCursors.get(providerKey) ?? record.startHint,
    );
    const endMin = startMin + record.durationMin;
    providerCursors.set(providerKey, endMin);

    return {
      serviceIndex: record.serviceIndex,
      itemCode: record.itemCode,
      techID: record.techID,
      startMin,
      endMin,
    };
  });

  return planned.sort((a, b) => a.serviceIndex - b.serviceIndex);
}

/**
 * Validate the full occupied interval of every service, not merely its start.
 * A technician must be rostered and the complete service interval must fit in
 * one of that technician's working shifts. Unassigned services still have to
 * fit inside salon operating hours.
 */
export function validateBookingTimeRules(input: {
  guests: readonly BookingGuestInput[];
  appointmentTime: string;
  company: BookingCompanyHours;
  staffByID: ReadonlyMap<string, ResolvedBookingStaffSchedule>;
  serviceWindows: readonly PlannedServiceWindow[];
}): string | null {
  const { guests, appointmentTime, company, staffByID, serviceWindows } = input;

  if (!company.open) {
    return "The salon is closed on the selected date at this location.";
  }

  const fallbackTime = String(appointmentTime ?? "").trim();
  const fallbackStart = clockToMinutes(fallbackTime);
  if (fallbackStart < 0) {
    return "A valid appointment date and time are required.";
  }

  for (const guest of guests) {
    const guestTime = String(guest.timeSlot ?? "").trim() || fallbackTime;
    if (clockToMinutes(guestTime) < 0) {
      return "A valid appointment time is required for every guest.";
    }
    if (!clockInSpan(
      clockToMinutes(guestTime),
      company.startMin,
      company.closeMin,
    )) {
      return "That time is outside salon hours for the selected date.";
    }
  }

  for (const service of serviceWindows) {
    if (!intervalInsideSpan(
      service.startMin,
      service.endMin,
      company.startMin,
      company.closeMin,
    )) {
      return "A selected service would end after salon closing time.";
    }

    const techID = String(service.techID ?? "").trim();
    if (!techID || techID === "0") continue;

    const schedule = staffByID.get(techID.toUpperCase());
    if (!schedule?.working) {
      if (schedule?.reason === "leave") {
        return "A selected technician is on leave on the selected date.";
      }
      if (schedule?.reason === "off") {
        return "A selected technician is off on the selected date.";
      }
      return "A selected technician is not scheduled at this location on that date.";
    }

    const windows = schedule.windows.length > 0
      ? schedule.windows
      : schedule.startMin !== undefined && schedule.closeMin !== undefined
        ? [{ startMin: schedule.startMin, closeMin: schedule.closeMin }]
        : [];

    if (!windows.some((window) => intervalInsideSpan(
      service.startMin,
      service.endMin,
      window.startMin,
      window.closeMin,
    ))) {
      return "A selected service would end outside the technician's scheduled shift.";
    }
  }

  return null;
}
