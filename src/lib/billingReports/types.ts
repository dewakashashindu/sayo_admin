export type ReportId =
  | "sales-details"
  | "sales-category-summary"
  | "sales-category-detail"
  | "hourly-sales"
  | "sales-summary"
  | "payment-summary"
  | "payment-summary-wise"
  | "payment-bill-paymode-grid"
  | "cashier-collection"
  | "cashier-payment-breakdown"
  | "cashier-breakdown-grid"
  | "service-charge"
  | "tax-vat"
  | "pax-count"
  | "credit-history"
  | "credit-pay-history"
  | "credit-account-detail"
  | "menu-item-issue"
  | "menu-item-issue-date"
  | "item-movement"
  | "transaction-summary";

export type ReportGroupId =
  | "sales"
  | "payments"
  | "cashier"
  | "items"
  | "movement"
  | "txn"
  | "tax"
  | "credit";

export interface ReportDef {
  id: ReportId;
  group: ReportGroupId;
  navLabel: string;
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  extraFilter?: "payMode";
  hasCharts: boolean;
}

export interface MockLocation {
  locCode: string;
  locName: string;
}

export interface MockPayMode {
  payCode: string;
  payDes: string;
}

export interface MockItemLine {
  itemId: string;
  name: string;
  catL1: string;
  catL2: string;
  qty: number;
  price: number;
  total: number;
  techId: string;
  techName: string;
}

export interface MockPayment {
  payCode: string;
  payDes: string;
  amount: number;
  remarks: string;
}

export interface MockTax {
  taxCode: string;
  label: string;
  amount: number;
}

export interface MockBill {
  locCode: string;
  locName: string;
  billNo: string;
  date: string;
  time: string;
  time24: string;
  cashierId: string;
  cashierName: string;
  cusId: string;
  cusName: string;
  pax: number;
  gross: number;
  disPre: number;
  disVal: number;
  serviceCharge: number;
  otherServiceCharge: number;
  totalTax: number;
  advAmount: number;
  netTotal: number;
  items: MockItemLine[];
  payments: MockPayment[];
  taxes: MockTax[];
}

export interface CreditTxn {
  locCode: string;
  locName: string;
  cusId: string;
  cusName: string;
  date: string;
  billNo: string;
  refNo: string;
  totalBill: number;
  tranAmt: number;
  balance: number;
  remark: string;
  user: string;
  type: "INV" | "PAY" | "CHG";
  invoiceNo?: string;
  invoiceDate?: string;
  paidAmt?: number;
  balBefore?: number;
  balAfter?: number;
  settlement?: string;
  soldDate?: string;
  prevAmt?: number;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSpec {
  type: "bars" | "hbars" | "pie";
  title: string;
  series: { name: string; points: ChartPoint[] }[];
}

export interface ReportFilters {
  from: string;
  to: string;
  loc: string;
  pm: string;
  search: string;
}
