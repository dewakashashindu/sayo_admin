//E:\sayo_admin\sayo-admin\src\app\appointmentform\page.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";

interface Branch {
  LocCode: string;
  LocDes: string;
  Address: string;
}

interface ServiceItem {
  itemCode: string;
  itemDes: string;
  itemPrintDes: string;
  price: number;
  durationMin?: number;
  category1: string;
  category1Label: string;
  category2: string;
  category2Label: string;
  category3: string;
  category3Label: string;
  category4: string;
  category4Label: string;
}

interface ExistingAppointment {
  bookingID?: string;
  date?: string;
  timeSlot?: string;
  duration?: number;
  status?: string;
  categoryCodes?: string[];
  techIDs?: string[];
  /** Real per-technician windows from the server:
      [start, start + Σ service durations for that technician]. */
  techWindows?: { techID: string; startMin: number; endMin: number }[];
  /** Minutes occupied by service rows that have no technician assigned. */
  unassignedDuration?: number;
}

interface CustomerSuggestion {
  cusCode: string;
  cusName: string;
  regTel: string;
  cusEmail: string;
  gender: string;
  blacklisted?: boolean;
  blackListRemarks?: string;
}

interface Technician {
  UserId: string;
  UserName: string;
  WorkingLocID: string;
}

interface GuestProvider {
  guessID: string;
  techID: string;
  techName: string;
  categoryCode: string;
}

interface AvailabilityRequirement {
  id: string;
  timeSlot: string;
  categories: string[];
  selectedProviders: GuestProvider[];
  preferredTechID: string;
}

interface SubClient {
  id: string;
  guessID: string;
  label: string;
  gender: string;
  selectedServices: string[];
  timeSlot: string;
  activeCategoryCode: string;
  activeSubCat2: string;
  activeSubCat3: string;
  activeSubCat4: string;
  providers: GuestProvider[];
}

interface BookingFormData {
  branch: string;
  fullName: string;
  phoneNumber: string;
  emailAddress: string;
  gender: string;
  activeCategoryCode: string;
  activeSubCat2: string;
  activeSubCat3: string;
  activeSubCat4: string;
  selectedServices: string[];
  providers: GuestProvider[];
  date: string;
  timeSlot: string;
  specialRequest: string;
  subClients: SubClient[];
  isReschedule: boolean;
  bookingID: string;
  locCode: string;
  prefilledTechID: string;
  prefilledTechName: string;
}

interface FieldErrors {
  branch?: string;
  fullName?: string;
  phoneNumber?: string;
  selectedServices?: string;
  date?: string;
  timeSlot?: string;
}

const MAIN_TIME_SLOTS = [
  "8:00 AM",
  "8:30 AM",
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
  "5:30 PM",
];

const TIME_OFFSETS = [5, 10, 15, 20, 25];
const MAX_CHARS = 250;
const PHONE_DEBOUNCE_MS = 400;

