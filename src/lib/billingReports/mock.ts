import type { CreditTxn, MockBill, MockLocation, MockPayMode } from "./types";
import { inRange } from "./dates";
import { round2 } from "./format";

export const MOCK_LOCATIONS: MockLocation[] = [
  { locCode: "COL", locName: "Colombo — Bambalapitiya" },
  { locCode: "KDY", locName: "Kandy — Peradeniya" },
];

export const MOCK_PAY_MODES: MockPayMode[] = [
  { payCode: "CASH", payDes: "Cash" },
  { payCode: "CARD", payDes: "Card" },
  { payCode: "VISA", payDes: "Visa" },
  { payCode: "CREDIT", payDes: "Credit" },
  { payCode: "VOUCH", payDes: "Voucher" },
];

function loc(code: string): MockLocation {
  return MOCK_LOCATIONS.find((l) => l.locCode === code) || MOCK_LOCATIONS[0];
}

function bill(partial: Omit<MockBill, "locName"> & { locName?: string }): MockBill {
  const L = loc(partial.locCode);
  return { ...partial, locName: L.locName };
}

export const MOCK_BILLS: MockBill[] = [
  bill({
    locCode: "COL",
    billNo: "INV00001201",
    date: "2026-10-03",
    time: "10:15:00AM",
    time24: "10:15",
    cashierId: "U001",
    cashierName: "Nimasha",
    cusId: "C1001",
    cusName: "Anjali Perera",
    pax: 1,
    gross: 8500,
    disPre: 0,
    disVal: 0,
    serviceCharge: 0,
    otherServiceCharge: 0,
    totalTax: 1275,
    advAmount: 0,
    netTotal: 9775,
    items: [
      { itemId: "SRV001", name: "Ladies Hair Cut", catL1: "Hair", catL2: "Cut", qty: 1, price: 3500, total: 3500, techId: "T01", techName: "Sajith" },
      { itemId: "SRV014", name: "Blow Dry", catL1: "Hair", catL2: "Styling", qty: 1, price: 2500, total: 2500, techId: "T01", techName: "Sajith" },
      { itemId: "PRD02", name: "Serum 50ml", catL1: "Retail", catL2: "Hair care", qty: 1, price: 2500, total: 2500, techId: "T01", techName: "Sajith" },
    ],
    payments: [{ payCode: "CASH", payDes: "Cash", amount: 9775, remarks: "" }],
    taxes: [{ taxCode: "VAT", label: "VAT 15%", amount: 1275 }],
  }),
  bill({
    locCode: "COL",
    billNo: "INV00001202",
    date: "2026-10-03",
    time: "11:40:00AM",
    time24: "11:40",
    cashierId: "U001",
    cashierName: "Nimasha",
    cusId: "C1008",
    cusName: "Dilani Fernando",
    pax: 2,
    gross: 18000,
    disPre: 10,
    disVal: 1800,
    serviceCharge: 500,
    otherServiceCharge: 0,
    totalTax: 2430,
    advAmount: 2000,
    netTotal: 17130,
    items: [
      { itemId: "SRV022", name: "Global Colour", catL1: "Hair", catL2: "Colour", qty: 1, price: 12000, total: 12000, techId: "T03", techName: "Ishara" },
      { itemId: "SRV031", name: "Classic Facial", catL1: "Skin", catL2: "Facial", qty: 1, price: 6000, total: 6000, techId: "T04", techName: "Malsha" },
    ],
    payments: [
      { payCode: "CARD", payDes: "Card", amount: 15130, remarks: "" },
      { payCode: "CASH", payDes: "Cash", amount: 2000, remarks: "Advance adjusted" },
    ],
    taxes: [{ taxCode: "VAT", label: "VAT 15%", amount: 2430 }],
  }),
  bill({
    locCode: "COL",
    billNo: "INV00001203",
    date: "2026-10-02",
    time: "2:05:00PM",
    time24: "14:05",
    cashierId: "U002",
    cashierName: "Kasun",
    cusId: "C1022",
    cusName: "Ruwani Silva",
    pax: 1,
    gross: 4500,
    disPre: 0,
    disVal: 0,
    serviceCharge: 0,
    otherServiceCharge: 0,
    totalTax: 675,
    advAmount: 0,
    netTotal: 5175,
    items: [
      { itemId: "SRV041", name: "Manicure", catL1: "Nails", catL2: "Hands", qty: 1, price: 2500, total: 2500, techId: "T06", techName: "Tharushi" },
      { itemId: "SRV042", name: "Pedicure", catL1: "Nails", catL2: "Feet", qty: 1, price: 2000, total: 2000, techId: "T06", techName: "Tharushi" },
    ],
    payments: [{ payCode: "VISA", payDes: "Visa", amount: 5175, remarks: "" }],
    taxes: [{ taxCode: "VAT", label: "VAT 15%", amount: 675 }],
  }),
  bill({
    locCode: "COL",
    billNo: "INV00001204",
    date: "2026-10-02",
    time: "4:20:00PM",
    time24: "16:20",
    cashierId: "U002",
    cashierName: "Kasun",
    cusId: "C1040",
    cusName: "Mevan Jayasuriya",
    pax: 1,
    gross: 22000,
    disPre: 0,
    disVal: 0,
    serviceCharge: 800,
    otherServiceCharge: 0,
    totalTax: 3300,
    advAmount: 0,
    netTotal: 26100,
    items: [
      { itemId: "SRV055", name: "Keratin Treatment", catL1: "Hair", catL2: "Treatment", qty: 1, price: 22000, total: 22000, techId: "T03", techName: "Ishara" },
    ],
    payments: [{ payCode: "CREDIT", payDes: "Credit", amount: 26100, remarks: "30-day account" }],
    taxes: [{ taxCode: "VAT", label: "VAT 15%", amount: 3300 }],
  }),
  bill({
    locCode: "COL",
    billNo: "INV00001188",
    date: "2026-09-28",
    time: "9:30:00AM",
    time24: "09:30",
    cashierId: "U001",
    cashierName: "Nimasha",
    cusId: "C1001",
    cusName: "Anjali Perera",
    pax: 1,
    gross: 3000,
    disPre: 0,
    disVal: 0,
    serviceCharge: 0,
    otherServiceCharge: 0,
    totalTax: 450,
    advAmount: 0,
    netTotal: 3450,
    items: [
      { itemId: "SRV060", name: "Threading + Tint", catL1: "Skin", catL2: "Brows", qty: 1, price: 3000, total: 3000, techId: "T04", techName: "Malsha" },
    ],
    payments: [{ payCode: "VOUCH", payDes: "Voucher", amount: 3450, remarks: "Gift voucher" }],
    taxes: [{ taxCode: "VAT", label: "VAT 15%", amount: 450 }],
  }),
  bill({
    locCode: "KDY",
    billNo: "INV00002011",
    date: "2026-10-03",
    time: "12:10:00PM",
    time24: "12:10",
    cashierId: "U010",
    cashierName: "Ishani",
    cusId: "C2004",
    cusName: "Sanduni Bandara",
    pax: 1,
    gross: 7000,
    disPre: 5,
    disVal: 350,
    serviceCharge: 200,
    otherServiceCharge: 0,
    totalTax: 997.5,
    advAmount: 0,
    netTotal: 7847.5,
    items: [
      { itemId: "SRV001", name: "Ladies Hair Cut", catL1: "Hair", catL2: "Cut", qty: 1, price: 3000, total: 3000, techId: "T11", techName: "Chathu" },
      { itemId: "SRV070", name: "Head Massage", catL1: "Spa", catL2: "Massage", qty: 1, price: 4000, total: 4000, techId: "T12", techName: "Nadeesha" },
    ],
    payments: [{ payCode: "CASH", payDes: "Cash", amount: 7847.5, remarks: "" }],
    taxes: [{ taxCode: "VAT", label: "VAT 15%", amount: 997.5 }],
  }),
  bill({
    locCode: "KDY",
    billNo: "INV00002012",
    date: "2026-10-01",
    time: "3:45:00PM",
    time24: "15:45",
    cashierId: "U010",
    cashierName: "Ishani",
    cusId: "C2019",
    cusName: "Harini Wijesinghe",
    pax: 3,
    gross: 15500,
    disPre: 0,
    disVal: 0,
    serviceCharge: 400,
    otherServiceCharge: 100,
    totalTax: 2325,
    advAmount: 0,
    netTotal: 18325,
    items: [
      { itemId: "SRV031", name: "Classic Facial", catL1: "Skin", catL2: "Facial", qty: 2, price: 5500, total: 11000, techId: "T12", techName: "Nadeesha" },
      { itemId: "SRV041", name: "Manicure", catL1: "Nails", catL2: "Hands", qty: 1, price: 2500, total: 2500, techId: "T13", techName: "Piumi" },
      { itemId: "PRD08", name: "Face Mask", catL1: "Retail", catL2: "Skin care", qty: 2, price: 1000, total: 2000, techId: "T12", techName: "Nadeesha" },
    ],
    payments: [
      { payCode: "CARD", payDes: "Card", amount: 10000, remarks: "" },
      { payCode: "CASH", payDes: "Cash", amount: 8325, remarks: "" },
    ],
    taxes: [
      { taxCode: "VAT", label: "VAT 15%", amount: 2175 },
      { taxCode: "NBT", label: "Other tax", amount: 150 },
    ],
  }),
  bill({
    locCode: "KDY",
    billNo: "INV00002005",
    date: "2026-09-30",
    time: "10:00:00AM",
    time24: "10:00",
    cashierId: "U011",
    cashierName: "Ruwan",
    cusId: "C2004",
    cusName: "Sanduni Bandara",
    pax: 1,
    gross: 12000,
    disPre: 0,
    disVal: 0,
    serviceCharge: 0,
    otherServiceCharge: 0,
    totalTax: 1800,
    advAmount: 0,
    netTotal: 13800,
    items: [
      { itemId: "SRV022", name: "Global Colour", catL1: "Hair", catL2: "Colour", qty: 1, price: 12000, total: 12000, techId: "T11", techName: "Chathu" },
    ],
    payments: [{ payCode: "CREDIT", payDes: "Credit", amount: 13800, remarks: "Account" }],
    taxes: [{ taxCode: "VAT", label: "VAT 15%", amount: 1800 }],
  }),
];

