// src/lib/technicianSample.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared types + sample data for the "Technician's Appointments" screens.
//
// • SAMPLE_TECHNICIAN_NAME = the demo technician (Amali Fernando).
//   Later, when technician login exists, replace getLoggedInTechnicianName()
//   to read the real logged-in technician (e.g. from localStorage 'technician'
//   or a session) instead of this constant.
// • buildSampleAppointments() is a FALLBACK shown only when the real API
//   (/api/appointments) is unreachable or returns nothing for the technician.
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLE_TECHNICIAN_NAME = "Amali Fernando";

/** Later: return the logged-in technician's display name here. */
export function getLoggedInTechnicianName(): string {
  if (typeof window === "undefined") return SAMPLE_TECHNICIAN_NAME;
  try {
    const raw = window.localStorage.getItem("technician");
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; UserName?: string };
      const name = (parsed?.name || parsed?.UserName || "").trim();
      if (name) return name;
    }
  } catch {
    /* ignore — fall back to sample */
  }
  return SAMPLE_TECHNICIAN_NAME;
}

export interface TechServiceSchedule {
  serviceIndex: number;
  itemCode: string;
  serviceName: string;
  providerName: string;
  startTime: string;
  endTime: string;
}

export interface TechAppointment {
  id: string;
  bookingID: string;
  locCode: string;
  cusCode: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  providerName: string;
  techID: string;
  serviceName: string;
  serviceNames: string[];
  serviceSchedule?: TechServiceSchedule[];
  date: string;
  timeSlot: string;
  status: "confirmed" | "pending" | "cancelled" | "ongoing";
  mode: string;
  location: string;
  duration: number;
  price: number;
  gender: string;
  notes?: string;
  guests: string[];
  techIDs?: string[];
  checkInTime?: string | null;
  txnDateTime: string;
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

export function fmtDateLong(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function fmtDateNav(iso: string): string {
  const dt = new Date(`${iso}T00:00:00`);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[dt.getMonth()]} / ${String(dt.getDate()).padStart(2, "0")} / ${dt.getFullYear()}`;
}

/** Does this appointment belong to the given technician? */
export function isTechnicianAppointment(
  appt: TechAppointment,
  techName: string,
  techUserId?: string,
): boolean {
  const nameKey = techName.trim().toUpperCase();
  if (!nameKey) return false;

  if ((appt.providerName || "").trim().toUpperCase() === nameKey) return true;
  if (
    (appt.serviceSchedule || []).some(
      (s) => (s.providerName || "").trim().toUpperCase() === nameKey,
    )
  )
    return true;

  if (techUserId) {
    const idKey = techUserId.trim().toUpperCase();
    if ((appt.techID || "").trim().toUpperCase() === idKey) return true;
    if (
      (appt.techIDs || []).some((id) => (id || "").trim().toUpperCase() === idKey)
    )
      return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA (fallback / demo for Amali Fernando)
// ─────────────────────────────────────────────────────────────────────────────

export function buildSampleAppointments(): TechAppointment[] {
  const today = todayISO();
  const tomorrow = shiftDate(today, 1);
  const now = new Date().toISOString();

  return [
    {
      id: "B1001",
      bookingID: "B1001",
      locCode: "01",
      cusCode: "C0001",
      clientName: "Sanduni Perera",
      clientPhone: "0771234567",
      clientEmail: "sanduni@example.com",
      providerName: SAMPLE_TECHNICIAN_NAME,
      techID: "T001",
      serviceName: "Classic Facial, Head Massage",
      serviceNames: ["Classic Facial", "Head Massage"],
      serviceSchedule: [
        {
          serviceIndex: 0,
          itemCode: "SVC001",
          serviceName: "Classic Facial",
          providerName: SAMPLE_TECHNICIAN_NAME,
          startTime: "9:00 AM",
          endTime: "9:45 AM",
        },
        {
          serviceIndex: 1,
          itemCode: "SVC002",
          serviceName: "Head Massage",
          providerName: SAMPLE_TECHNICIAN_NAME,
          startTime: "9:45 AM",
          endTime: "10:15 AM",
        },
      ],
      date: today,
      timeSlot: "9:00 AM",
      status: "ongoing",
      mode: "pre_booked",
      location: "01",
      duration: 75,
      price: 4500,
      gender: "Female",
      notes: "Client prefers mild products. Sensitive skin — avoid strong peels.",
      guests: ["MAIN"],
      techIDs: ["T001"],
      checkInTime: now,
      txnDateTime: now,
    },
    {
      id: "B1002",
      bookingID: "B1002",
      locCode: "01",
      cusCode: "C0002",
      clientName: "Ishara Fernando",
      clientPhone: "0719876543",
      clientEmail: "",
      providerName: SAMPLE_TECHNICIAN_NAME,
      techID: "T001",
      serviceName: "Hair Spa",
      serviceNames: ["Hair Spa"],
      serviceSchedule: [
        {
          serviceIndex: 0,
          itemCode: "SVC003",
          serviceName: "Hair Spa",
          providerName: SAMPLE_TECHNICIAN_NAME,
          startTime: "11:30 AM",
          endTime: "12:30 PM",
        },
      ],
      date: today,
      timeSlot: "11:30 AM",
      status: "confirmed",
      mode: "pre_booked",
      location: "01",
      duration: 60,
      price: 3500,
      gender: "Female",
      notes: "",
      guests: ["MAIN"],
      techIDs: ["T001"],
      checkInTime: null,
      txnDateTime: now,
    },
    {
      id: "B1003",
      bookingID: "B1003",
      locCode: "01",
      cusCode: "C0003",
      clientName: "Nimasha Silva",
      clientPhone: "0765551234",
      clientEmail: "nimasha@example.com",
      providerName: SAMPLE_TECHNICIAN_NAME,
      techID: "T001",
      serviceName: "Gel Manicure, Gel Pedicure",
      serviceNames: ["Gel Manicure", "Gel Pedicure"],
      serviceSchedule: [
        {
          serviceIndex: 0,
          itemCode: "SVC004",
          serviceName: "Gel Manicure",
          providerName: SAMPLE_TECHNICIAN_NAME,
          startTime: "2:00 PM",
          endTime: "2:45 PM",
        },
        {
          serviceIndex: 1,
          itemCode: "SVC005",
          serviceName: "Gel Pedicure",
          providerName: SAMPLE_TECHNICIAN_NAME,
          startTime: "2:45 PM",
          endTime: "3:40 PM",
        },
      ],
      date: today,
      timeSlot: "2:00 PM",
      status: "pending",
      mode: "without_confirmation",
      location: "01",
      duration: 100,
      price: 7000,
      gender: "Female",
      notes: "Walk-in client.",
      guests: ["MAIN"],
      techIDs: ["T001"],
      checkInTime: null,
      txnDateTime: now,
    },
    {
      id: "B1004",
      bookingID: "B1004",
      locCode: "01",
      cusCode: "C0004",
      clientName: "Dilani Rathnayake",
      clientPhone: "0772223344",
      clientEmail: "",
      providerName: SAMPLE_TECHNICIAN_NAME,
      techID: "T001",
      serviceName: "Bridal Trial Makeup",
      serviceNames: ["Bridal Trial Makeup"],
      serviceSchedule: [
        {
          serviceIndex: 0,
          itemCode: "SVC006",
          serviceName: "Bridal Trial Makeup",
          providerName: SAMPLE_TECHNICIAN_NAME,
          startTime: "10:00 AM",
          endTime: "11:00 AM",
        },
      ],
      date: tomorrow,
      timeSlot: "10:00 AM",
      status: "confirmed",
      mode: "pre_booked",
      location: "01",
      duration: 60,
      price: 6500,
      gender: "Female",
      notes: "Bring bridal shade card.",
      guests: ["MAIN"],
      techIDs: ["T001"],
      checkInTime: null,
      txnDateTime: now,
    },
    // Belongs to ANOTHER technician — used to prove the filter works.
    // This row must NEVER appear on Amali's screen.
    {
      id: "B2001",
      bookingID: "B2001",
      locCode: "01",
      cusCode: "C0009",
      clientName: "Kamal Perera",
      clientPhone: "0779998888",
      clientEmail: "",
      providerName: "Piumi",
      techID: "T002",
      serviceName: "Haircut – Classic",
      serviceNames: ["Haircut – Classic"],
      serviceSchedule: [
        {
          serviceIndex: 0,
          itemCode: "SVC010",
          serviceName: "Haircut – Classic",
          providerName: "Piumi",
          startTime: "10:00 AM",
          endTime: "10:30 AM",
        },
      ],
      date: today,
      timeSlot: "10:00 AM",
      status: "ongoing",
      mode: "pre_booked",
      location: "01",
      duration: 30,
      price: 1800,
      gender: "Male",
      notes: "",
      guests: ["MAIN"],
      techIDs: ["T002"],
      checkInTime: now,
      txnDateTime: now,
    },
  ];
}

export interface SampleRecipeRow {
  rowItemCode: string;
  rowItemDes: string;
  subUnitID: string;
  qty: number;
  itemCost: number;
}

/** Fallback recipes shown when the real /api/recipes endpoint is unreachable. */
export const SAMPLE_RECIPES: Record<
  string,
  { serviceName: string; rows: SampleRecipeRow[] }
> = {
  SVC001: {
    serviceName: "Classic Facial",
    rows: [
      { rowItemCode: "RM001", rowItemDes: "Facial Cleanser 500ml", subUnitID: "ML", qty: 30, itemCost: 180 },
      { rowItemCode: "RM002", rowItemDes: "Clay Mask Pack", subUnitID: "G", qty: 50, itemCost: 220 },
      { rowItemCode: "RM003", rowItemDes: "Moisturizer Gel", subUnitID: "ML", qty: 15, itemCost: 150 },
    ],
  },
  SVC002: {
    serviceName: "Head Massage",
    rows: [
      { rowItemCode: "RM010", rowItemDes: "Argan Hair Oil 250ml", subUnitID: "ML", qty: 20, itemCost: 260 },
    ],
  },
  SVC003: {
    serviceName: "Hair Spa",
    rows: [
      { rowItemCode: "RM011", rowItemDes: "Keratin Shampoo 1L", subUnitID: "ML", qty: 40, itemCost: 190 },
      { rowItemCode: "RM012", rowItemDes: "Hair Spa Cream", subUnitID: "G", qty: 60, itemCost: 340 },
    ],
  },
  SVC004: {
    serviceName: "Gel Manicure",
    rows: [
      { rowItemCode: "RM020", rowItemDes: "Gel Nail Polish – Nude", subUnitID: "PCS", qty: 1, itemCost: 420 },
      { rowItemCode: "RM021", rowItemDes: "Base & Top Coat Set", subUnitID: "SET", qty: 1, itemCost: 300 },
    ],
  },
  SVC005: {
    serviceName: "Gel Pedicure",
    rows: [
      { rowItemCode: "RM020", rowItemDes: "Gel Nail Polish – Nude", subUnitID: "PCS", qty: 1, itemCost: 420 },
      { rowItemCode: "RM022", rowItemDes: "Foot Scrub 250g", subUnitID: "G", qty: 30, itemCost: 140 },
    ],
  },
  SVC006: {
    serviceName: "Bridal Trial Makeup",
    rows: [
      { rowItemCode: "RM030", rowItemDes: "HD Foundation Kit", subUnitID: "SET", qty: 1, itemCost: 950 },
      { rowItemCode: "RM031", rowItemDes: "False Lashes (Pair)", subUnitID: "PCS", qty: 1, itemCost: 380 },
    ],
  },
};