const CAT_PALETTE: Record<string, { bg: string; text: string; dot: string }> = {
  WAX: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  HAIR: { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
  SKIN: { bg: "#fce7f3", text: "#9d174d", dot: "#ec4899" },
  NAIL: { bg: "#ede9fe", text: "#5b21b6", dot: "#8b5cf6" },
  BODY: { bg: "#d1fae5", text: "#065f46", dot: "#10b981" },
  BRIDAL: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};

function catColor(code: string) {
  return (
    CAT_PALETTE[code?.trim().toUpperCase()] ?? {
      bg: "#f3f4f6",
      text: "#374151",
      dot: "#9ca3af",
    }
  );
}

function slotToMins(slot: string): number {
  if (!slot) return -1;
  const trimmed = slot.trim();
  const spaceIdx = trimmed.lastIndexOf(" ");
  if (spaceIdx === -1) return -1;
  const timePart = trimmed.substring(0, spaceIdx);
  const ap = trimmed.substring(spaceIdx + 1).toUpperCase();
  const colonIdx = timePart.indexOf(":");
  let h =
    colonIdx === -1
      ? parseInt(timePart, 10)
      : parseInt(timePart.substring(0, colonIdx), 10);
  const m =
    colonIdx === -1 ? 0 : parseInt(timePart.substring(colonIdx + 1), 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function minsToSlot(mins: number): string {
  const total = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

function nowSlot(): string {
  const n = new Date();
  return minsToSlot(n.getHours() * 60 + n.getMinutes());
}

function getBaseSlot(selected: string): string | null {
  if (!selected) return null;
  if (MAIN_TIME_SLOTS.includes(selected)) return selected;
  const selMins = slotToMins(selected);
  if (selMins < 0) return null;
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const ms of MAIN_TIME_SLOTS) {
    const diff = selMins - slotToMins(ms);
    if (diff >= 0 && diff < 30 && diff < bestDiff) {
      best = ms;
      bestDiff = diff;
    }
  }
  return best;
}

const ALL_TIME_SLOTS = Array.from(
  new Set(
    MAIN_TIME_SLOTS.flatMap((base) => [
      base,
      ...TIME_OFFSETS.map((offset) => minsToSlot(slotToMins(base) + offset)),
    ]),
  ),
);

function fmtDateLong(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function genId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function genGuessID(idx: number): string {
  return `G${String(idx).padStart(3, "0")}`;
}

/**
 * Convert a Sri Lankan mobile number to one canonical format.
 * Supported input examples:
 *   0771234567
 *   94771234567
 *   +94771234567
 *   0094771234567
 */
function normalizeSriLankanPhone(value: string): string {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  let mobile = digits;

  if (digits.startsWith("94")) {
    mobile = digits.slice(2);
  } else if (digits.startsWith("0")) {
    mobile = digits.slice(1);
  }

  if (/^7\d{8}$/.test(mobile)) {
    return `+94${mobile}`;
  }

  return raw;
}

function normalizedCode(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function resolveTechnicianId(
  value: string | undefined,
  technicians: Technician[],
): string {
  const target = normalizedCode(value);
  if (!target || target === "0") return target;

  const found = technicians.find(
    (technician) =>
      normalizedCode(technician.UserId) === target ||
      normalizedCode(technician.UserName) === target,
  );

  return found?.UserId?.trim() || String(value || "").trim();
}

function getBranchTechnicianIds(
  branch: string,
  technicians: Technician[],
): string[] {
  const branchCode = normalizedCode(branch);

  return [
    ...new Set(
      technicians
        .filter((technician) => {
          const workingLocations = String(technician.WorkingLocID || "")
            .split(",")
            .map(normalizedCode)
            .filter(Boolean);
          return (
            workingLocations.includes(branchCode) ||
            workingLocations.includes("ALL")
          );
        })
        .map((technician) => normalizedCode(technician.UserId))
        .filter((technicianId) => technicianId && technicianId !== "0"),
    ),
  ];
}

/**
 * Which technicians of this appointment are busy at the given slot minutes?
 * Returns:
 *   • []                          → appointment does not occupy the slot
 *   • ["TECH_ID", ...]            → those technicians are busy at the slot
 *   • ["__UNASSIGNED__"]          → unassigned service rows occupy the slot
 *     (counts as one technician of the appointment's categories)
 *
 * Uses the server's real per-technician windows (techWindows) when present:
 * each technician is busy only inside their own [start, start+duration]
 * window, so parallel technicians (e.g. Hair + Nail by two people) do not
 * over-block each other's slots anymore.
 */
function busyTechIdsAt(
  appointment: ExistingAppointment,
  slotMinutes: number,
  currentBookingID: string,
): string[] {
  if (
    currentBookingID &&
    normalizedCode(appointment.bookingID) === normalizedCode(currentBookingID)
  ) {
    return [];
  }

  if (normalizedCode(appointment.status) === "CANCELLED") return [];

  const startMinutes = slotToMins(appointment.timeSlot || "");
  if (startMinutes < 0) return [];

  const candidateEnd = slotMinutes + 30;

  if (
    Array.isArray(appointment.techWindows) &&
    appointment.techWindows.length > 0
  ) {
    const busy: string[] = [];
    for (const w of appointment.techWindows) {
      if (slotMinutes < w.endMin && candidateEnd > w.startMin) {
        busy.push(normalizedCode(w.techID));
      }
    }
    const unassignedDur = appointment.unassignedDuration || 0;
    if (unassignedDur > 0) {
      const end = startMinutes + unassignedDur;
      if (slotMinutes < end && candidateEnd > startMinutes) {
        busy.push("__UNASSIGNED__");
      }
    }
    return busy;
  }

  // ── Legacy fallback (old records without techWindows) ──────────────────
  const categoryCount = new Set(
    (appointment.categoryCodes || []).map(normalizedCode).filter(Boolean),
  ).size;
  const duration =
    categoryCount > 1 ? 30 : Math.max(30, Number(appointment.duration) || 30);
  const endMinutes = startMinutes + duration;
  if (!(slotMinutes < endMinutes && candidateEnd > startMinutes)) return [];

  const techIDs = (appointment.techIDs || [])
    .map(normalizedCode)
    .filter((techID) => techID && techID !== "0");
  return techIDs.length > 0 ? techIDs : ["__UNASSIGNED__"];
}

function calculateSlotAvailability({
  slot,
  categories,
  selectedProviders,
  preferredTechID,
  branch,
  technicians,
  appointments,
  currentBookingID,
  additionalRequirements = [],
}: {
  slot: string;
  categories: string[];
  selectedProviders: GuestProvider[];
  preferredTechID: string;
  branch: string;
  technicians: Technician[];
  appointments: ExistingAppointment[];
  currentBookingID: string;
  additionalRequirements?: AvailabilityRequirement[];
}): boolean {
  const slotMinutes = slotToMins(slot);
  if (slotMinutes < 0) return false;

  const requirementGroups = [
    {
      categories,
      selectedProviders,
      preferredTechID,
    },
    ...additionalRequirements
      .filter((requirement) => slotToMins(requirement.timeSlot) === slotMinutes)
      .map((requirement) => ({
        categories: requirement.categories,
        selectedProviders: requirement.selectedProviders,
        preferredTechID: requirement.preferredTechID,
      })),
  ];
  const categoryRequirements = requirementGroups.flatMap((group) =>
    [...new Set(group.categories.map(normalizedCode).filter(Boolean))].map(
      (category) => ({
        category,
        selectedProviders: group.selectedProviders,
        preferredTechID: group.preferredTechID,
      }),
    ),
  );

  // Before a service is selected there is no technician requirement to test.
  if (categoryRequirements.length === 0) return true;

  const busyTechnicianIds = new Set<string>();
  const unassignedBookingCategories: string[] = [];

  appointments.forEach((appointment) => {
    const busyTechs = busyTechIdsAt(appointment, slotMinutes, currentBookingID);
    if (busyTechs.length === 0) return;

    for (const tech of busyTechs) {
      if (tech === "__UNASSIGNED__") {
        const appointmentCategories = [
          ...new Set(
            (appointment.categoryCodes || []).map(normalizedCode).filter(Boolean),
          ),
        ];
        if (appointmentCategories.length === 0) {
          // The booking has no assignment information. Count it as one
          // technician demand rather than incorrectly making every slot red.
          unassignedBookingCategories.push("__UNKNOWN_BOOKING__");
        } else {
          // Without a selected provider, an existing booking consumes one
          // technician who could otherwise be available for a service.
          unassignedBookingCategories.push(...appointmentCategories);
        }
      } else {
        busyTechnicianIds.add(tech);
      }
    }
  });

  const branchTechnicianIds = getBranchTechnicianIds(branch, technicians);
  const allRequirements = [
    ...categoryRequirements,
    ...unassignedBookingCategories.map((category) => ({
      category,
      selectedProviders: [] as GuestProvider[],
      preferredTechID: "",
    })),
  ];

  const possibleTechnicians = allRequirements.map(
    ({
      category,
      selectedProviders: groupProviders,
      preferredTechID: groupPreferredTechID,
    }) => {
      const assignedProvider = groupProviders.find(
        (provider) => normalizedCode(provider.categoryCode) === category,
      );
      const assignedTechID = resolveTechnicianId(
        assignedProvider?.techID || groupPreferredTechID,
        technicians,
      );

      const candidates = assignedTechID
        ? [assignedTechID]
        : branchTechnicianIds;

      return [
        ...new Set(
          candidates
            .map(normalizedCode)
            .filter((techID) => techID && techID !== "0")
            .filter((techID) => !busyTechnicianIds.has(techID)),
        ),
      ];
    },
  );

  if (possibleTechnicians.some((candidates) => candidates.length === 0)) {
    return false;
  }

  // A booking with two categories, for example Hair + Nail, needs two
  // available technicians at the same time. Find a distinct technician for
  // every category instead of incorrectly reusing one person twice.
  const ordered = possibleTechnicians
    .map((candidates) => ({ candidates }))
    .sort((a, b) => a.candidates.length - b.candidates.length);
  const matched = new Map<string, number>();

  function assignCategory(orderIndex: number, seen: Set<string>): boolean {
    if (orderIndex >= ordered.length) return true;

    const category = ordered[orderIndex];
    for (const technicianId of category.candidates) {
      if (seen.has(technicianId)) continue;
      seen.add(technicianId);

      const previousCategory = matched.get(technicianId);
      if (
        previousCategory === undefined ||
        assignCategory(previousCategory, seen)
      ) {
        matched.set(technicianId, orderIndex);
        return true;
      }
    }

    return false;
  }

  for (let index = 0; index < ordered.length; index += 1) {
    if (!assignCategory(index, new Set<string>())) return false;
  }

  return true;
}

function getSubCat2(services: ServiceItem[], cat1: string): string[] {
  return [
    ...new Set(
      services
        .filter((s) => s.category1?.trim() === cat1 && s.category2?.trim())
        .map((s) => s.category2.trim()),
    ),
  ];
}

function getSubCat3(
  services: ServiceItem[],
  cat1: string,
  cat2: string,
): string[] {
  return [
    ...new Set(
      services
        .filter(
          (s) =>
            s.category1?.trim() === cat1 &&
            s.category2?.trim() === cat2 &&
            s.category3?.trim(),
        )
        .map((s) => s.category3.trim()),
    ),
  ];
}

function getSubCat4(
  services: ServiceItem[],
  cat1: string,
  cat2: string,
  cat3: string,
): string[] {
  return [
    ...new Set(
      services
        .filter(
          (s) =>
            s.category1?.trim() === cat1 &&
            s.category2?.trim() === cat2 &&
            s.category3?.trim() === cat3 &&
            s.category4?.trim(),
        )
        .map((s) => s.category4.trim()),
    ),
  ];
}

function getVisibleServices(
  services: ServiceItem[],
  cat1: string,
  cat2: string,
  cat3: string,
  cat4: string,
): ServiceItem[] {
  let scoped = services.filter((s) => s.category1?.trim() === cat1);

  // If Cat2 values exist under Cat1, wait until the user selects one.
  // Services with an empty Cat2 remain visible as direct Cat1 services.
  if (!cat2) {
    const hasCat2 = scoped.some((s) => !!s.category2?.trim());
    return hasCat2 ? scoped.filter((s) => !s.category2?.trim()) : scoped;
  }

  scoped = scoped.filter((s) => s.category2?.trim() === cat2);

  // If Cat3 values exist under the selected Cat2, wait for Cat3.
  if (!cat3) {
    const hasCat3 = scoped.some((s) => !!s.category3?.trim());
    return hasCat3 ? scoped.filter((s) => !s.category3?.trim()) : scoped;
  }

  scoped = scoped.filter((s) => s.category3?.trim() === cat3);

  // If Cat4 values exist under the selected Cat3, wait for Cat4.
  if (!cat4) {
    const hasCat4 = scoped.some((s) => !!s.category4?.trim());
    return hasCat4 ? scoped.filter((s) => !s.category4?.trim()) : scoped;
  }

  return scoped.filter((s) => s.category4?.trim() === cat4);
}

function getCat1Label(services: ServiceItem[], cat1: string): string {
  return (
    services.find((s) => s.category1?.trim() === cat1)?.category1Label || cat1
  );
}

function getCat2Label(
  services: ServiceItem[],
  cat1: string,
  cat2: string,
): string {
  return (
    services.find(
      (s) => s.category1?.trim() === cat1 && s.category2?.trim() === cat2,
    )?.category2Label || cat2
  );
}

function getCat3Label(
  services: ServiceItem[],
  cat1: string,
  cat2: string,
  cat3: string,
): string {
  return (
    services.find(
      (s) =>
        s.category1?.trim() === cat1 &&
        s.category2?.trim() === cat2 &&
        s.category3?.trim() === cat3,
    )?.category3Label || cat3
  );
}

function getCat4Label(
  services: ServiceItem[],
  cat1: string,
  cat2: string,
  cat3: string,
  cat4: string,
): string {
  return (
    services.find(
      (s) =>
        s.category1?.trim() === cat1 &&
        s.category2?.trim() === cat2 &&
        s.category3?.trim() === cat3 &&
        s.category4?.trim() === cat4,
    )?.category4Label || cat4
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;font-family:'Inter',sans-serif;overflow:hidden;}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes scaleIn{from{opacity:0;transform:scale(.96);}to{opacity:1;transform:scale(1);}}
@keyframes popIn{0%{transform:scale(1);}45%{transform:scale(.96);}100%{transform:scale(1);}}
@keyframes chipIn{from{opacity:0;transform:scale(.8) translateY(4px);}to{opacity:1;transform:none;}}
@keyframes tabIn{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:none;}}
@keyframes rowIn{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:none;}}
@keyframes slideDown{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:none;}}
@keyframes shimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
@keyframes nowPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.45);}50%{box-shadow:0 0 0 7px rgba(239,68,68,0);}}
.tab-in{animation:tabIn .18s ease both}.row-in{animation:rowIn .18s ease both}.slide-down{animation:slideDown .2s ease both}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(30,58,64,.2);border-radius:4px}
*{scrollbar-width:thin;scrollbar-color:rgba(30,58,64,.2) transparent}
.form-card{background:#deeaea;border-radius:16px;padding:22px 24px 26px;display:flex;flex-direction:column;gap:0;box-shadow:0 1px 6px rgba(0,0,0,.07)}
.card-hdr{display:flex;align-items:center;gap:10px;margin-bottom:14px}.card-title{font-size:17px;font-weight:700;color:#1f2937}.card-div{height:1px;background:rgba(30,58,64,.14);margin-bottom:18px}.step-num{width:26px;height:26px;border-radius:50%;background:#1e3a40;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.inp{background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;padding:0 14px;height:44px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;outline:none;width:100%;transition:border-color .18s,box-shadow .18s}.inp:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.08)}.inp::placeholder{color:rgba(0,0,0,.32)}.inp.err{border-color:#e53e3e;background:#fdf0f0}
.sel{background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;padding:0 34px 0 14px;height:44px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;outline:none;width:100%;cursor:pointer;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;background-color:#d0e3e7;transition:border-color .18s}.sel:focus{border-color:#1e3a40;outline:none}
.ta{background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;padding:12px 14px;resize:vertical;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;outline:none;width:100%;line-height:1.6;transition:border-color .18s}.ta:focus{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.08)}.ta::placeholder{color:rgba(0,0,0,.32)}.lbl{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px}.req{color:#e53e3e;margin-left:2px}
.phone-wrap{position:relative}.suggest-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1.5px solid #1e3a40;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:200;overflow:hidden;animation:slideDown .15s ease both}.suggest-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .12s;border-bottom:1px solid #f3f4f6}.suggest-item:last-child{border-bottom:none}.suggest-item:hover{background:#f0f8f9}.suggest-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#5a8a92,#3a6a72);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0}
.date-wrap{position:relative;width:100%;height:48px;background:#d0e3e7;border:1.5px solid transparent;border-radius:9px;cursor:pointer;transition:border-color .18s;display:flex;align-items:center;overflow:hidden}.date-wrap:hover{border-color:rgba(30,58,64,.3)}.date-wrap.focused{border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.08)}.date-wrap.err{border-color:#e53e3e;background:#fdf0f0}.date-wrap input[type=date]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:none;outline:none;background:transparent;font-size:1px}.date-disp{display:flex;align-items:center;gap:10px;padding:0 14px;width:100%;pointer-events:none;z-index:1}
.branch-btn{flex:1;display:flex;align-items:center;justify-content:space-between;background:#d0e3e7;border-radius:10px;padding:12px 14px;cursor:pointer;border:2px solid transparent;transition:all .18s;font-family:'Inter',sans-serif}.branch-btn:hover:not(.sel-b){background:#c8dde3}.branch-btn.sel-b{border-color:#1e3a40;background:#c4dce1}.branch-btn.err-b{border-color:#e53e3e}.b-radio{width:20px;height:20px;border-radius:50%;border:2px solid rgba(30,58,64,.5);background:#deeaea;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s}.b-radio.on{background:#1e3a40;border-color:#1e3a40}.b-radio.on::after{content:'';width:7px;height:7px;border-radius:50%;background:#fff;display:block}
.g-pill{padding:6px 12px;border-radius:20px;border:1.5px solid rgba(30,58,64,.2);background:#c8dde3;cursor:pointer;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:#1e3a40;transition:all .15s;display:flex;align-items:center;gap:4px;white-space:nowrap}.g-pill.f{background:#fce7f3;color:#9d174d;border-color:#ec4899}.g-pill.m{background:#dbeafe;color:#1e40af;border-color:#3b82f6}.g-pill.o{background:#ede9fe;color:#5b21b6;border-color:#8b5cf6}
.person-row{display:flex;align-items:center;gap:10px;background:#d4e8ea;border-radius:10px;padding:10px 14px;border:1.5px solid rgba(30,58,64,.12);animation:rowIn .2s ease both}.p-av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#5a8a92,#3a6a72);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0}.add-btn{display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(30,58,64,.08);border-radius:10px;padding:11px;cursor:pointer;border:2px dashed rgba(30,58,64,.25);font-family:'Inter',sans-serif;font-size:13px;font-weight:600;color:#1e3a40;transition:all .18s;width:100%}.add-btn:hover{background:rgba(30,58,64,.13);border-color:rgba(30,58,64,.4)}
.cli-bar{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}.cli-tab{display:flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;border:2px solid transparent;background:#d0e3e7;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#4b5563;white-space:nowrap;flex-shrink:0;transition:all .18s}.cli-tab:hover:not(.active){background:#c8dde3}.cli-tab.active{background:#1e3a40;color:#fff;border-color:#1e3a40;box-shadow:0 2px 8px rgba(30,58,64,.25)}.cli-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;flex-shrink:0}.cli-badge{background:rgba(255,255,255,.2);color:#fff;border-radius:20px;padding:1px 6px;font-size:10px;font-weight:700}.cli-tab:not(.active) .cli-badge{background:rgba(30,58,64,.12);color:#1e3a40}
.cat-tab{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 14px;border-radius:10px;border:2px solid transparent;background:#d0e3e7;cursor:pointer;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#4b5563;letter-spacing:.04em;transition:all .18s;white-space:nowrap;flex-shrink:0}.cat-tab:hover:not(.active){background:#c8dde3}.cat-tab.active{background:#1e3a40;color:#fff;border-color:#1e3a40}.cat-dot{position:absolute;top:-5px;right:-5px;width:11px;height:11px;border-radius:50%;border:2px solid #deeaea;z-index:1}
.subcat-bar{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;align-items:center}.subcat-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;border:1.5px solid transparent;background:#c8dde3;cursor:pointer;font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:#1e3a40;white-space:nowrap;flex-shrink:0;transition:all .15s}.subcat-btn:hover:not(.sub-active){background:#bdd5da;border-color:rgba(30,58,64,.2)}.subcat-btn.sub-active{background:#1e3a40;color:#fff;border-color:#1e3a40}.subcat-sep{color:#9ca3af;font-size:14px;flex-shrink:0;user-select:none}
.svc-card{background:#d0e3e7;border-radius:10px;padding:13px 15px;cursor:pointer;border:2px solid transparent;transition:all .15s;display:flex;flex-direction:column;gap:4px;position:relative;overflow:hidden;text-align:left;font-family:'Inter',sans-serif}.svc-card:hover:not(.sel-s){background:#c8dde3;transform:translateY(-1px);box-shadow:0 3px 10px rgba(0,0,0,.08)}.svc-card.sel-s{background:linear-gradient(135deg,#c4dce1,#b8d4da);border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.12);animation:popIn .2s ease}.svc-card.err-s{border-color:#e53e3e!important}.svc-chk{width:20px;height:20px;border-radius:50%;border:2px solid rgba(30,58,64,.3);background:#deeaea;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;position:absolute;top:11px;right:11px}.svc-chk.on{background:#1e3a40;border-color:#1e3a40}
.breadcrumb-wrap{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px}.bc-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;font-family:'Inter',sans-serif;background:rgba(30,58,64,.08);color:#1e3a40;white-space:nowrap}.bc-sep{color:#9ca3af;font-size:11px}
.ts-section{display:flex;flex-direction:column;gap:16px}.just-now-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all .18s;white-space:nowrap;flex-shrink:0;animation:nowPulse 2s ease-in-out infinite;box-shadow:0 2px 10px rgba(239,68,68,.35)}.just-now-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(239,68,68,.45)}.just-now-btn.selected{background:linear-gradient(135deg,#15803d,#22c55e);animation:none;box-shadow:0 2px 10px rgba(34,197,94,.35)}.ts-main-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:7px}.ts-btn{background:#d0e3e7;border-radius:8px;padding:10px 4px;text-align:center;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;border:2px solid transparent;transition:all .15s;color:#1e3a40;min-height:40px;display:flex;align-items:center;justify-content:center}.ts-btn:hover:not(.sel-t):not(.base-active){background:#b8d0d5}.ts-btn.base-active{background:#c4dce1;border-color:#1e3a40;color:#1e3a40;box-shadow:0 0 0 2px rgba(30,58,64,.2)}.ts-btn.available{background:#dcfce7;border-color:#86efac;color:#166534}.ts-btn.unavailable{background:#fee2e2;border-color:#fca5a5;color:#b91c1c;cursor:not-allowed}.ts-btn.available:hover:not(.sel-t){background:#bbf7d0}.ts-btn.unavailable:hover{background:#fecaca}.ts-btn.sel-t{background:#1e3a40;color:#fff;border-color:#1e3a40;transform:scale(1.04)}.ts-btn.err-t{border-color:#e53e3e}.ts-offset-wrap{background:rgba(30,58,64,.06);border-radius:12px;padding:14px 16px;border:1.5px solid rgba(30,58,64,.15);animation:slideDown .18s ease both}.ts-offset-label{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;display:flex;align-items:center;gap:6px}.ts-offset-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.ts-off-btn{background:#d0e3e7;border-radius:8px;padding:8px 4px;text-align:center;font-family:'Inter',sans-serif;cursor:pointer;border:2px solid transparent;transition:all .15s;color:#1e3a40;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:46px;justify-content:center}.ts-off-btn.available{background:#dcfce7;border-color:#86efac;color:#166534}.ts-off-btn.unavailable{background:#fee2e2;border-color:#fca5a5;color:#b91c1c;cursor:not-allowed}.ts-off-btn.available:hover:not(.sel-t){background:#bbf7d0}.ts-off-btn.unavailable:hover{background:#fecaca}.ts-off-btn:disabled{opacity:1}.ts-off-btn:hover:not(.sel-t){background:#b8d0d5}.ts-off-btn.unavailable:hover:not(.sel-t){background:#fecaca}.ts-off-btn.sel-t{background:#1e3a40;color:#fff;border-color:#1e3a40}.ts-off-btn .off-delta{font-size:10px;font-weight:700;opacity:.7;line-height:1}.ts-off-btn .off-time{font-size:12px;font-weight:800;line-height:1.3}.slot-availability-legend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:11px;font-weight:700;color:#6b7280}.slot-availability-legend span{display:inline-flex;align-items:center;gap:5px}.slot-legend-dot{display:inline-block;width:9px;height:9px;border-radius:50%}.available-dot{background:#22c55e}.unavailable-dot{background:#ef4444}.slot-availability-note{display:flex;align-items:center;gap:7px;border-radius:8px;padding:8px 10px;font-size:11px;font-weight:600}.slot-availability-note.checking{background:#f0fdf4;color:#166534}.slot-availability-note.failed{background:#fee2e2;color:#b91c1c}.slot-availability-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;animation:nowPulse 1.2s ease-in-out infinite}.sel-time-badge{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,#1e3a40,#2a5060);border-radius:10px;padding:10px 16px}.sel-time-badge .stb-label{font-size:10px;color:rgba(255,255,255,.55);font-weight:700;text-transform:uppercase;letter-spacing:.05em}.sel-time-badge .stb-time{font-size:18px;font-weight:800;color:#4ade80;letter-spacing:.02em}.tech-prefill-badge{display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid rgba(34,197,94,.35);border-radius:10px;padding:10px 14px;margin-bottom:4px}
.chip-bar{background:#1e3a40;border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.chip{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.14);border-radius:20px;padding:4px 9px;font-size:11px;font-weight:600;color:#fff;white-space:nowrap;animation:chipIn .2s ease both}.chip-x{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;color:#fff;font-weight:700;transition:background .15s;border:none;line-height:1}.chip-x:hover{background:rgba(255,255,255,.42)}
.prov-card{background:#d0e3e7;border-radius:11px;padding:12px 14px;cursor:pointer;border:2px solid transparent;transition:all .17s;display:flex;align-items:center;gap:12px;font-family:'Inter',sans-serif;animation:rowIn .18s ease both}.prov-card:hover:not(.sel-p){background:#c8dde3;transform:translateY(-1px)}.prov-card.sel-p{background:linear-gradient(135deg,#c4dce1,#b6d2d9);border-color:#1e3a40;box-shadow:0 0 0 3px rgba(30,58,64,.13)}.prov-av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#5a8a92,#3a6a72);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.15)}.prov-card.sel-p .prov-av{background:linear-gradient(135deg,#1e3a40,#2a5060)}
.sum-card{background:#deeaea;border-radius:16px;padding:20px 20px 24px;display:flex;flex-direction:column;gap:0;box-shadow:0 1px 6px rgba(0,0,0,.07);flex:1;min-height:0;overflow-y:auto}.sum-div{height:1px;background:rgba(30,58,64,.15);margin:10px 0 14px}.sum-dot{border-top:1px dashed rgba(30,58,64,.22);margin:10px 0}.confirm-btn{background:#1e3a40;color:#fff;border:none;border-radius:11px;width:100%;height:50px;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .18s;display:flex;align-items:center;justify-content:center;gap:10px;flex-shrink:0}.confirm-btn:hover:not(:disabled){background:#2a5060;transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.18)}.confirm-btn:disabled{background:#6b8e96;cursor:not-allowed;opacity:.8}.spinner{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .7s linear infinite;flex-shrink:0}
.reschedule-banner{background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fcd34d;border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:12px;margin-bottom:4px}.err-msg{font-size:11px;color:#e53e3e;font-weight:600;margin-top:4px;display:flex;align-items:center;gap:4px;animation:fadeUp .18s ease both}.info-box{display:flex;align-items:flex-start;gap:7px;background:rgba(30,58,64,.06);border-radius:9px;padding:9px 12px}.cat-row{border-radius:12px;overflow:hidden;border:1.5px solid rgba(30,58,64,.12);margin-bottom:12px}.cat-row-hdr{display:flex;align-items:center;gap:8px;padding:9px 13px;background:rgba(30,58,64,.06);border-bottom:1px solid rgba(30,58,64,.1)}.cat-row-body{padding:9px;display:flex;flex-direction:column;gap:7px;background:#d4e8ea}.empty-s{background:#d0e3e7;border-radius:9px;padding:26px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:9px}.empty-ico{width:46px;height:46px;border-radius:50%;background:rgba(30,58,64,.1);display:flex;align-items:center;justify-content:center}.char-ct{font-size:11px;font-weight:600;text-align:right;margin-top:5px;transition:color .18s}.srch{border:1.5px solid #c0cbcc;border-radius:10px;padding:0 14px 0 38px;height:40px;width:240px;font-family:'Inter',sans-serif;font-size:13px;color:#1f2937;background:#fff;outline:none;transition:border-color .15s}.srch:focus{border-color:#1e3a40}.srch::placeholder{color:rgba(0,0,0,.35)}.skeleton{background:linear-gradient(90deg,#d0e3e7 25%,#c2d9de 50%,#d0e3e7 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}.sk-btn{height:52px;border-radius:10px;width:100%}.sk-svc{height:90px;border-radius:10px}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);animation:fadeIn .2s ease both;padding:16px}.modal-bg.closing{animation:fadeIn .18s ease reverse both}.modal-box{background:#fff;border-radius:18px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:'Inter',sans-serif;animation:scaleIn .22s ease both}.modal-box.closing{animation:scaleIn .18s ease reverse both}.m-hdr{background:linear-gradient(135deg,#1e3a40,#2a5060);padding:24px 24px 20px;border-radius:18px 18px 0 0}.m-body{padding:20px 24px 26px;display:flex;flex-direction:column;gap:14px}.prev-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;gap:8px}.prev-lbl{color:#6b7280;font-weight:500;flex-shrink:0}.prev-val{color:#1e3a40;font-weight:700;text-align:right}.prev-sec{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;display:flex;align-items:center;gap:6px}.prev-sec::after{content:'';flex:1;height:1px;background:#f3f4f6}.prev-svc{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8fafa;border-radius:8px;gap:8px}.prev-total{background:linear-gradient(135deg,#1e3a40,#2a5060);border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}.suc-box{background:#fff;border-radius:18px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:scaleIn .22s ease both;font-family:'Inter',sans-serif}
@media(max-width:960px){.sum-col{display:none!important}.mob-sum{display:flex!important;flex-direction:column;gap:12px}}@media(max-width:767px){.main-body{padding-bottom:80px!important}}@media(max-width:540px){.two-inp{flex-direction:column!important}.branch-row{flex-direction:column!important}.person-row{flex-wrap:wrap!important}.svc-grid{grid-template-columns:1fr!important}.ts-main-grid{grid-template-columns:repeat(3,1fr)!important}.ts-offset-grid{grid-template-columns:repeat(5,1fr)!important}.modal-bg{padding:8px!important}}
`;

const Ico = {
  Bell: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Search: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ChevD: ({ s = 14 }: { s?: number }) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  ChevR: ({ s = 12 }: { s?: number }) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Person: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  MapPin: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Users: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Scissors: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  ),
  Prov: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Cal: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Note: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Book: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Eye: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Arrow: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Close: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Trash: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  ),
  Check: () => (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  BigChk: () => (
    <svg
      width="46"
      height="46"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22c55e"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  Tag: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  Alert: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Info: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Inbox: () => (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  Plus: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Clock: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Female: () => (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="5" />
      <line x1="12" y1="13" x2="12" y2="21" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  ),
  Male: () => (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="14" r="5" />
      <line x1="19" y1="5" x2="14.35" y2="9.65" />
      <polyline points="15 5 19 5 19 9" />
    </svg>
  ),
  Reschedule: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 3 3 8 8 8" />
    </svg>
  ),
  Layers: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
};

function ErrMsg({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="err-msg">
      <Ico.Alert /> {msg}
    </p>
  );
}

function FormCard({
  step,
  icon,
  title,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-card">
      <div className="card-hdr">
        <div className="step-num">{step}</div>
        <span
          style={{ color: "#1e3a40", display: "flex", alignItems: "center" }}
        >
          {icon}
        </span>
        <span className="card-title">{title}</span>
      </div>
      <div className="card-div" />
      {children}
    </div>
  );
}

function GenderPills({
  value,
  onChange,
}: {
  value: string;
  onChange: (g: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {[
        { label: "Female", cls: "f", icon: <Ico.Female /> },
        { label: "Male", cls: "m", icon: <Ico.Male /> },
        { label: "Other", cls: "o", icon: null },
      ].map((o) => (
        <button
          type="button"
          key={o.label}
          className={`g-pill ${value === o.label ? o.cls : ""}`}
          onClick={() => onChange(value === o.label ? "" : o.label)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DatePicker({
  value,
  onChange,
  minDate,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: string;
  hasError?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  function open() {
    if (!ref.current) return;
    try {
      (
        ref.current as HTMLInputElement & { showPicker?: () => void }
      ).showPicker?.();
    } catch {
      ref.current.focus();
    }
  }

  return (
    <div
      className={`date-wrap ${focused ? "focused" : ""} ${hasError ? "err" : ""}`}
      onClick={open}
    >
      <input
        ref={ref}
        type="date"
        value={value}
        min={minDate}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        tabIndex={-1}
      />
      <div className="date-disp">
        <span style={{ color: "#1e3a40", flexShrink: 0, opacity: 0.75 }}>
          <Ico.Cal />
        </span>
        <span
          style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: 13,
            fontWeight: 500,
            flex: 1,
            color: value ? "#1f2937" : "rgba(0,0,0,.35)",
          }}
        >
          {value ? fmtDateLong(value) : "Click to select appointment date"}
        </span>
        {value ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#6b7280",
              flexShrink: 0,
            }}
          >
            Change
          </span>
        ) : (
          <span style={{ color: "#1e3a40", opacity: 0.5, flexShrink: 0 }}>
            <Ico.ChevD />
          </span>
        )}
      </div>
    </div>
  );
}

interface CatPanelProps {
  services: ServiceItem[];
  selectedServices: string[];
  activeCat1: string;
  activeCat2: string;
  activeCat3: string;
  activeCat4: string;
  onCat1Change: (c: string) => void;
  onCat2Change: (c: string) => void;
  onCat3Change: (c: string) => void;
  onCat4Change: (c: string) => void;
  onToggleService: (itemCode: string) => void;
  hasError?: boolean;
  isMain?: boolean;
  submitted?: boolean;
  errorMsg?: string;
}

function CategoryPanel({
  services,
  selectedServices,
  activeCat1,
  activeCat2,
  activeCat3,
  activeCat4,
  onCat1Change,
  onCat2Change,
  onCat3Change,
  onCat4Change,
  onToggleService,
  hasError,
  isMain,
  submitted,
  errorMsg,
}: CatPanelProps) {
  const availCat1 = [
    ...new Set(services.map((s) => s.category1?.trim()).filter(Boolean)),
  ];

  const subCat2List = activeCat1 ? getSubCat2(services, activeCat1) : [];
  const subCat3List =
    activeCat1 && activeCat2
      ? getSubCat3(services, activeCat1, activeCat2)
      : [];
  const subCat4List =
    activeCat1 && activeCat2 && activeCat3
      ? getSubCat4(services, activeCat1, activeCat2, activeCat3)
      : [];

  const visibleServices = activeCat1
    ? getVisibleServices(
        services,
        activeCat1,
        activeCat2,
        activeCat3,
        activeCat4,
      )
    : [];

  const selectedObjs = services.filter((s) =>
    selectedServices.includes(s.itemCode),
  );

  const activeCat1Label = getCat1Label(services, activeCat1);
  const activeServiceLabel = activeCat4
    ? getCat4Label(services, activeCat1, activeCat2, activeCat3, activeCat4)
    : activeCat3
      ? getCat3Label(services, activeCat1, activeCat2, activeCat3)
      : activeCat2
        ? getCat2Label(services, activeCat1, activeCat2)
        : activeCat1Label;

  function handleCat1(cat: string) {
    onCat1Change(cat);
    onCat2Change("");
    onCat3Change("");
    onCat4Change("");
  }

  function handleCat2(cat: string) {
    onCat2Change(activeCat2 === cat ? "" : cat);
    onCat3Change("");
    onCat4Change("");
  }

  function handleCat3(cat: string) {
    onCat3Change(activeCat3 === cat ? "" : cat);
    onCat4Change("");
  }

  function handleCat4(cat: string) {
    onCat4Change(activeCat4 === cat ? "" : cat);
  }

  const col1 = catColor(activeCat1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {availCat1.length > 0 && (
        <div>
          <label className="lbl" style={{ marginBottom: 8 }}>
            Service Category
          </label>
          <div
            style={{
              display: "flex",
              gap: 7,
              overflowX: "auto",
              paddingBottom: 3,
            }}
          >
            {availCat1.map((cat) => {
              const hasSel = selectedObjs.some(
                (s) => s.category1?.trim() === cat,
              );
              return (
                <button
                  type="button"
                  key={cat}
                  className={`cat-tab ${activeCat1 === cat ? "active" : ""}`}
                  onClick={() => handleCat1(cat)}
                >
                  {hasSel && (
                    <span
                      className="cat-dot"
                      style={{
                        background:
                          activeCat1 === cat ? "#4ade80" : catColor(cat).dot,
                      }}
                    />
                  )}
                  <span>{getCat1Label(services, cat)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeCat1 && subCat2List.length > 0 && (
        <div
          style={{
            background: "rgba(30,58,64,.04)",
            border: "1.5px solid rgba(30,58,64,.1)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            animation: "slideDown .18s ease both",
          }}
        >
          {(activeCat2 || activeCat3 || activeCat4) && (
            <div className="breadcrumb-wrap">
              <span
                className="bc-chip"
                style={{ background: col1.bg, color: col1.text }}
              >
                <Ico.Layers /> {activeCat1Label}
              </span>
              {activeCat2 && (
                <>
                  <span className="bc-sep">›</span>
                  <span className="bc-chip">
                    {getCat2Label(services, activeCat1, activeCat2)}
                  </span>
                </>
              )}
              {activeCat3 && (
                <>
                  <span className="bc-sep">›</span>
                  <span className="bc-chip">
                    {getCat3Label(services, activeCat1, activeCat2, activeCat3)}
                  </span>
                </>
              )}
              {activeCat4 && (
                <>
                  <span className="bc-sep">›</span>
                  <span className="bc-chip">
                    {getCat4Label(
                      services,
                      activeCat1,
                      activeCat2,
                      activeCat3,
                      activeCat4,
                    )}
                  </span>
                </>
              )}
            </div>
          )}

          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: 7,
              }}
            >
              Sub-category
            </p>
            <div className="subcat-bar">
              {subCat2List.map((cat2) => {
                const label = getCat2Label(services, activeCat1, cat2);
                const hasSel = selectedObjs.some(
                  (s) =>
                    s.category1?.trim() === activeCat1 &&
                    s.category2?.trim() === cat2,
                );
                return (
                  <button
                    type="button"
                    key={cat2}
                    className={`subcat-btn ${activeCat2 === cat2 ? "sub-active" : ""}`}
                    onClick={() => handleCat2(cat2)}
                  >
                    {hasSel && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background:
                            activeCat2 === cat2 ? "#4ade80" : "#22c55e",
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeCat2 && subCat3List.length > 0 && (
            <div className="tab-in">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 7,
                }}
              >
                Type
              </p>
              <div className="subcat-bar">
                {subCat3List.map((cat3) => {
                  const label = getCat3Label(
                    services,
                    activeCat1,
                    activeCat2,
                    cat3,
                  );
                  const hasSel = selectedObjs.some(
                    (s) =>
                      s.category1?.trim() === activeCat1 &&
                      s.category2?.trim() === activeCat2 &&
                      s.category3?.trim() === cat3,
                  );
                  return (
                    <button
                      type="button"
                      key={cat3}
                      className={`subcat-btn ${activeCat3 === cat3 ? "sub-active" : ""}`}
                      onClick={() => handleCat3(cat3)}
                    >
                      {hasSel && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background:
                              activeCat3 === cat3 ? "#4ade80" : "#22c55e",
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeCat2 && activeCat3 && subCat4List.length > 0 && (
            <div className="tab-in">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 7,
                }}
              >
                Style
              </p>
              <div className="subcat-bar">
                {subCat4List.map((cat4) => {
                  const label = getCat4Label(
                    services,
                    activeCat1,
                    activeCat2,
                    activeCat3,
                    cat4,
                  );
                  const hasSel = selectedObjs.some(
                    (s) =>
                      s.category1?.trim() === activeCat1 &&
                      s.category2?.trim() === activeCat2 &&
                      s.category3?.trim() === activeCat3 &&
                      s.category4?.trim() === cat4,
                  );
                  return (
                    <button
                      type="button"
                      key={cat4}
                      className={`subcat-btn ${activeCat4 === cat4 ? "sub-active" : ""}`}
                      onClick={() => handleCat4(cat4)}
                    >
                      {hasSel && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background:
                              activeCat4 === cat4 ? "#4ade80" : "#22c55e",
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedObjs.length > 0 && (
        <div className="chip-bar">
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
            {selectedObjs.map((s) => {
              const col = catColor(s.category1);
              return (
                <span key={s.itemCode} className="chip">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: col.dot,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  {s.itemPrintDes || s.itemDes}
                  <button
                    type="button"
                    className="chip-x"
                    onClick={() => onToggleService(s.itemCode)}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
              LKR{" "}
              {services
                .filter((s) => selectedServices.includes(s.itemCode))
                .reduce((a, s) => a + s.price, 0)
                .toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {activeCat1 && (
        <div>
          <label className="lbl" style={{ marginBottom: 9 }}>
            {activeServiceLabel || "Services"}
            {isMain && <span className="req"> *</span>}
          </label>
          {visibleServices.length === 0 ? (
            <div className="empty-s">
              <div className="empty-ico">
                <Ico.Inbox />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#4b5563" }}>
                {!activeCat2 && subCat2List.length > 0
                  ? "Select a sub-category above to see services"
                  : activeCat2 && !activeCat3 && subCat3List.length > 0
                    ? "Select a type above to see services"
                    : activeCat3 && !activeCat4 && subCat4List.length > 0
                      ? "Select a style above to see services"
                      : "No services in this selection"}
              </p>
            </div>
          ) : (
            <div
              className="svc-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))",
                gap: 9,
              }}
            >
              {visibleServices.map((svc) => {
                const isSel = selectedServices.includes(svc.itemCode);
                const col = catColor(svc.category1);
                const showErr = !!isMain && !!submitted && !!hasError;
                return (
                  <button
                    type="button"
                    key={svc.itemCode}
                    className={`svc-card ${isSel ? "sel-s" : ""} ${showErr ? "err-s" : ""}`}
                    onClick={() => onToggleService(svc.itemCode)}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 3,
                        flexWrap: "wrap",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          background: col.bg,
                          color: col.text,
                          borderRadius: 20,
                          padding: "2px 7px",
                          fontSize: 9,
                          fontWeight: 700,
                          alignSelf: "flex-start",
                        }}
                      >
                        {svc.category1Label || svc.category1}
                      </span>
                      {svc.category2?.trim() && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            background: "rgba(30,58,64,.07)",
                            color: "#374151",
                            borderRadius: 20,
                            padding: "2px 7px",
                            fontSize: 9,
                            fontWeight: 600,
                            alignSelf: "flex-start",
                          }}
                        >
                          {svc.category2Label || svc.category2}
                        </span>
                      )}
                      {svc.category3?.trim() && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            background: "rgba(30,58,64,.05)",
                            color: "#6b7280",
                            borderRadius: 20,
                            padding: "2px 7px",
                            fontSize: 8,
                            fontWeight: 600,
                            alignSelf: "flex-start",
                          }}
                        >
                          {svc.category3Label || svc.category3}
                        </span>
                      )}
                    </div>
                    <div className={`svc-chk ${isSel ? "on" : ""}`}>
                      {isSel && <Ico.Check />}
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#1f2937",
                        paddingRight: 26,
                        lineHeight: 1.3,
                      }}
                    >
                      {svc.itemPrintDes || svc.itemDes}
                    </p>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1e3a40",
                        marginTop: 4,
                      }}
                    >
                      LKR {svc.price.toLocaleString()}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
          {isMain && errorMsg && <ErrMsg msg={errorMsg} />}
        </div>
      )}
    </div>
  );
}

function TimeSlotPicker({
  selectedSlot,
  onSelect,
  hasError,
  clientLabel,
  availability,
  availabilityStatus = "idle",
}: {
  selectedSlot: string;
  onSelect: (slot: string) => void;
  hasError?: boolean;
  clientLabel?: string;
  availability?: Record<string, boolean>;
  availabilityStatus?: "idle" | "loading" | "ready" | "error";
}) {
  const [liveTime, setLiveTime] = useState(nowSlot());
  const [openBase, setOpenBase] = useState<string | null>(() =>
    getBaseSlot(selectedSlot),
  );

  useEffect(() => {
    const id = setInterval(() => setLiveTime(nowSlot()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedSlot) setOpenBase(null);
  }, [selectedSlot]);

  useEffect(() => {
    if (
      selectedSlot &&
      availabilityStatus === "ready" &&
      availability?.[selectedSlot] !== true
    ) {
      onSelect("");
    }
  }, [availability, availabilityStatus, onSelect, selectedSlot]);

  const selectedBase = getBaseSlot(selectedSlot);
  const isSlotSelectable = (slot: string): boolean => {
    if (availabilityStatus === "loading" || availabilityStatus === "error") {
      return false;
    }
    if (availabilityStatus === "ready") {
      return availability?.[slot] === true;
    }
    return true;
  };
  const availabilityClass = (slot: string): string => {
    if (availabilityStatus !== "ready" || !availability) return "";
    return availability[slot] === true ? " available" : " unavailable";
  };
  const isJustNow =
    !!selectedSlot &&
    Math.abs(slotToMins(selectedSlot) - slotToMins(liveTime)) <= 1;

  function handleMainSlot(slot: string) {
    // A red 30-minute anchor can still be opened so the user can inspect
    // available +5/+10/... offsets inside that window.
    if (!isSlotSelectable(slot)) {
      setOpenBase(slot);
      return;
    }

    if (openBase === slot && selectedSlot === slot) {
      onSelect("");
      setOpenBase(null);
    } else if (openBase === slot) {
      onSelect(slot);
    } else {
      onSelect(slot);
      setOpenBase(slot);
    }
  }

  function handleOffset(base: string, off: number) {
    const computed = minsToSlot(slotToMins(base) + off);
    if (!isSlotSelectable(computed)) return;
    const nextSlot =
      selectedSlot === computed && isSlotSelectable(base) ? base : computed;
    onSelect(nextSlot);
  }

  function handleJustNow() {
    const now = nowSlot();
    if (!isSlotSelectable(now)) {
      setOpenBase(getBaseSlot(now));
      return;
    }
    onSelect(now);
    setOpenBase(getBaseSlot(now));
  }

  return (
    <div className="ts-section">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          {clientLabel && (
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: 3,
              }}
            >
              {clientLabel}
            </p>
          )}
          <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            Pick a <strong>30-min slot</strong>, then fine-tune with{" "}
            <strong>+5 to +25 min</strong>.
          </p>
        </div>
        <button
          type="button"
          className={`just-now-btn${isJustNow ? " selected" : ""}`}
          onClick={handleJustNow}
          title="Use current time"
        >
          <Ico.Clock />
          Just Now · {liveTime}
        </button>
      </div>

      {availabilityStatus === "loading" && (
        <div className="slot-availability-note checking">
          <span className="slot-availability-dot" /> Checking technician
          availability...
        </div>
      )}
      {availabilityStatus === "error" && (
        <div className="slot-availability-note failed">
          Could not check technician availability. Please try again after
          choosing the date again.
        </div>
      )}
      {availabilityStatus === "ready" && availability && (
        <div className="slot-availability-legend">
          <span>
            <i className="slot-legend-dot available-dot" /> Available
          </span>
          <span>
            <i className="slot-legend-dot unavailable-dot" /> Fully booked
          </span>
        </div>
      )}

      {selectedSlot && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="sel-time-badge">
            <div>
              <div className="stb-label">Selected</div>
              <div className="stb-time">{selectedSlot}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect("");
              setOpenBase(null);
            }}
            style={{
              background: "rgba(239,68,68,.1)",
              border: "1px solid rgba(239,68,68,.2)",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 700,
              color: "#dc2626",
              cursor: "pointer",
              fontFamily: "'Inter',sans-serif",
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            marginBottom: 8,
          }}
        >
          Main Slots (30 min intervals)
        </p>
        <div className={`ts-main-grid${hasError ? " err-t" : ""}`}>
          {MAIN_TIME_SLOTS.map((slot) => {
            const isExact = selectedSlot === slot;
            const isParent = !isExact && selectedBase === slot;
            const unavailable =
              availabilityStatus === "ready" && availability?.[slot] === false;
            return (
              <button
                type="button"
                key={slot}
                className={`ts-btn${availabilityClass(slot)}${isExact ? " sel-t" : isParent ? " base-active" : ""}`}
                onClick={() => handleMainSlot(slot)}
                title={
                  unavailable
                    ? "All suitable technicians are booked at this time"
                    : undefined
                }
              >
                {slot}
              </button>
            );
          })}
        </div>
      </div>

      {openBase && (
        <div className="ts-offset-wrap">
          <div className="ts-offset-label">
            <Ico.Clock /> Fine-tune from{" "}
            <strong style={{ color: "#1e3a40" }}>{openBase}</strong>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                color: "#9ca3af",
                fontWeight: 500,
                textTransform: "none",
              }}
            >
              within the 30-min window
            </span>
          </div>
          <div className="ts-offset-grid">
            {TIME_OFFSETS.map((off) => {
              const computed = minsToSlot(slotToMins(openBase) + off);
              const unavailable =
                availabilityStatus === "ready" &&
                availability?.[computed] === false;
              const unavailableOrChecking =
                availabilityStatus === "loading" ||
                availabilityStatus === "error" ||
                unavailable;
              return (
                <button
                  type="button"
                  key={off}
                  className={`ts-off-btn${availabilityClass(computed)}${selectedSlot === computed ? " sel-t" : ""}`}
                  onClick={() => handleOffset(openBase, off)}
                  disabled={unavailableOrChecking}
                  title={
                    unavailable
                      ? "All suitable technicians are booked at this time"
                      : computed
                  }
                >
                  <span className="off-delta">+{off}m</span>
                  <span className="off-time">{computed}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneField({
  value,
  onChange,
  onSelect,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (c: CustomerSuggestion) => void;
  hasError?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function handleChange(v: string) {
    onChange(v);

    if (timerRef.current) clearTimeout(timerRef.current);

    // Invalidate the previous request so an old response cannot reopen
    // the dropdown after the user has typed a new number.
    const requestId = ++requestSeqRef.current;
    setSuggestions([]);
    setOpen(false);

    const digits = v.replace(/\D/g, "");
    if (digits.length < 3) {
      setLoading(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);

      try {
        const lookupPhone = normalizeSriLankanPhone(v);
        const res = await fetch(
          `/api/appointmentform?type=customer&phone=${encodeURIComponent(lookupPhone)}`,
        );
        const json = await res.json();

        // Ignore a response belonging to an older input value.
        if (requestId !== requestSeqRef.current) return;

        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setSuggestions(json.data);
          setOpen(true);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      } catch {
        if (requestId === requestSeqRef.current) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (requestId === requestSeqRef.current) {
          setLoading(false);
        }
      }
    }, PHONE_DEBOUNCE_MS);
  }

  return (
    <div className="phone-wrap" ref={wrapRef}>
      <div style={{ position: "relative" }}>
        <input
          className={`inp ${hasError ? "err" : ""}`}
          placeholder="+94 77 000 0000"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          autoComplete="off"
        />
        {loading && (
          <span
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid rgba(30,58,64,.2)",
                borderTopColor: "#1e3a40",
                animation: "spin .7s linear infinite",
              }}
            />
          </span>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <div className="suggest-drop">
          {suggestions.map((c) => (
            <div
              key={c.cusCode}
              className="suggest-item"
              onClick={() => {
                onSelect(c);
                setOpen(false);
                setSuggestions([]);
              }}
            >
              <div
                className="suggest-av"
                style={
                  c.blacklisted
                    ? { background: "linear-gradient(135deg,#dc2626,#991b1b)" }
                    : undefined
                }
              >
                {c.blacklisted ? "⛔" : c.cusName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1e3a40" }}>
                  {c.cusName}
                </p>
                <p style={{ fontSize: 11, color: "#6b7280" }}>
                  {c.regTel}
                  {c.gender ? ` · ${c.gender}` : ""}
                </p>
                {c.blacklisted && (
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#dc2626",
                      marginTop: 2,
                    }}
                  >
                    🚫 BLACKLISTED
                    {c.blackListRemarks ? ` — ${c.blackListRemarks}` : ""}
                  </p>
                )}
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: c.blacklisted ? "#dc2626" : "#9ca3af",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {c.blacklisted ? "Blocked" : "Select"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BookingSummary({
  form,
  services,
}: {
  form: BookingFormData;
  services: ServiceItem[];
}) {
  const mainSvcs = services.filter((s) =>
    form.selectedServices.includes(s.itemCode),
  );
  const mainTotal = mainSvcs.reduce((a, s) => a + s.price, 0);
  const subTotals = form.subClients.map((sc) => ({
    sc,
    svcs: services.filter((s) => sc.selectedServices.includes(s.itemCode)),
  }));
  const grand =
    mainTotal +
    subTotals.reduce((a, x) => a + x.svcs.reduce((b, s) => b + s.price, 0), 0);

  return (
    <div className="sum-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Ico.Book />
        <span style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>
          {form.isReschedule ? "Reschedule Summary" : "Booking Summary"}
        </span>
      </div>
      {form.isReschedule && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 8,
            fontSize: 11,
            fontWeight: 600,
            color: "#92400e",
          }}
        >
          ✏️ Rescheduling booking {form.bookingID}
        </div>
      )}
      <div className="sum-div" />
      {form.branch && (
        <>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              marginBottom: 4,
            }}
          >
            Branch
          </p>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#1e3a40",
              marginBottom: 8,
            }}
          >
            {form.branch}
          </p>
          <div className="sum-dot" />
        </>
      )}
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: ".06em",
          marginBottom: 8,
        }}
      >
        Main Client
      </p>
      {mainSvcs.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: "rgba(0,0,0,.35)",
            fontStyle: "italic",
          }}
        >
          No services selected
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {mainSvcs.map((s) => {
            const col = catColor(s.category1);
            return (
              <div
                key={s.itemCode}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 5,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 5,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: col.dot,
                      flexShrink: 0,
                      marginTop: 3,
                      display: "inline-block",
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#1e3a40",
                        lineHeight: 1.3,
                      }}
                    >
                      {s.itemPrintDes || s.itemDes}
                    </p>
                    {s.category2?.trim() && (
                      <p
                        style={{ fontSize: 9, color: "#9ca3af", marginTop: 1 }}
                      >
                        {s.category2Label || s.category2}
                        {s.category3?.trim()
                          ? ` › ${s.category3Label || s.category3}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#1e3a40",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  LKR {s.price.toLocaleString()}
                </span>
              </div>
            );
          })}
          <div
            style={{
              borderTop: "1px dashed rgba(30,58,64,.18)",
              paddingTop: 5,
              marginTop: 2,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              fontWeight: 700,
              color: "#1e3a40",
            }}
          >
            <span>Subtotal</span>
            <span>LKR {mainTotal.toLocaleString()}</span>
          </div>
        </div>
      )}
      {subTotals.map(({ sc, svcs }) => {
        const t = svcs.reduce((a, s) => a + s.price, 0);
        if (!svcs.length) return null;
        return (
          <div key={sc.id}>
            <div className="sum-dot" />
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: 5,
              }}
            >
              {sc.label}
            </p>
            {svcs.map((s) => {
              const col = catColor(s.category1);
              return (
                <div
                  key={s.itemCode}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 5,
                    marginBottom: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 5,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: col.dot,
                        flexShrink: 0,
                        marginTop: 3,
                        display: "inline-block",
                      }}
                    />
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#374151",
                      }}
                    >
                      {s.itemPrintDes || s.itemDes}
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#1e3a40",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    LKR {s.price.toLocaleString()}
                  </span>
                </div>
              );
            })}
            {sc.timeSlot && (
              <p
                style={{
                  fontSize: 9,
                  color: "#6b7280",
                  marginTop: 2,
                  marginLeft: 10,
                }}
              >
                ⏰ {sc.timeSlot}
              </p>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                fontWeight: 700,
                color: "#1e3a40",
                marginTop: 3,
              }}
            >
              <span>Subtotal</span>
              <span>LKR {t.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
      {grand > 0 && (
        <>
          <div className="sum-dot" />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
              fontWeight: 700,
              color: "#1e3a40",
            }}
          >
            <span>Grand Total</span>
            <span>LKR {grand.toLocaleString()}</span>
          </div>
        </>
      )}
      <div className="sum-dot" />
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: ".06em",
          marginBottom: 7,
        }}
      >
        Appointment
      </p>
      {form.date ? (
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#1f2937",
            marginBottom: 3,
          }}
        >
          {fmtDateLong(form.date)}
        </p>
      ) : (
        <p
          style={{
            fontSize: 11,
            color: "rgba(0,0,0,.32)",
            fontStyle: "italic",
            marginBottom: 3,
          }}
        >
          No date selected
        </p>
      )}
      {form.timeSlot ? (
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#1e3a40",
            marginBottom: 3,
          }}
        >
          {form.timeSlot}
        </p>
      ) : (
        <p
          style={{
            fontSize: 11,
            color: "rgba(0,0,0,.32)",
            fontStyle: "italic",
            marginBottom: 3,
          }}
        >
          No time selected
        </p>
      )}
      {form.fullName && (
        <>
          <div className="sum-dot" />
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#1e3a40",
              textTransform: "uppercase",
              letterSpacing: ".04em",
            }}
          >
            {form.fullName}
          </p>
          {form.phoneNumber && (
            <p style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>
              {form.phoneNumber}
            </p>
          )}
          {form.emailAddress && (
            <p style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>
              {form.emailAddress}
            </p>
          )}
        </>
      )}
      {form.prefilledTechName && (
        <>
          <div className="sum-dot" />
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              marginBottom: 4,
            }}
          >
            Assigned Technician
          </p>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#1e3a40" }}>
            {form.prefilledTechName}
          </p>
        </>
      )}
    </div>
  );
}