export const MOCK_CREDIT: CreditTxn[] = [
  {
    locCode: "COL", locName: loc("COL").locName, cusId: "C1040", cusName: "Mevan Jayasuriya",
    date: "2026-10-02", billNo: "INV00001204", refNo: "CR-1040-1", totalBill: 26100,
    tranAmt: 26100, balance: 26100, remark: "Keratin on account", user: "Kasun", type: "INV",
    invoiceNo: "INV00001204", invoiceDate: "2026-10-02", soldDate: "2026-10-02", prevAmt: 0,
  },
  {
    locCode: "COL", locName: loc("COL").locName, cusId: "C1040", cusName: "Mevan Jayasuriya",
    date: "2026-10-03", billNo: "PAY0000401", refNo: "CR-1040-2", totalBill: 26100,
    tranAmt: -10000, balance: 16100, remark: "Part settlement", user: "Nimasha", type: "PAY",
    invoiceNo: "INV00001204", invoiceDate: "2026-10-02", paidAmt: 10000, balBefore: 26100,
    balAfter: 16100, settlement: "Cash", soldDate: "2026-10-02", prevAmt: 26100,
  },
  {
    locCode: "KDY", locName: loc("KDY").locName, cusId: "C2004", cusName: "Sanduni Bandara",
    date: "2026-09-30", billNo: "INV00002005", refNo: "CR-2004-1", totalBill: 13800,
    tranAmt: 13800, balance: 13800, remark: "Colour on account", user: "Ruwan", type: "INV",
    invoiceNo: "INV00002005", invoiceDate: "2026-09-30", soldDate: "2026-09-30", prevAmt: 0,
  },
  {
    locCode: "KDY", locName: loc("KDY").locName, cusId: "C2004", cusName: "Sanduni Bandara",
    date: "2026-10-01", billNo: "CHG00012", refNo: "CR-2004-2", totalBill: 13800,
    tranAmt: 200, balance: 14000, remark: "Late fee", user: "Ishani", type: "CHG",
    prevAmt: 13800,
  },
  {
    locCode: "KDY", locName: loc("KDY").locName, cusId: "C2004", cusName: "Sanduni Bandara",
    date: "2026-10-03", billNo: "PAY0000410", refNo: "CR-2004-3", totalBill: 14000,
    tranAmt: -14000, balance: 0, remark: "Settled in full", user: "Ishani", type: "PAY",
    invoiceNo: "INV00002005", invoiceDate: "2026-09-30", paidAmt: 14000, balBefore: 14000,
    balAfter: 0, settlement: "Card", soldDate: "2026-09-30", prevAmt: 14000,
  },
];

export const HOUR_SLOTS: { label: string; from: string; to: string }[] = [
  { label: "09:00 - 10:00", from: "09:00", to: "10:00" },
  { label: "10:00 - 11:00", from: "10:00", to: "11:00" },
  { label: "11:00 - 12:00", from: "11:00", to: "12:00" },
  { label: "12:00 - 13:00", from: "12:00", to: "13:00" },
  { label: "13:00 - 14:00", from: "13:00", to: "14:00" },
  { label: "14:00 - 15:00", from: "14:00", to: "15:00" },
  { label: "15:00 - 16:00", from: "15:00", to: "16:00" },
  { label: "16:00 - 17:00", from: "16:00", to: "17:00" },
  { label: "17:00 - 18:00", from: "17:00", to: "18:00" },
];

export function filterBills(from: string, to: string, locCode: string, payMode = ""): MockBill[] {
  return MOCK_BILLS.filter((b) => {
    if (!inRange(b.date, from, to)) return false;
    if (locCode && b.locCode !== locCode) return false;
    if (payMode && !b.payments.some((p) => p.payCode === payMode)) return false;
    return true;
  }).map((b) => {
    if (!payMode) return b;
    const payments = b.payments.filter((p) => p.payCode === payMode);
    const amount = round2(payments.reduce((s, p) => s + p.amount, 0));
    return { ...b, payments, netTotal: amount };
  });
}

export function filterCredit(from: string, to: string, locCode: string): CreditTxn[] {
  return MOCK_CREDIT.filter((r) => {
    if (!inRange(r.date, from, to)) return false;
    if (locCode && r.locCode !== locCode) return false;
    return true;
  });
}

export const MOCK_UNUSED_ITEMS = [
  { itemId: "SRV099", name: "Bridal Trial Makeup", catL1: "Makeup" },
  { itemId: "SRV100", name: "Hot Stone Massage", catL1: "Spa" },
  { itemId: "PRD20", name: "Keratin Kit", catL1: "Retail" },
];

export function slotForTime(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const mins = h * 60 + m;
  const found = HOUR_SLOTS.find((s) => {
    const [fh, fm] = s.from.split(":").map(Number);
    const [th, tm] = s.to.split(":").map(Number);
    const a = fh * 60 + fm;
    const b = th * 60 + tm;
    return mins >= a && mins < b;
  });
  return found?.label || "Other";
}