function ConfirmModal({
  form,
  services,
  grandTotal,
  isLoading,
  onConfirm,
  onClose,
}: {
  form: BookingFormData;
  services: ServiceItem[];
  grandTotal: number;
  isLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  function close() {
    setClosing(true);
    setTimeout(onClose, 180);
  }
  const mainSvcs = services.filter((s) =>
    form.selectedServices.includes(s.itemCode),
  );
  const mainTotal = mainSvcs.reduce((a, s) => a + s.price, 0);

  return (
    <div className={`modal-bg ${closing ? "closing" : ""}`} onClick={close}>
      <div
        className={`modal-box ${closing ? "closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="m-hdr">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: "rgba(255,255,255,.14)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                }}
              >
                <Ico.Eye />
              </div>
              <div>
                <p
                  style={{
                    color: "rgba(255,255,255,.6)",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                  }}
                >
                  {form.isReschedule ? "Confirm Reschedule" : "Review Booking"}
                </p>
                <p style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>
                  {form.isReschedule
                    ? `Rescheduling ${form.bookingID}`
                    : "Confirm Details"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              style={{
                background: "rgba(255,255,255,.12)",
                border: "none",
                borderRadius: 8,
                width: 32,
                height: 32,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <Ico.Close />
            </button>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,.1)",
              borderRadius: 12,
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p
                style={{
                  color: "rgba(255,255,255,.6)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                GRAND TOTAL
              </p>
              <p style={{ color: "#fff", fontSize: 24, fontWeight: 800 }}>
                LKR {grandTotal.toLocaleString()}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  color: "rgba(255,255,255,.6)",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {form.branch}
              </p>
              <p
                style={{
                  color: "rgba(255,255,255,.85)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {fmtDateLong(form.date)}
              </p>
              <p style={{ color: "#4ade80", fontSize: 13, fontWeight: 700 }}>
                {form.timeSlot}
              </p>
            </div>
          </div>
        </div>
        <div className="m-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p className="prev-sec">
              <Ico.Person /> Client Info
            </p>
            <div
              style={{
                background: "#f8fafa",
                borderRadius: 10,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {[
                { l: "Name", v: form.fullName || "—" },
                { l: "Phone", v: form.phoneNumber || "—" },
                ...(form.emailAddress
                  ? [{ l: "Email", v: form.emailAddress }]
                  : []),
                ...(form.gender ? [{ l: "Gender", v: form.gender }] : []),
                ...(form.prefilledTechName
                  ? [{ l: "Technician", v: form.prefilledTechName }]
                  : []),
              ].map((r) => (
                <div key={r.l} className="prev-row">
                  <span className="prev-lbl">{r.l}</span>
                  <span className="prev-val">{r.v}</span>
                </div>
              ))}
            </div>
          </div>
          {mainSvcs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p className="prev-sec">
                <Ico.Scissors /> Services
              </p>
              {mainSvcs.map((s) => {
                const col = catColor(s.category1);
                return (
                  <div key={s.itemCode} className="prev-svc">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        flex: 1,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: col.dot,
                          display: "inline-block",
                          flexShrink: 0,
                          marginTop: 3,
                        }}
                      />
                      <div>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#1e3a40",
                          }}
                        >
                          {s.itemPrintDes || s.itemDes}
                        </p>
                        {s.category2?.trim() && (
                          <p
                            style={{
                              fontSize: 10,
                              color: "#9ca3af",
                              marginTop: 1,
                            }}
                          >
                            {s.category1Label || s.category1} ›{" "}
                            {s.category2Label || s.category2}
                            {s.category3?.trim()
                              ? ` › ${s.category3Label || s.category3}`
                              : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#1e3a40",
                        whiteSpace: "nowrap",
                      }}
                    >
                      LKR {s.price.toLocaleString()}
                    </span>
                  </div>
                );
              })}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#1e3a40",
                }}
              >
                <span>Subtotal</span>
                <span>LKR {mainTotal.toLocaleString()}</span>
              </div>
            </div>
          )}
          {form.subClients.some((sc) => sc.selectedServices.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p className="prev-sec">
                <Ico.Users /> Additional Persons
              </p>
              {form.subClients.map((sc, i) => {
                const scSvcs = services.filter((s) =>
                  sc.selectedServices.includes(s.itemCode),
                );
                const scTotal = scSvcs.reduce((a, s) => a + s.price, 0);
                if (!scSvcs.length) return null;
                return (
                  <div
                    key={sc.id}
                    style={{
                      background: "#f8fafa",
                      borderRadius: 10,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg,#5a8a92,#3a6a72)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#1e3a40",
                        }}
                      >
                        {sc.label}
                      </span>
                      {sc.gender && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: "#f3f4f6",
                            borderRadius: 20,
                            padding: "2px 8px",
                          }}
                        >
                          {sc.gender}
                        </span>
                      )}
                      {sc.timeSlot && (
                        <span
                          style={{
                            marginLeft: "auto",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#1e3a40",
                          }}
                        >
                          ⏰ {sc.timeSlot}
                        </span>
                      )}
                    </div>
                    {scSvcs.map((s) => {
                      const col = catColor(s.category1);
                      return (
                        <div
                          key={s.itemCode}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "5px 0",
                            borderBottom: "1px solid #f0f0f0",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: col.dot,
                                display: "inline-block",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 12,
                                color: "#374151",
                                fontWeight: 500,
                              }}
                            >
                              {s.itemPrintDes || s.itemDes}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#1e3a40",
                            }}
                          >
                            LKR {s.price.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#1e3a40",
                      }}
                    >
                      <span>Subtotal</span>
                      <span>LKR {scTotal.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {form.specialRequest && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p className="prev-sec">
                <Ico.Note /> Special Request
              </p>
              <div
                style={{
                  background: "#f8fafa",
                  borderRadius: 10,
                  padding: "11px 14px",
                }}
              >
                <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {form.specialRequest}
                </p>
              </div>
            </div>
          )}
          <div className="prev-total">
            <div>
              <p
                style={{
                  color: "rgba(255,255,255,.6)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                GRAND TOTAL
              </p>
              <p style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>
                LKR {grandTotal.toLocaleString()}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>
                {form.branch}
              </p>
              <p style={{ color: "#4ade80", fontSize: 12, fontWeight: 700 }}>
                {form.timeSlot}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={close}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 10,
                border: "1.5px solid #d1d5db",
                background: "#fff",
                color: "#374151",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'Inter',sans-serif",
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              style={{
                flex: 2,
                height: 46,
                borderRadius: 10,
                border: "none",
                background: "#1e3a40",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: isLoading ? "not-allowed" : "pointer",
                fontFamily: "'Inter',sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: isLoading ? 0.8 : 1,
              }}
            >
              {isLoading ? (
                <>
                  <div className="spinner" />
                  Processing...
                </>
              ) : (
                <>
                  <Ico.Arrow />
                  {form.isReschedule ? "Confirm Reschedule" : "Confirm Booking"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({
  refNumber,
  form,
  grandTotal,
  isReschedule,
  onClose,
}: {
  refNumber: string;
  form: BookingFormData;
  grandTotal: number;
  isReschedule: boolean;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  function close() {
    setClosing(true);
    setTimeout(onClose, 180);
  }
  return (
    <div className={`modal-bg ${closing ? "closing" : ""}`} onClick={close}>
      <div className="suc-box" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            background: "linear-gradient(135deg,#1e3a40,#2a5060)",
            borderRadius: "18px 18px 0 0",
            padding: "28px 24px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: "50%",
              background: "rgba(255,255,255,.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <Ico.BigChk />
          </div>
          <h2
            style={{
              color: "#fff",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {isReschedule ? "Rescheduled!" : "Booking Confirmed!"}
          </h2>
          <p style={{ color: "rgba(255,255,255,.65)", fontSize: 13 }}>
            {isReschedule
              ? "Appointment successfully rescheduled."
              : "Walk-in booking successfully registered."}
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,.12)",
              border: "1px solid rgba(255,255,255,.2)",
              borderRadius: 20,
              padding: "6px 16px",
              marginTop: 12,
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: ".06em",
            }}
          >
            <Ico.Tag /> REF: {refNumber}
          </div>
        </div>
        <div
          style={{
            padding: "20px 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              background: "#f8fafa",
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {[
              { l: "Client", v: form.fullName || "Walk-in" },
              { l: "Phone", v: form.phoneNumber },
              { l: "Date", v: fmtDateLong(form.date) },
              { l: "Time", v: form.timeSlot },
              { l: "Branch", v: form.branch },
            ]
              .filter((r) => r.v)
              .map((r) => (
                <div key={r.l} className="prev-row">
                  <span className="prev-lbl">{r.l}</span>
                  <span className="prev-val">{r.v}</span>
                </div>
              ))}
          </div>
          <div
            style={{
              background: "linear-gradient(135deg,#1e3a40,#2a5060)",
              borderRadius: 10,
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,.7)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Grand Total
            </span>
            <span style={{ color: "#fff", fontSize: 18, fontWeight: 800 }}>
              LKR {grandTotal.toLocaleString()}
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            style={{
              height: 46,
              borderRadius: 10,
              border: "none",
              background: "#1e3a40",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "'Inter',sans-serif",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderPicker({
  guessID,
  label,
  categories,
  branch,
  selectedProviders,
  onChange,
  technicians,
  services,
}: {
  guessID: string;
  label: string;
  categories: string[];
  branch: string;
  selectedProviders: GuestProvider[];
  onChange: (providers: GuestProvider[]) => void;
  technicians: Technician[];
  services: ServiceItem[];
}) {
  if (!branch || categories.length === 0) return null;
  const branchTechs = technicians.filter((t) => {
    const locs = (t.WorkingLocID || "")
      .split(",")
      .map((s) => s.trim().toUpperCase());
    return locs.includes(branch.trim().toUpperCase()) || locs.includes("ALL");
  });
  function isSelected(techID: string, catCode: string) {
    return selectedProviders.some(
      (gp) => gp.techID === techID && gp.categoryCode === catCode,
    );
  }
  function toggle(tech: Technician, catCode: string) {
    const exists = selectedProviders.find(
      (gp) => gp.techID === tech.UserId && gp.categoryCode === catCode,
    );
    if (exists)
      onChange(
        selectedProviders.filter(
          (gp) => !(gp.techID === tech.UserId && gp.categoryCode === catCode),
        ),
      );
    else {
      const cleaned = selectedProviders.filter(
        (gp) => !(gp.guessID === guessID && gp.categoryCode === catCode),
      );
      onChange([
        ...cleaned,
        {
          guessID,
          techID: tech.UserId,
          techName: tech.UserName,
          categoryCode: catCode,
        },
      ]);
    }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {categories.map((cat) => {
        const col = catColor(cat);
        const assigned = selectedProviders.find(
          (gp) => gp.guessID === guessID && gp.categoryCode === cat,
        );
        return (
          <div key={cat} className="cat-row">
            <div className="cat-row-hdr">
              <span
                style={{
                  background: col.bg,
                  color: col.text,
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {getCat1Label(services, cat)}
              </span>
              <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>
                {label}
              </span>
              {assigned ? (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#16a34a",
                  }}
                >
                  <Ico.Check /> {assigned.techName}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  Not assigned
                </span>
              )}
            </div>
            <div className="cat-row-body">
              {branchTechs.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(0,0,0,.4)",
                    fontStyle: "italic",
                    padding: "6px 4px",
                    textAlign: "center",
                  }}
                >
                  No technicians found for this branch
                </p>
              ) : (
                branchTechs.map((tech) => {
                  const sel = isSelected(tech.UserId, cat);
                  return (
                    <button
                      type="button"
                      key={tech.UserId}
                      className={`prov-card ${sel ? "sel-p" : ""}`}
                      onClick={() => toggle(tech, cat)}
                    >
                      <div className="prov-av">
                        {tech.UserName.trim().charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: sel ? "#1e3a40" : "#1f2937",
                          }}
                        >
                          {tech.UserName.trim()}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: "#6b7280",
                            marginTop: 1,
                          }}
                        >
                          ID: {tech.UserId.trim()}
                        </p>
                      </div>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          flexShrink: 0,
                          border: `2px solid ${sel ? "#1e3a40" : "rgba(30,58,64,.3)"}`,
                          background: sel ? "#1e3a40" : "#deeaea",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all .2s",
                        }}
                      >
                        {sel && <Ico.Check />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WalkInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navKey, setNavKey] = useState("calendar");
  const [search, setSearch] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [techniciansLoading, setTechniciansLoading] = useState(false);
  const [existingAppointments, setExistingAppointments] = useState<
    ExistingAppointment[]
  >([]);
  const [rescheduleBooking, setRescheduleBooking] =
    useState<ExistingAppointment | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [showPreview, setShowPreview] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refNumber, setRefNumber] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [blacklistWarning, setBlacklistWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("main");
  const [form, setForm] = useState<BookingFormData>({
    branch: "",
    fullName: "",
    phoneNumber: "",
    emailAddress: "",
    gender: "",
    activeCategoryCode: "",
    activeSubCat2: "",
    activeSubCat3: "",
    activeSubCat4: "",
    selectedServices: [],
    providers: [],
    date: "",
    timeSlot: "",
    specialRequest: "",
    subClients: [],
    isReschedule: false,
    bookingID: "",
    locCode: "",
    prefilledTechID: "",
    prefilledTechName: "",
  });

  useEffect(() => {
    const isReschedule = searchParams.get("reschedule") === "true";
    const paramDate = searchParams.get("date") || "";
    const paramTimeSlot = searchParams.get("timeSlot") || "";
    const paramLocation = (
      searchParams.get("locCode") ||
      searchParams.get("location") ||
      searchParams.get("locCode2") ||
      ""
    ).trim();
    const paramTechID = (
      searchParams.get("techID") ||
      searchParams.get("providerName") ||
      ""
    ).trim();
    const paramTechName = (
      searchParams.get("providerName") ||
      searchParams.get("techID") ||
      ""
    ).trim();
    if (isReschedule) {
      const bookingID = searchParams.get("bookingID") || "";
      const clientName = searchParams.get("clientName") || "";
      const clientPhone = searchParams.get("clientPhone") || "";
      const clientEmail = searchParams.get("clientEmail") || "";
      const gender = searchParams.get("gender") || "";
      const notes = searchParams.get("notes") || "";
      setForm((f) => ({
        ...f,
        isReschedule: true,
        bookingID,
        locCode: paramLocation,
        branch: paramLocation,
        fullName: clientName,
        phoneNumber: clientPhone,
        emailAddress: clientEmail,
        gender,
        date: paramDate,
        timeSlot: paramTimeSlot,
        specialRequest: notes,
        prefilledTechID: paramTechID,
        prefilledTechName: paramTechName !== paramTechID ? paramTechName : "",
      }));
    } else if (paramDate || paramTimeSlot || paramLocation || paramTechID) {
      setForm((f) => ({
        ...f,
        branch: paramLocation,
        date: paramDate,
        timeSlot: paramTimeSlot,
        prefilledTechID: paramTechID,
        prefilledTechName:
          paramTechName !== paramTechID ? paramTechName : paramTechID,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = "New Walk-in Booking | Sayo Beauty";
    fetch("/api/appointmentform?type=branches")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setBranches(j.data);
      })
      .catch(() => {})
      .finally(() => setBranchesLoading(false));
    return () => {
      document.title = "Sayo Beauty";
    };
  }, []);

  useEffect(() => {
    setTechniciansLoading(true);
    fetch("/api/appointments?meta=filters")
      .then((r) => r.json())
      .then((j) => {
        if (j.success && j.technicians)
          setTechnicians(
            j.technicians.map((t: any) => ({
              UserId: t.UserId?.trim() || "",
              UserName: t.UserName?.trim() || "",
              WorkingLocID: t.WorkingLocID?.trim() || "0",
            })),
          );
      })
      .catch(() => {})
      .finally(() => setTechniciansLoading(false));
  }, []);

  useEffect(() => {
    if (!form.branch || !form.date) {
      setExistingAppointments([]);
      setAvailabilityStatus("idle");
      if (!form.isReschedule) setRescheduleBooking(null);
      return;
    }

    let active = true;
    setAvailabilityStatus("loading");
    setExistingAppointments([]);

    fetch(
      `/api/appointments?date=${encodeURIComponent(form.date)}&locCode=${encodeURIComponent(form.branch)}`,
    )
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Availability lookup failed");
        }
        return json;
      })
      .then((json) => {
        if (!active) return;

        const rows = Array.isArray(json.data) ? json.data : [];
        setExistingAppointments(rows);

        if (form.isReschedule && form.bookingID) {
          const currentBooking = rows.find(
            (appointment: ExistingAppointment) =>
              normalizedCode(appointment.bookingID) ===
              normalizedCode(form.bookingID),
          );
          if (currentBooking) setRescheduleBooking(currentBooking);
        }

        setAvailabilityStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setExistingAppointments([]);
        setAvailabilityStatus("error");
      });

    return () => {
      active = false;
    };
  }, [form.branch, form.date, form.bookingID, form.isReschedule]);

  useEffect(() => {
    if (!form.branch) {
      setServices([]);
      return;
    }
    setServicesLoading(true);
    if (!form.isReschedule)
      setForm((f) => ({
        ...f,
        selectedServices: [],
        providers: [],
        activeCategoryCode: "",
        activeSubCat2: "",
        activeSubCat3: "",
        activeSubCat4: "",
        subClients: f.subClients.map((sc) => ({
          ...sc,
          selectedServices: [],
          providers: [],
          activeCategoryCode: "",
          activeSubCat2: "",
          activeSubCat3: "",
          activeSubCat4: "",
        })),
      }));
    fetch(
      `/api/appointmentform?type=services&locCode=${encodeURIComponent(form.branch)}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setServices(j.data);
          if (j.data.length > 0 && !form.activeCategoryCode)
            setForm((f) => ({
              ...f,
              activeCategoryCode: j.data[0].category1?.trim() || "",
            }));
        }
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.branch]);

  useEffect(() => {
    if (
      activeTab !== "main" &&
      !form.subClients.find((sc) => sc.id === activeTab)
    )
      setActiveTab("main");
  }, [form.subClients, activeTab]);

  const isMain = activeTab === "main";
  const activeSub = form.subClients.find((sc) => sc.id === activeTab) ?? null;
  const tabCat1 = isMain
    ? form.activeCategoryCode
    : (activeSub?.activeCategoryCode ?? "");
  const tabCat2 = isMain
    ? form.activeSubCat2
    : (activeSub?.activeSubCat2 ?? "");
  const tabCat3 = isMain
    ? form.activeSubCat3
    : (activeSub?.activeSubCat3 ?? "");
  const tabCat4 = isMain
    ? form.activeSubCat4
    : (activeSub?.activeSubCat4 ?? "");
  const tabSelSvcs = isMain
    ? form.selectedServices
    : (activeSub?.selectedServices ?? []);
  const tabTimeSlot = isMain ? form.timeSlot : (activeSub?.timeSlot ?? "");
  const mainSelCats = [
    ...new Set(
      services
        .filter((s) => form.selectedServices.includes(s.itemCode))
        .map((s) => s.category1?.trim()),
    ),
  ].filter(Boolean) as string[];
  const tabServiceCategories = [
    ...new Set(
      services
        .filter((service) => tabSelSvcs.includes(service.itemCode))
        .map((service) => service.category1?.trim())
        .filter(Boolean),
    ),
  ] as string[];
  const rescheduleCategories =
    rescheduleBooking?.categoryCodes?.filter(Boolean) || [];
  const tabAvailabilityCategories = form.isReschedule
    ? rescheduleCategories.length > 0
      ? rescheduleCategories
      : ["__BOOKING__"]
    : tabServiceCategories;
  const tabSelectedProviders = isMain
    ? form.providers
    : (activeSub?.providers ?? []);
  const availabilityRequirements: AvailabilityRequirement[] = [
    {
      id: "main",
      timeSlot: form.timeSlot,
      categories: form.isReschedule
        ? rescheduleCategories.length > 0
          ? rescheduleCategories
          : ["__BOOKING__"]
        : services
            .filter((service) =>
              form.selectedServices.includes(service.itemCode),
            )
            .map((service) => service.category1?.trim())
            .filter((category): category is string => Boolean(category)),
      selectedProviders: form.providers,
      preferredTechID: form.isReschedule ? "" : form.prefilledTechID,
    },
    ...form.subClients.map((subClient) => ({
      id: subClient.id,
      timeSlot: subClient.timeSlot,
      categories: services
        .filter((service) =>
          subClient.selectedServices.includes(service.itemCode),
        )
        .map((service) => service.category1?.trim())
        .filter((category): category is string => Boolean(category)),
      selectedProviders: subClient.providers,
      preferredTechID: "",
    })),
  ];
  const additionalAvailabilityRequirements = availabilityRequirements.filter(
    (requirement) => requirement.id !== activeTab,
  );
  const tabAvailabilityStatus =
    tabAvailabilityCategories.length === 0
      ? "idle"
      : availabilityStatus === "ready" && techniciansLoading
        ? "loading"
        : availabilityStatus;
  const tabAvailability = useMemo(() => {
    if (
      tabAvailabilityCategories.length === 0 ||
      tabAvailabilityStatus !== "ready"
    ) {
      return undefined;
    }

    return Object.fromEntries(
      ALL_TIME_SLOTS.map((slot) => [
        slot,
        calculateSlotAvailability({
          slot,
          categories: tabAvailabilityCategories,
          selectedProviders: tabSelectedProviders,
          preferredTechID: form.isReschedule ? "" : form.prefilledTechID,
          branch: form.branch,
          technicians,
          appointments: existingAppointments,
          currentBookingID: form.isReschedule ? form.bookingID : "",
          additionalRequirements: additionalAvailabilityRequirements,
        }),
      ]),
    ) as Record<string, boolean>;
  }, [
    tabAvailabilityCategories,
    tabAvailabilityStatus,
    tabSelectedProviders,
    form.prefilledTechID,
    form.branch,
    form.isReschedule,
    form.bookingID,
    technicians,
    existingAppointments,
    additionalAvailabilityRequirements,
  ]);
  const mainTotal = services
    .filter((s) => form.selectedServices.includes(s.itemCode))
    .reduce((a, s) => a + s.price, 0);
  const subTotalAll = form.subClients.reduce(
    (a, sc) =>
      a +
      services
        .filter((s) => sc.selectedServices.includes(s.itemCode))
        .reduce((b, s) => b + s.price, 0),
    0,
  );
  const grandTotal = mainTotal + subTotalAll;
  const charLeft = MAX_CHARS - form.specialRequest.length;
  const charColor =
    charLeft < 30 ? "#e53e3e" : charLeft < 60 ? "#f59e0b" : "#9ca3af";

  function setF<K extends keyof BookingFormData>(k: K, v: BookingFormData[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function clrErr(k: keyof FieldErrors) {
    setErrors((e) => ({ ...e, [k]: undefined }));
  }
  function handleMainCat1(c: string) {
    setForm((f) => ({
      ...f,
      activeCategoryCode: c,
      activeSubCat2: "",
      activeSubCat3: "",
      activeSubCat4: "",
    }));
  }
  function handleMainCat2(c: string) {
    setForm((f) => ({
      ...f,
      activeSubCat2: c,
      activeSubCat3: "",
      activeSubCat4: "",
    }));
  }
  function handleMainCat3(c: string) {
    setForm((f) => ({ ...f, activeSubCat3: c, activeSubCat4: "" }));
  }
  function handleMainCat4(c: string) {
    setForm((f) => ({ ...f, activeSubCat4: c }));
  }
  function updateSub(id: string, updated: SubClient) {
    setForm((f) => ({
      ...f,
      subClients: f.subClients.map((sc) => (sc.id === id ? updated : sc)),
    }));
  }
  function handleSubCat(id: string, key: keyof SubClient, val: string) {
    const sc = form.subClients.find((x) => x.id === id);
    if (!sc) return;
    const updates: Partial<SubClient> = { [key]: val };
    if (key === "activeCategoryCode") {
      updates.activeSubCat2 = "";
      updates.activeSubCat3 = "";
      updates.activeSubCat4 = "";
    } else if (key === "activeSubCat2") {
      updates.activeSubCat3 = "";
      updates.activeSubCat4 = "";
    } else if (key === "activeSubCat3") updates.activeSubCat4 = "";
    updateSub(id, { ...sc, ...updates });
  }

  function handleTabToggleSvc(itemCode: string) {
    if (isMain) {
      const next = form.selectedServices.includes(itemCode)
        ? form.selectedServices.filter((x) => x !== itemCode)
        : [...form.selectedServices, itemCode];
      setForm((f) => ({ ...f, selectedServices: next }));
      clrErr("selectedServices");
    } else if (activeSub) {
      const next = activeSub.selectedServices.includes(itemCode)
        ? activeSub.selectedServices.filter((x) => x !== itemCode)
        : [...activeSub.selectedServices, itemCode];
      updateSub(activeSub.id, { ...activeSub, selectedServices: next });
    }
  }
  function handleTabTimeSlot(slot: string) {
    if (isMain) {
      setF("timeSlot", slot);
      if (slot) clrErr("timeSlot");
    } else if (activeSub)
      updateSub(activeSub.id, { ...activeSub, timeSlot: slot });
  }
  function handleProviderChange(providers: GuestProvider[]) {
    if (isMain) setF("providers", providers);
    else if (activeSub) updateSub(activeSub.id, { ...activeSub, providers });
  }
  function addSub() {
    const idx = form.subClients.length + 1;
    const firstCat = services[0]?.category1?.trim() || "";
    setForm((f) => ({
      ...f,
      subClients: [
        ...f.subClients,
        {
          id: genId(),
          guessID: genGuessID(idx),
          label: `Person ${idx}`,
          gender: "",
          selectedServices: [],
          timeSlot: "",
          activeCategoryCode: firstCat,
          activeSubCat2: "",
          activeSubCat3: "",
          activeSubCat4: "",
          providers: [],
        },
      ],
    }));
  }
  function removeSub(id: string) {
    setForm((f) => {
      const next = f.subClients.filter((sc) => sc.id !== id);
      return {
        ...f,
        subClients: next.map((sc, i) => ({
          ...sc,
          label: `Person ${i + 1}`,
          guessID: genGuessID(i + 1),
        })),
      };
    });
  }
  function subGender(id: string, gender: string) {
    const sc = form.subClients.find((x) => x.id === id);
    if (sc) updateSub(id, { ...sc, gender });
  }
  function handleCustomerSelect(c: CustomerSuggestion) {
    setForm((f) => ({
      ...f,
      phoneNumber: normalizeSriLankanPhone(c.regTel.trim()),
      fullName: c.cusName.trim(),
      emailAddress: c.cusEmail?.trim() || "",
      gender: c.gender ?? "",
    }));
    clrErr("phoneNumber");
    clrErr("fullName");

    // Blacklisted customers ARE returned by the lookup now (with a flag) so
    // the receptionist sees a warning instead of a silent "not found" that
    // would let the booking proceed with a fresh CUS code.
    if (c.blacklisted) {
      setBlacklistWarning(
        `This phone number belongs to a BLACKLISTED customer (${c.cusCode}).${
          c.blackListRemarks ? ` Reason: ${c.blackListRemarks}` : ""
        } Booking is not allowed.`,
      );
    } else {
      setBlacklistWarning(null);
    }
  }

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!form.branch) e.branch = "Please select a branch.";
    if (!form.fullName.trim()) e.fullName = "Full name is required.";
    if (!form.phoneNumber.trim()) e.phoneNumber = "Phone number is required.";
    if (blacklistWarning)
      e.phoneNumber =
        "This customer is blacklisted — booking is not allowed.";
    if (!form.isReschedule && form.selectedServices.length === 0)
      e.selectedServices = "Select at least one service.";
    if (!form.date) e.date = "Please select an appointment date.";
    if (!form.timeSlot) e.timeSlot = "Please select a time slot.";
    return e;
  }
  function handleReviewClick() {
    setSubmitted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        document
          .querySelector(
            ".inp.err,.date-wrap.err,.branch-btn.err-b,.svc-card.err-s",
          )
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setShowPreview(true);
  }

  async function handleFinalSubmit() {
    setIsLoading(true);
    try {
      const resolvedPrefilledTechID = resolveTechnicianId(
        form.prefilledTechID,
        technicians,
      );

      if (form.isReschedule) {
        const res = await fetch("/api/appointments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingID: form.bookingID,
            locCode: form.locCode || form.branch,
            date: form.date,
            timeSlot: form.timeSlot,
            ...(resolvedPrefilledTechID
              ? { techID: resolvedPrefilledTechID }
              : {}),
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Reschedule failed");
        setRefNumber(form.bookingID);
      } else {
        const payload = {
          locCode: form.branch,
          regTel: form.phoneNumber.trim(),
          cusName: form.fullName.trim(),
          cusEmail: form.emailAddress?.trim() || undefined,
          gender: form.gender || undefined,
          bookingTypeID: "WALKIN",
          status: "PENDING",
          confirmationType: "WI",
          remarks: form.specialRequest || undefined,
          appointmentDate: form.date,
          guests: [
            {
              guessID: "MAIN",
              label: "Main Client",
              gender: form.gender,
              timeSlot: form.timeSlot,
              services: services
                .filter((s) => form.selectedServices.includes(s.itemCode))
                .map((s) => ({
                  serviceItemID: s.itemCode,
                  qty: 1,
                  itemPrice: s.price,
                  techID:
                    form.providers.find(
                      (gp) =>
                        gp.guessID === "MAIN" &&
                        s.category1?.trim() === gp.categoryCode,
                    )?.techID ||
                    resolvedPrefilledTechID ||
                    "0",
                })),
            },
            ...form.subClients.map((sc) => ({
              guessID: sc.guessID,
              label: sc.label,
              gender: sc.gender,
              timeSlot: sc.timeSlot,
              services: services
                .filter((s) => sc.selectedServices.includes(s.itemCode))
                .map((s) => ({
                  serviceItemID: s.itemCode,
                  qty: 1,
                  itemPrice: s.price,
                  techID:
                    sc.providers.find(
                      (gp) =>
                        gp.guessID === sc.guessID &&
                        s.category1?.trim() === gp.categoryCode,
                    )?.techID || "0",
                })),
            })),
          ],
        };
        const res = await fetch("/api/appointmentform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "Booking failed");
        setRefNumber(json.data.refNumber ?? json.data.bookingID);
      }
      setShowPreview(false);
      setShowSuccess(true);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setBlacklistWarning(null);
    setForm({
      branch: "",
      fullName: "",
      phoneNumber: "",
      emailAddress: "",
      gender: "",
      activeCategoryCode: "",
      activeSubCat2: "",
      activeSubCat3: "",
      activeSubCat4: "",
      selectedServices: [],
      providers: [],
      date: "",
      timeSlot: "",
      specialRequest: "",
      subClients: [],
      isReschedule: false,
      bookingID: "",
      locCode: "",
      prefilledTechID: "",
      prefilledTechName: "",
    });
    setErrors({});
    setSubmitted(false);
    setActiveTab("main");
    setServices([]);
  }

  const PAGE = "#c2d4d4";
  const HDR = "#dae6e6";
  const currentMinDate = new Date().toISOString().split("T")[0];

  return (
    <>
      <style>{CSS}</style>
      {showPreview && (
        <ConfirmModal
          form={form}
          services={services}
          grandTotal={grandTotal}
          isLoading={isLoading}
          onConfirm={handleFinalSubmit}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showSuccess && (
        <SuccessModal
          refNumber={refNumber}
          form={form}
          grandTotal={grandTotal}
          isReschedule={form.isReschedule}
          onClose={() => {
            setShowSuccess(false);
            resetForm();
            router.push("/appointment");
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          height: "100vh",
          overflow: "hidden",
          background: PAGE,
        }}
      >
        <AdminSidebar
          active={navKey}
          onNav={(key, path) => {
            setNavKey(key);
            router.push(path);
          }}
          onLogout={() => router.push("/admin/login")}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              background: HDR,
              height: 56,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              padding: "0 18px",
              gap: 12,
              borderBottom: "1px solid rgba(0,0,0,.06)",
              zIndex: 10,
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <span
                style={{
                  position: "absolute",
                  left: 11,
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  pointerEvents: "none",
                  opacity: 0.4,
                }}
              >
                <Ico.Search />
              </span>
              <input
                className="srch"
                placeholder="Search....."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#374151",
                display: "flex",
                alignItems: "center",
                padding: 4,
                borderRadius: 8,
              }}
            >
              <Ico.Bell />
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: "#1f2937" }}>
                MR. SAYO
              </span>
              <Ico.ChevD />
            </div>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#5a8a92,#3a6a72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              S
            </div>
          </header>
          <div
            style={{
              flex: 1,
              display: "flex",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <div
              className="main-body"
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "auto",
                padding: "16px 18px 24px",
              }}
            >
              <div style={{ marginBottom: 20 }}>
                <h1
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: "#1f2937",
                    lineHeight: 1.2,
                  }}
                >
                  {form.isReschedule
                    ? "Reschedule Appointment"
                    : "New Walk-in Booking"}
                </h1>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  {form.isReschedule
                    ? `Updating booking ${form.bookingID} — change the date and time below.`
                    : "Register a new walk-in client and assign services."}
                </p>
              </div>
              {form.isReschedule && (
                <div className="reschedule-banner" style={{ marginBottom: 16 }}>
                  <span style={{ color: "#b45309", flexShrink: 0 }}>
                    <Ico.Reschedule />
                  </span>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#b45309",
                      }}
                    >
                      Reschedule Mode
                    </p>
                    <p style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
                      Booking <strong>{form.bookingID}</strong> for{" "}
                      <strong>{form.fullName}</strong> · Change date &amp; time,
                      then confirm.
                    </p>
                  </div>
                </div>
              )}
              {!form.isReschedule && form.prefilledTechName && (
                <div
                  className="tech-prefill-badge"
                  style={{ marginBottom: 16 }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg,#1e3a40,#2a5260)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {form.prefilledTechName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
                      Pre-assigned Technician
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#15803d",
                      }}
                    >
                      {form.prefilledTechName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        prefilledTechID: "",
                        prefilledTechName: "",
                      }))
                    }
                    style={{
                      background: "rgba(239,68,68,.1)",
                      border: "1px solid rgba(239,68,68,.2)",
                      borderRadius: 7,
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#dc2626",
                      cursor: "pointer",
                      fontFamily: "'Inter',sans-serif",
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <FormCard step={1} icon={<Ico.MapPin />} title="Select Branch">
                  {branchesLoading ? (
                    <div style={{ display: "flex", gap: 10 }}>
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="skeleton sk-btn"
                          style={{ flex: 1 }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="branch-row"
                      style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                    >
                      {branches.map((b, idx) => (
                        <button
                          type="button"
                          key={`${b.LocCode}-${idx}`}
                          className={`branch-btn ${form.branch === b.LocCode ? "sel-b" : ""} ${submitted && errors.branch && !form.branch ? "err-b" : ""}`}
                          onClick={() => {
                            setF(
                              "branch",
                              form.branch === b.LocCode ? "" : b.LocCode,
                            );
                            clrErr("branch");
                          }}
                        >
                          <div>
                            <p
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#1f2937",
                              }}
                            >
                              {b.LocDes}
                            </p>
                            {b.Address?.trim() && b.Address.trim() !== " " && (
                              <p
                                style={{
                                  fontSize: 10,
                                  color: "#6b7280",
                                  marginTop: 1,
                                }}
                              >
                                {b.Address.trim()}
                              </p>
                            )}
                          </div>
                          <div
                            className={`b-radio ${form.branch === b.LocCode ? "on" : ""}`}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  <ErrMsg msg={errors.branch} />
                </FormCard>
                <FormCard step={2} icon={<Ico.Person />} title="Client Details">
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 13,
                    }}
                  >
                    <div
                      className="two-inp"
                      style={{ display: "flex", gap: 13 }}
                    >
                      <div style={{ flex: 1 }}>
                        <label className="lbl">
                          Phone Number <span className="req">*</span>
                          <span
                            style={{
                              fontSize: 10,
                              color: "#9ca3af",
                              textTransform: "none",
                              letterSpacing: 0,
                              fontWeight: 500,
                              marginLeft: 4,
                            }}
                          >
                            (auto-fills known customers)
                          </span>
                        </label>
                        <PhoneField
                          value={form.phoneNumber}
                          onChange={(v) => {
                            setF("phoneNumber", v);
                            clrErr("phoneNumber");
                            setBlacklistWarning(null);
                          }}
                          onSelect={handleCustomerSelect}
                          hasError={submitted && !!errors.phoneNumber}
                        />
                        <ErrMsg msg={errors.phoneNumber} />
                        {blacklistWarning && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "10px 12px",
                              borderRadius: 8,
                              background: "#fef2f2",
                              border: "1.5px solid #fca5a5",
                              color: "#991b1b",
                              fontSize: 12,
                              fontWeight: 600,
                              lineHeight: 1.5,
                              display: "flex",
                              gap: 8,
                              alignItems: "flex-start",
                            }}
                          >
                            <span style={{ fontSize: 15 }}>⛔</span>
                            <span>{blacklistWarning}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="lbl">
                          Full Name <span className="req">*</span>
                        </label>
                        <input
                          className={`inp ${submitted && errors.fullName ? "err" : ""}`}
                          placeholder="Enter full name"
                          value={form.fullName}
                          onChange={(e) => {
                            setF("fullName", e.target.value);
                            clrErr("fullName");
                          }}
                        />
                        <ErrMsg msg={errors.fullName} />
                      </div>
                    </div>
                    <div
                      className="two-inp"
                      style={{ display: "flex", gap: 13 }}
                    >
                      <div style={{ flex: 1 }}>
                        <label className="lbl">Email Address</label>
                        <input
                          className="inp"
                          placeholder="email@example.com"
                          value={form.emailAddress}
                          onChange={(e) => setF("emailAddress", e.target.value)}
                        />
                        {form.emailAddress && form.isReschedule && (
                          <p
                            style={{
                              fontSize: 10,
                              color: "#6b7280",
                              marginTop: 3,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span style={{ color: "#22c55e" }}>✓</span>
                            Pre-filled from existing booking
                          </p>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="lbl">Gender</label>
                        <select
                          className="sel"
                          value={form.gender}
                          onChange={(e) => setF("gender", e.target.value)}
                        >
                          <option value="">Select Gender</option>
                          <option>Female</option>
                          <option>Male</option>
                          <option>Prefer not to say</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </FormCard>
                {!form.isReschedule && (
                  <>
                    <FormCard
                      step={3}
                      icon={<Ico.Users />}
                      title="Additional Persons"
                    >
                      <div className="info-box" style={{ marginBottom: 14 }}>
                        <span
                          style={{ flexShrink: 0, marginTop: 1, opacity: 0.7 }}
                        >
                          <Ico.Info />
                        </span>
                        <p
                          style={{
                            fontSize: 12,
                            color: "#4b5563",
                            lineHeight: 1.55,
                          }}
                        >
                          Add companions joining the main client.
                        </p>
                      </div>
                      {form.subClients.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                            marginBottom: 12,
                          }}
                        >
                          {form.subClients.map((sc, i) => (
                            <div key={sc.id} className="person-row">
                              <div className="p-av">{i + 1}</div>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "#1e3a40",
                                  minWidth: 58,
                                  flexShrink: 0,
                                }}
                              >
                                {sc.label}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <GenderPills
                                  value={sc.gender}
                                  onChange={(g) => subGender(sc.id, g)}
                                />
                              </div>
                              {sc.selectedServices.length > 0 && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: "rgba(30,58,64,.1)",
                                    color: "#1e3a40",
                                    borderRadius: 20,
                                    padding: "3px 8px",
                                    whiteSpace: "nowrap",
                                    flexShrink: 0,
                                  }}
                                >
                                  {sc.selectedServices.length} svc
                                  {sc.selectedServices.length > 1 ? "s" : ""}
                                </span>
                              )}
                              {sc.timeSlot && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: "#d1fae5",
                                    color: "#065f46",
                                    borderRadius: 20,
                                    padding: "3px 8px",
                                    whiteSpace: "nowrap",
                                    flexShrink: 0,
                                  }}
                                >
                                  ⏰ {sc.timeSlot}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeSub(sc.id)}
                                style={{
                                  background: "rgba(229,62,62,.1)",
                                  border: "none",
                                  borderRadius: 7,
                                  padding: "6px 7px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  color: "#e53e3e",
                                  flexShrink: 0,
                                }}
                              >
                                <Ico.Trash />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className="add-btn"
                        onClick={addSub}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "#1e3a40",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Ico.Plus />
                        </div>
                        Add Another Person
                        {form.subClients.length > 0 && (
                          <span
                            style={{
                              marginLeft: "auto",
                              background: "rgba(30,58,64,.12)",
                              borderRadius: 20,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#1e3a40",
                            }}
                          >
                            {form.subClients.length} added
                          </span>
                        )}
                      </button>
                    </FormCard>
                    <FormCard step={4} icon={<Ico.Scissors />} title="Services">
                      <div style={{ marginBottom: 18 }}>
                        <label className="lbl" style={{ marginBottom: 8 }}>
                          Select Client
                        </label>
                        <div className="cli-bar">
                          <button
                            type="button"
                            className={`cli-tab ${activeTab === "main" ? "active" : ""}`}
                            onClick={() => setActiveTab("main")}
                          >
                            {form.selectedServices.length > 0 && (
                              <span className="cli-dot" />
                            )}
                            <Ico.Person /> Main Client
                            {form.selectedServices.length > 0 && (
                              <span className="cli-badge">
                                {form.selectedServices.length}
                              </span>
                            )}
                          </button>
                          {form.subClients.map((sc) => (
                            <button
                              type="button"
                              key={sc.id}
                              className={`cli-tab ${activeTab === sc.id ? "active" : ""}`}
                              onClick={() => setActiveTab(sc.id)}
                            >
                              {sc.selectedServices.length > 0 && (
                                <span className="cli-dot" />
                              )}
                              {sc.gender === "Female" && <Ico.Female />}
                              {sc.gender === "Male" && <Ico.Male />}
                              {sc.label}
                              {sc.selectedServices.length > 0 && (
                                <span className="cli-badge">
                                  {sc.selectedServices.length}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                      {servicesLoading ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill,minmax(190px,1fr))",
                            gap: 9,
                          }}
                        >
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="skeleton sk-svc" />
                          ))}
                        </div>
                      ) : !form.branch ? (
                        <div className="info-box">
                          <span
                            style={{
                              flexShrink: 0,
                              marginTop: 1,
                              opacity: 0.7,
                            }}
                          >
                            <Ico.Info />
                          </span>
                          <p style={{ fontSize: 12, color: "#4b5563" }}>
                            Select a <strong>branch</strong> first to load
                            services.
                          </p>
                        </div>
                      ) : (
                        <div className="tab-in" key={activeTab}>
                          {isMain ? (
                            <CategoryPanel
                              services={services}
                              selectedServices={form.selectedServices}
                              activeCat1={form.activeCategoryCode}
                              activeCat2={form.activeSubCat2}
                              activeCat3={form.activeSubCat3}
                              activeCat4={form.activeSubCat4}
                              onCat1Change={handleMainCat1}
                              onCat2Change={handleMainCat2}
                              onCat3Change={handleMainCat3}
                              onCat4Change={handleMainCat4}
                              onToggleService={handleTabToggleSvc}
                              hasError={
                                submitted && form.selectedServices.length === 0
                              }
                              isMain
                              submitted={submitted}
                              errorMsg={errors.selectedServices}
                            />
                          ) : (
                            activeSub && (
                              <CategoryPanel
                                services={services}
                                selectedServices={activeSub.selectedServices}
                                activeCat1={activeSub.activeCategoryCode}
                                activeCat2={activeSub.activeSubCat2}
                                activeCat3={activeSub.activeSubCat3}
                                activeCat4={activeSub.activeSubCat4}
                                onCat1Change={(c) =>
                                  handleSubCat(
                                    activeSub.id,
                                    "activeCategoryCode",
                                    c,
                                  )
                                }
                                onCat2Change={(c) =>
                                  handleSubCat(activeSub.id, "activeSubCat2", c)
                                }
                                onCat3Change={(c) =>
                                  handleSubCat(activeSub.id, "activeSubCat3", c)
                                }
                                onCat4Change={(c) =>
                                  handleSubCat(activeSub.id, "activeSubCat4", c)
                                }
                                onToggleService={handleTabToggleSvc}
                              />
                            )
                          )}
                        </div>
                      )}
                    </FormCard>
                    {(mainSelCats.length > 0 ||
                      form.subClients.some(
                        (sc) => sc.selectedServices.length > 0,
                      )) && (
                      <FormCard
                        step={5}
                        icon={<Ico.Prov />}
                        title="Assign Technicians"
                      >
                        <div className="info-box" style={{ marginBottom: 16 }}>
                          <span
                            style={{
                              flexShrink: 0,
                              marginTop: 1,
                              opacity: 0.7,
                            }}
                          >
                            <Ico.Info />
                          </span>
                          <p
                            style={{
                              fontSize: 12,
                              color: "#4b5563",
                              lineHeight: 1.55,
                            }}
                          >
                            Assign one technician per service category.
                            {techniciansLoading && (
                              <em> Loading technicians...</em>
                            )}
                          </p>
                        </div>
                        <div className="cli-bar" style={{ marginBottom: 16 }}>
                          {mainSelCats.length > 0 && (
                            <button
                              type="button"
                              className={`cli-tab ${activeTab === "main" ? "active" : ""}`}
                              onClick={() => setActiveTab("main")}
                            >
                              <Ico.Person /> Main Client
                              {form.providers.length > 0 && (
                                <span className="cli-badge">
                                  {form.providers.length}
                                </span>
                              )}
                            </button>
                          )}
                          {form.subClients
                            .filter((sc) => sc.selectedServices.length > 0)
                            .map((sc) => (
                              <button
                                type="button"
                                key={sc.id}
                                className={`cli-tab ${activeTab === sc.id ? "active" : ""}`}
                                onClick={() => setActiveTab(sc.id)}
                              >
                                {sc.gender === "Female" && <Ico.Female />}
                                {sc.gender === "Male" && <Ico.Male />}
                                {sc.label}
                                {sc.providers.length > 0 && (
                                  <span className="cli-badge">
                                    {sc.providers.length}
                                  </span>
                                )}
                              </button>
                            ))}
                        </div>
                        <div className="tab-in" key={`${activeTab}-prov`}>
                          {isMain && mainSelCats.length > 0 && (
                            <ProviderPicker
                              guessID="MAIN"
                              label="Main Client"
                              categories={mainSelCats}
                              branch={form.branch}
                              selectedProviders={form.providers}
                              onChange={handleProviderChange}
                              technicians={technicians}
                              services={services}
                            />
                          )}
                          {!isMain &&
                            activeSub &&
                            activeSub.selectedServices.length > 0 && (
                              <ProviderPicker
                                guessID={activeSub.guessID}
                                label={activeSub.label}
                                categories={
                                  [
                                    ...new Set(
                                      services
                                        .filter((s) =>
                                          activeSub.selectedServices.includes(
                                            s.itemCode,
                                          ),
                                        )
                                        .map((s) => s.category1?.trim())
                                        .filter(Boolean),
                                    ),
                                  ] as string[]
                                }
                                branch={form.branch}
                                selectedProviders={activeSub.providers}
                                onChange={(ps) =>
                                  updateSub(activeSub.id, {
                                    ...activeSub,
                                    providers: ps,
                                  })
                                }
                                technicians={technicians}
                                services={services}
                              />
                            )}
                        </div>
                      </FormCard>
                    )}
                  </>
                )}
                <FormCard
                  step={form.isReschedule ? 3 : 6}
                  icon={<Ico.Cal />}
                  title="Appointment Date & Time"
                >
                  <div style={{ marginBottom: 22 }}>
                    <label className="lbl">
                      Select Date <span className="req">*</span>
                    </label>
                    <DatePicker
                      value={form.date}
                      minDate={currentMinDate}
                      hasError={submitted && !!errors.date}
                      onChange={(v) => {
                        setForm((f) => ({
                          ...f,
                          date: v,
                          timeSlot: "",
                          subClients: f.subClients.map((sc) => ({
                            ...sc,
                            timeSlot: "",
                          })),
                        }));
                        clrErr("date");
                        clrErr("timeSlot");
                      }}
                    />
                    <ErrMsg msg={errors.date} />
                  </div>
                  <div>
                    <label className="lbl" style={{ marginBottom: 10 }}>
                      Time Slots <span className="req">*</span>
                    </label>
                    {!form.isReschedule && (
                      <div className="cli-bar" style={{ marginBottom: 16 }}>
                        <button
                          type="button"
                          className={`cli-tab ${activeTab === "main" ? "active" : ""}`}
                          onClick={() => setActiveTab("main")}
                        >
                          {form.timeSlot && <span className="cli-dot" />}
                          <Ico.Person /> Main Client
                          {form.timeSlot && (
                            <span className="cli-badge">✓</span>
                          )}
                        </button>
                        {form.subClients.map((sc) => (
                          <button
                            type="button"
                            key={sc.id}
                            className={`cli-tab ${activeTab === sc.id ? "active" : ""}`}
                            onClick={() => setActiveTab(sc.id)}
                          >
                            {sc.timeSlot && <span className="cli-dot" />}
                            {sc.gender === "Female" && <Ico.Female />}
                            {sc.gender === "Male" && <Ico.Male />}
                            {sc.label}
                            {sc.timeSlot && (
                              <span className="cli-badge">✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {!form.date ? (
                      <div
                        style={{
                          background: "#d4e8ea",
                          borderRadius: 9,
                          padding: 16,
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                        }}
                      >
                        <span style={{ opacity: 0.5 }}>
                          <Ico.Cal />
                        </span>
                        <p
                          style={{
                            fontSize: 13,
                            color: "rgba(0,0,0,.4)",
                            fontStyle: "italic",
                          }}
                        >
                          Select a date above to unlock time slots.
                        </p>
                      </div>
                    ) : (
                      <div className="tab-in" key={`${activeTab}-ts`}>
                        <TimeSlotPicker
                          key={activeTab}
                          selectedSlot={tabTimeSlot}
                          onSelect={handleTabTimeSlot}
                          hasError={
                            isMain &&
                            submitted &&
                            !!errors.timeSlot &&
                            !form.timeSlot
                          }
                          clientLabel={
                            isMain ? "Main Client" : (activeSub?.label ?? "")
                          }
                          availability={tabAvailability}
                          availabilityStatus={tabAvailabilityStatus}
                        />
                        {isMain && <ErrMsg msg={errors.timeSlot} />}
                      </div>
                    )}
                  </div>
                </FormCard>
                <FormCard
                  step={form.isReschedule ? 4 : 7}
                  icon={<Ico.Note />}
                  title="Special Request"
                >
                  <textarea
                    className="ta"
                    placeholder="Any special requests or notes..."
                    value={form.specialRequest}
                    maxLength={MAX_CHARS}
                    rows={4}
                    onChange={(e) => setF("specialRequest", e.target.value)}
                  />
                  <p className="char-ct" style={{ color: charColor }}>
                    {form.specialRequest.length} / {MAX_CHARS}
                  </p>
                </FormCard>
                <div className="mob-sum" style={{ display: "none" }}>
                  <BookingSummary form={form} services={services} />
                  <button
                    type="button"
                    className="confirm-btn"
                    onClick={handleReviewClick}
                  >
                    <Ico.Eye />
                    {form.isReschedule
                      ? "Review Reschedule"
                      : `Review & Confirm${grandTotal > 0 ? ` · LKR ${grandTotal.toLocaleString()}` : ""}`}
                  </button>
                </div>
              </div>
            </div>
            <div
              className="sum-col"
              style={{
                width: 296,
                flexShrink: 0,
                padding: "16px 18px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                overflow: "hidden",
              }}
            >
              <BookingSummary form={form} services={services} />
              <button
                type="button"
                className="confirm-btn"
                onClick={handleReviewClick}
              >
                <Ico.Eye />
                {form.isReschedule
                  ? "Review Reschedule"
                  : `Review & Confirm${grandTotal > 0 ? ` · LKR ${grandTotal.toLocaleString()}` : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function WalkInPageWrapper() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "#6b7280",
            fontFamily: "'Inter',sans-serif",
          }}
        >
          Loading…
        </div>
      }
    >
      <WalkInPage />
    </Suspense>
  );
}
