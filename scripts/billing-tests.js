// scripts/billing-tests.js
// ─────────────────────────────────────────────────────────────────────────────
// Regression tests for the pure billing logic (no database needed).
//
//   bash scripts/run-billing-tests.sh
//
// It compiles src/lib/itemCode.ts, billingTaxes.ts, billingPayments.ts,
// billingBill.ts, serials.ts, the PO / GRN helpers and the email helpers into
// .tmptest/ and then checks:
//   · item codes: CHAR(15) everywhere, legacy 10-character rows still resolve
//   · the tax worksheet from tbl_taxes   (Gross ▸ Discount ▸ SC ▸ VAT ▸ NBT ▸ SSCL ▸ Net)
//   · split payments and the payment cap (card can never overpay; cash can)
//   · tbl_billdetail / tbl_billpaytxn / tbl_billtaxes mapping + bill header maths
//   · the INV / BK series codes
// Nothing here touches the database, so it is safe to run anywhere.
// ─────────────────────────────────────────────────────────────────────────────
const path = require("path");
const root = path.join(__dirname, "..", ".tmptest");

const I = require(path.join(root, "itemCode.js"));
const ST = require(path.join(root, "bookingStatus.js"));
const T = require(path.join(root, "billingTaxes.js"));
const P = require(path.join(root, "billingPayments.js"));
const B = require(path.join(root, "billingBill.js"));
const S = require(path.join(root, "serials.js"));
const INV = require(path.join(root, "inventoryTotals.js"));
const PO = require(path.join(root, "poRequirements.js"));
const PP = require(path.join(root, "poPrint.js"));
const PE = require(path.join(root, "poEmail.js"));
const Q = require(path.join(root, "grnPoEntry.js"));
const N = require(path.join(root, "grnNotify.js"));
const SMS = require(path.join(root, "sms.js"));
const RS = require(path.join(root, "poReceiptState.js"));
const ID = require(path.join(root, "itemDetailStock.js"));
const RL = require(path.join(root, "rateLimit.js"));
const CIP = require(path.join(root, "clientIp.js"));
const OTP = require(path.join(root, "otpStore.js"));

let failures = 0;
let checks = 0;
function eq(name, got, want) {
  checks++;
  const ok = String(got) === String(want);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  →  ${got}${ok ? "" : `   (want ${want})`}`);
}
const P_ = (method, type, amount, remark = "") => ({ method, type, amount, remark });
const row = (
  code,
  description,
  percentage,
  serviceCharge = 0,
  listingOrder = null,
  enable = 1,
) => ({
  TaxCode: code,
  TaxDescription: description,
  TaxPrecentage: percentage,
  Enable: enable,
  ListingOrder: listingOrder,
  ServiceCharge: serviceCharge,
  ItemBasedTax: 0,
});

console.log("\n=== 1. Tax worksheet (tbl_taxes) ===");
const taxRows = T.normaliseTaxRows([
  row("SC   ", "Service Charge", 10, 1, 1),
  row("VAT  ", "VAT", 18, 0, 2),
  row("NBT  ", "NBT", 2, 0, 3),
  row("SSCL ", "SSCL", 2.5, 0, 4),
  row("OLD  ", "Old VAT", 15, 0, 5, 0), // Enable = 0 → must never appear
]);
eq("disabled rows are dropped", taxRows.length, 4);
eq("stage per row", taxRows.map(T.taxStage).join(","), "charge,vat,nbt,sscl");

const bill = T.computeTaxes(taxRows, 10000, 1000);
eq("(A) Gross", bill.gross, 10000);
eq("(C) Gross After Discount", bill.grossAfterDiscount, 9000);
eq("(D) Service Charge 10% of C", bill.serviceCharge, 900);
eq("(E) VAT 18% of (C+D)", bill.vat, 1782);
eq("(F) NBT 2% of (C+D+E)", bill.nbt, 233.64);
eq("(G) SSCL 2.5% of (C+D)", bill.sscl, 247.5);
eq("(H) Net Total", bill.netTotal, 12163.14);
eq("labels carry the percentage", bill.lines.map(T.taxLineLabel).join(" | "),
   "Service Charge (10%) | VAT (18%) | NBT (2%) | SSCL (2.5%)");
eq("a brand-new enabled row is picked up automatically",
   T.computeTaxes(
     T.normaliseTaxRows([row("CITY", "City Levy", 1)]), 1000, 0,
   ).netTotal, 1010);

console.log("\n=== 2. Split payments ===");
let info = P.summarisePayments([{ amount: 1500 }, { amount: 500 }, { amount: 250 }, { amount: 250 }], 2500);
eq("2500 = 1500 + 500 + 250 + 250 → fully paid", info.isFullyPaid, true);
eq("…balance is 0", info.balance, 0);
info = P.summarisePayments([{ amount: 3000 }], 2500);
eq("2500 bill paid with 3000 → balance 500 (change)", info.balance, 500);
eq("…still counts as fully paid", info.isFullyPaid, true);
info = P.summarisePayments([{ amount: 1000 }], 2500);
eq("partial payment → still owed 1500", info.remaining, 1500);

console.log("\n=== 3. Payment cap (card cannot overpay, cash can) ===");
let cap = P.applyLineCap("card", 1500, 2500, 0);
eq("card 1500 allowed", cap.amount, 1500);
cap = P.applyLineCap("online", 500, 2500, 1500);
eq("online 500 allowed", cap.amount, 500);
cap = P.applyLineCap("card", 500, 2500, 2000);
eq("last card line takes the remaining 500", cap.amount, 500);
cap = P.applyLineCap("card", 700, 2500, 2000);
eq("…more than that is capped", cap.amount, 500);
eq("…and flagged", cap.capped, true);
cap = P.applyLineCap("cash", 3000, 2500, 0);
eq("cash 3000 on a 2500 bill is allowed", cap.amount, 3000);
eq("…never capped", cap.capped, false);

console.log("\n=== 4. tbl_billdetail / paytxn / taxes mapping ===");
const detail = B.mergeBillLines(
  B.normaliseBillLines([
    { itemId: "ITM1", qty: 1, price: 100, costPrice: 40 },
    { itemId: "ITM1", qty: 3, price: 100, costPrice: 40 },
    { itemId: "ITM2", qty: 2, price: 250, costPrice: 100 },
  ]),
);
eq("same item code merges into one row", detail.length, 2);
eq("quantities add up", detail[0].qty, 4);
eq("money adds up", detail[0].totalItemPrice, 400);
eq("item codes fit CHAR(10)", B.shortCode("SER0000001ABCDEF"), "SER0000001");

/* Rows are filled in the order they are entered: card 1500 + online 250 first,
   then the customer hands over 3000 in cash for the remaining 2500. */
const pay = B.allocatePayments(
  [P_("card", "Visa", 1500, "ref 8842"), P_("online", "Wallet", 250), P_("cash", "", 3000)],
  4250,
);
eq("one row per payment line", pay.length, 3);
eq("pay codes", pay.map((r) => r.payCode).join(","), "VISA,WALLET,CASH");
eq("cash row: tendered = 3000", pay[2].tenderedAmount, 3000);
eq("cash row: act = 2500 (only what the bill still owed)", pay[2].actAmount, 2500);
eq("cash row: change = 500", pay[2].change, 500);
eq("the act column adds up to the bill",
   T.money(pay.reduce((sum, r) => sum + r.actAmount, 0)), 4250);
eq("duplicate pay code gets a suffix",
   B.allocatePayments([P_("card", "Visa", 100), P_("card", "Visa", 200)], 300)
     .map((r) => r.payCode).join(","), "VISA,VISA2");

eq("tbl_billtaxes keeps the tbl_taxes code", B.billTaxRows(bill.lines)[0].taxCode, "SC");
eq("TaxAmount is written as text (CHAR(10) column)", B.taxAmountText(1782), "1782.00");

console.log("\n=== 5. tbl_billheader maths ===");
const summary = B.buildBillSummary(bill.lines, 10000, 10, 1000, 500);
eq("Gross", summary.gross, 10000);
eq("DisVal", summary.discountValue, 1000);
eq("ServiceCharge = the ServiceCharge=1 rows", summary.serviceCharge, 900);
eq("TotalTaxAmount = VAT + NBT + SSCL", summary.totalTaxAmount, 2263.14);
eq("AdvAmount from the booking", summary.advAmount, 500);
eq("NetTotal", summary.netTotal, 12163.14);
eq("header adds back up",
   T.money(summary.gross - summary.discountValue + summary.serviceCharge + summary.totalTaxAmount),
   summary.netTotal);
eq("a screen total that disagrees is refused", B.billSummaryProblems(summary, 9999).length, 1);

console.log("\n=== 6. Series codes ===");
eq("bookings use BK", S.SERIAL_CODES.booking, "BK");
eq("bills use INV", S.SERIAL_CODES.invoice, "INV");
eq("INV + 7 digits fits tbl_billheader.BillNo char(15)",
   `INV0000007`.length <= 15, true);

console.log("\n=== 7. Item codes (CHAR(15) everywhere) ===");
eq("a full 15-character code is kept as it is", I.itemCode("  ITM000000000002 "), "ITM000000000002");
eq("nothing is cut to 10 characters", I.itemCode("ITM000000000002").length, 15);
eq("a value longer than the column is trimmed to 15", I.itemCode("ABCDEFGHIJKLMNOP").length, 15);
eq("the legacy prefix is the first 10 characters", I.legacyItemCode("ITM000000000002"), "ITM0000000");
eq("a full 15-character code is not a legacy value", I.isLegacyItemCode("ITM000000000002"), false);
eq("a short stored value is a legacy value", I.isLegacyItemCode("ITM0000000"), true);

/* Two services whose codes share their first 10 characters — the case that used
   to name the wrong service, price and cost. */
const masterRows = [
  { ItemCode: "ITM000000000001", ItemDes: "Hair Cut" },
  { ItemCode: "ITM000000000002", ItemDes: "Hair Colour" },
];
const itemIdx = I.createItemCodeIndex(masterRows, (r) => r.ItemCode);
eq("an exact 15-character code resolves", itemIdx.get("ITM000000000002").ItemDes, "Hair Colour");
eq("case and surrounding spaces are ignored", itemIdx.get(" itm000000000001 ").ItemDes, "Hair Cut");
eq("a SHARED prefix resolves to nothing — never the wrong item",
   String(itemIdx.get("ITM0000000")), "undefined");

/* One item only: the old 10-character row still has to resolve. */
const singleIdx = I.createItemCodeIndex(
  [{ ItemCode: "SHA0000000001", ItemDes: "Shampoo" }],
  (r) => r.ItemCode,
);
eq("an unambiguous legacy prefix still resolves", singleIdx.get("SHA0000000").ItemDes, "Shampoo");
eq("an unknown code resolves to nothing", String(singleIdx.get("NOPE")), "undefined");

const joinSql = I.itemCodeJoinSql("i.ItemCode", "d.ServiceItemID");
eq("join uses RTRIM on both sides", /RTRIM\(i\.ItemCode\) = RTRIM\(d\.ServiceItemID\)/.test(joinSql), true);
eq("join has no hard 10-character cut", /LEFT\(RTRIM\(i\.ItemCode\), 10\)/.test(joinSql), false);
eq("join guards an empty stored code",
   /CHAR_LENGTH\(RTRIM\(d\.ServiceItemID\)\) > 0/.test(joinSql), true);

const billLines = B.mergeBillLines(
  B.normaliseBillLines([
    { itemId: "ITM000000000002", name: "Hair Colour", qty: 2, price: 100 },
  ]),
);
eq("a billed line keeps the full 15-character code", billLines[0].itemId, "ITM000000000002");
eq("and still totals correctly", billLines[0].totalItemPrice, 200);
eq("a 15-character code is not treated as missing",
   B.linesWithoutCode([{ itemId: "ITM000000000002", name: "x", qty: 1, price: 1 }]).length, 0);
eq("two services with the same prefix stay two rows",
   B.mergeBillLines(
     B.normaliseBillLines([
       { itemId: "ITM000000000001", name: "Hair Cut", qty: 1, price: 1000 },
       { itemId: "ITM000000000002", name: "Hair Colour", qty: 1, price: 2000 },
     ]),
   ).length, 2);

console.log("\n=== 8. Booking status revert (bill screen) ===");
eq("Done goes back to Ongoing", ST.previousBookingStatus("DONE"), "ONGOING");
eq("Ongoing goes back to Confirmed", ST.previousBookingStatus("ongoing"), "CONFIRMED");
eq("a mixed-case value still works", ST.previousBookingStatus(" Done "), "ONGOING");
eq("Confirmed has nothing to revert to", String(ST.previousBookingStatus("CONFIRMED")), "null");
eq("Pending has nothing to revert to", String(ST.previousBookingStatus("PENDING")), "null");
eq("Cancelled has nothing to revert to", String(ST.previousBookingStatus("CANCELLED")), "null");
eq("an unknown status has nothing to revert to", String(ST.previousBookingStatus("WHATEVER")), "null");
eq("Revert is offered for Done", ST.canRevertBookingStatus("DONE"), true);
eq("Revert is offered for Ongoing", ST.canRevertBookingStatus("ONGOING"), true);
eq("Revert is NOT offered for Pending", ST.canRevertBookingStatus("PENDING"), false);
eq("labels are human readable", ST.bookingStatusLabel("DONE"), "Done");
eq("an unknown label falls back to the raw value", ST.bookingStatusLabel("WEIRD"), "WEIRD");

console.log("\n=== 9. Purchase Order / GRN totals ===");
eq("round2 keeps two decimals", INV.round2(12.345), 12.35);
eq("0.1 + 0.2 style noise is rounded away", INV.poLineValue(0.1, 3), 0.3);
eq("a PO line = cost x qty", INV.poLineValue(12.5, 3), 37.5);
eq("a PO line never goes negative", INV.poLineValue(-5, 3), 0);
eq("PO net total adds the lines", INV.poNetTotal([
  { costPrice: 10, poQty: 2 },
  { costPrice: 3.25, poQty: 4 },
]), 33);
eq("PO net total of nothing is 0", INV.poNetTotal([]), 0);
eq("a GRN line counts the free quantity at cost", INV.grnLineValue(100, 2, 1), 300);
eq("free goods alone still carry a value", INV.grnLineValue(50, 0, 2), 100);
eq("GRN net = gross - discount + adjustment", INV.grnTotals(
  [{ costPrice: 100, grnQty: 2, freeQty: 0 }], 25, 5,
).net, 180);
eq("GRN gross ignores the discount", INV.grnTotals(
  [{ costPrice: 100, grnQty: 2, freeQty: 0 }], 25, 5,
).gross, 200);
eq("open quantity = ordered - received", INV.openQty(10, 4), 6);
eq("an over-received line shows 0 open, never -3", INV.openQty(10, 13), 0);
eq("receiving inside the order is not an over-receipt", INV.overReceiptQty(10, 4, 5), 0);
eq("receiving past the order reports the excess", INV.overReceiptQty(10, 4, 7), 1);
eq("receiving the whole order exactly is allowed", INV.overReceiptQty(10, 10, 0), 0);
eq("a line received in full stays received", INV.overReceiptQty(10, 10, 1), 1);
eq("a PO line is complete at zero open", INV.isPoLineComplete(10, 10), true);
eq("a PO line is not complete while anything is open", INV.isPoLineComplete(10, 9.5), false);
eq("a PO is complete only when every line is", INV.isPoComplete([
  { poQty: 5, grnQty: 5 }, { poQty: 2, grnQty: 2 },
]), true);
eq("one open line keeps the PO open", INV.isPoComplete([
  { poQty: 5, grnQty: 5 }, { poQty: 2, grnQty: 1 },
]), false);
eq("an empty PO is never complete", INV.isPoComplete([]), false);
eq("below ROL with an ROQ suggests the ROQ", INV.suggestedOrderQty({
  stockBalance: 1, rol: 5, roq: 12,
}), 12);
eq("below ROL without an ROQ suggests up to MaxQty", INV.suggestedOrderQty({
  stockBalance: 3, rol: 5, roq: 0, maxQty: 20,
}), 17);
eq("above every level nothing is suggested", INV.suggestedOrderQty({
  stockBalance: 30, rol: 5, roq: 12, maxQty: 20,
}), 0);
eq("MinQty is used when there is no ROL", INV.suggestedOrderQty({
  stockBalance: 1, rol: 0, minQty: 4, maxQty: 10,
}), 9);
eq("no target quantity stored still suggests one", INV.suggestedOrderQty({
  stockBalance: 0, rol: 2, roq: 0, maxQty: 0,
}), 1);
eq("the shortage is how far below the level it is", INV.shortageLevel({
  stockBalance: 2, rol: 7,
}), 5);
eq("quantities are rounded like the legacy DOUBLE columns", INV.safeQty("2.0000001"), 2);

console.log("\n=== 10. Purchase Order · Current Stock Requirements ===");
const req = (over = {}) => ({
  itemCode: "ITM000000001001", itemName: "SHAMPOO", unitID: "UNIT000002",
  stockBalance: 1, rol: 3, roq: 6, minQty: 1, maxQty: 24,
  shortage: 2, suggestedQty: 6, costPrice: 2450,
  supID: "SUP0000001", supName: "CEYLON BEAUTY", enable: true, ...over,
});
const mixed = [
  req({ itemCode: "A", supID: "SUP0000002", supName: "LANKA HAIR", suggestedQty: 6 }),
  req({ itemCode: "B", supID: "SUP0000001", supName: "CEYLON BEAUTY", suggestedQty: 3 }),
  req({ itemCode: "C", supID: "SUP0000002", supName: "LANKA HAIR", suggestedQty: 12 }),
];
const groups = PO.groupRequirementsSupplierWise(mixed);
eq("one block per supplier", groups.length, 2);
eq("the blocks come supplier-name first", JSON.stringify(groups.map((g) => g.supName)),
  JSON.stringify(["CEYLON BEAUTY", "LANKA HAIR"]));
eq("a block keeps its rows in the order the API sent them",
  JSON.stringify(groups[1].rows.map((r) => r.itemCode)), JSON.stringify(["A", "C"]));
eq("a block counts its own items", groups[1].rows.length, 2);
eq("an item with no supplier still gets a block",
  PO.groupRequirementsSupplierWise([req({ supID: "", supName: "" })])[0].supName,
  PO.NO_SUPPLIER_LABEL);
eq("items of one supplier report that one supplier",
  JSON.stringify(PO.suppliersOf([mixed[0], mixed[2]])), JSON.stringify(["SUP0000002"]));
eq("items of two suppliers report both", PO.suppliersOf(mixed).length, 2);
eq("a single-supplier tick can fill the supplier in",
  PO.supplierForSelection([mixed[0], mixed[2]]), "SUP0000002");
eq("a mixed tick fills in nothing", PO.supplierForSelection(mixed), null);
eq("items carrying no supplier leave the header supplier alone",
  PO.supplierForSelection([req({ supID: "", supName: "" })]), "");
const lines = PO.requirementLines([mixed[1], mixed[0]]);
eq("only the ticked rows become order lines", lines.length, 2);
eq("they keep the order they were ticked in",
  JSON.stringify(lines.map((l) => l.itemCode)), JSON.stringify(["B", "A"]));
eq("a line carries the item name", lines[0].name, "SHAMPOO");
eq("a line carries the master unit", lines[0].unitID, "UNIT000002");
eq("a line quantity is the suggested quantity", lines[0].poQty, "3");
eq("a line cost is the master cost", lines[0].costPrice, "2450");
eq("an item with no master cost leaves the cost box empty",
  PO.requirementLines([req({ costPrice: 0 })])[0].costPrice, "");
eq("an empty tick puts nothing on the order", PO.requirementLines([]).length, 0);

console.log("\n=== 11. Purchase Order · the two printed copies ===");
eq("the Print button offers two copies", PP.PO_PRINT_COPY_CHOICES.length, 2);
eq("the first choice is the Standard Copy", PP.PO_PRINT_COPY_CHOICES[0].label, "Standard Copy");
eq("the second choice is the Supplier Copy", PP.PO_PRINT_COPY_CHOICES[1].label, "Supplier Copy");
eq("every choice explains itself", PP.PO_PRINT_COPY_CHOICES.every((c) => c.hint.length > 20), true);
eq("the standard copy is labelled", PP.poPrintCopyLabel("standard"), "Standard Copy");
eq("the supplier copy is labelled", PP.poPrintCopyLabel("supplier"), "Supplier Copy");
const stdCols = PP.poPrintValueColumns("standard");
eq("the standard copy prints the Cost Price column", stdCols.costPrice, true);
eq("the standard copy prints the ItemValue column", stdCols.itemValue, true);
eq("the standard copy prints the Total row", stdCols.total, true);
const supCols = PP.poPrintValueColumns("supplier");
eq("the supplier copy hides the Cost Price", supCols.costPrice, false);
eq("the supplier copy hides the ItemValue", supCols.itemValue, false);
eq("the supplier copy hides the Total", supCols.total, false);
eq("the standard copy has six columns", PP.poPrintColumnCount("standard"), 6);
eq("the supplier copy has four columns", PP.poPrintColumnCount("supplier"), 4);
eq("a stored date prints the legacy way", PP.poPrintDate("2026-08-10"), "10-Aug-2026");
eq("a stored timestamp prints the same day", PP.poPrintDate("2026-08-10T00:00:00.000Z"), "10-Aug-2026");
eq("an already printed date is left as it is", PP.poPrintDate("10-Aug-2026"), "10-Aug-2026");
eq("an empty date prints nothing", PP.poPrintDate(""), "");
eq("an unreadable date is never 'Invalid Date'", PP.poPrintDate("not a date"), "not a date");
const printedClock = PP.poPrintClock(new Date(2026, 8, 16, 22, 7, 22));
eq("the print date", printedClock.date, "16-Sep-2026");
eq("the print time is 12-hour with am/pm", printedClock.time, "10:07:22 pm");
eq("midnight is 12 am", PP.poPrintClock(new Date(2026, 8, 16, 0, 5, 0)).time, "12:05:00 am");
eq("noon is 12 pm", PP.poPrintClock(new Date(2026, 8, 16, 12, 0, 0)).time, "12:00:00 pm");
eq("money keeps two decimals and separators", PP.poPrintMoney(16850), "16,850.00");
eq("money of nothing", PP.poPrintMoney(0), "0.00");
const printedRows = PP.poPrintRows([
  { itemCode: "002 ", name: " RED CABBAGE ", unitID: "UNIT000012", unitName: "KILOGRAM", costPrice: 250, poQty: 5 },
  { itemCode: "003", name: "WHITE CABBAGE", unitID: "UNIT000012", costPrice: 2600, poQty: 6 },
]);
eq("a printed row trims the item code", printedRows[0].itemCode, "002");
eq("a printed row trims the item name", printedRows[0].name, "RED CABBAGE");
eq("a printed row shows the unit NAME", printedRows[0].unit, "KILOGRAM");
eq("a printed row shows the quantity", printedRows[0].qty, "5.00");
eq("a printed row shows the cost price", printedRows[0].costPrice, "250.00");
eq("a printed row shows the line value", printedRows[0].itemValue, "1,250.00");
eq("a unit with no name falls back to the code",
  PP.poPrintRows([{ itemCode: "x", name: "y", unitID: "UNIT000099", costPrice: 1, poQty: 1 }])[0].unit,
  "UNIT000099");
eq("the Total adds the printed values", PP.poPrintTotal([
  { itemCode: "002", name: "", unitID: "", costPrice: 250, poQty: 5 },
  { itemCode: "003", name: "", unitID: "", costPrice: 2600, poQty: 6 },
]), "16,850.00");
eq("an order with no lines prints a Total of 0", PP.poPrintTotal([]), "0.00");

console.log("\n=== 12. Emailing the order to the supplier ===");
eq("an attachment is named after the order", PE.poPdfFileName("PO0000004"), "PO0000004.pdf");
eq("a padded PO number still gives a clean file name", PE.poPdfFileName(" PO0000004 "), "PO0000004.pdf");
eq("an empty PO number never becomes an empty file name", PE.poPdfFileName(""), "purchase-order.pdf");
eq("one address is read", JSON.stringify(PE.supplierEmails("orders@ceylonbeauty.lk")),
  JSON.stringify(["orders@ceylonbeauty.lk"]));
eq("several addresses separated by ; are all read",
  JSON.stringify(PE.supplierEmails("a@one.lk; b@two.lk")), JSON.stringify(["a@one.lk", "b@two.lk"]));
eq("a comma works too", PE.supplierEmails("a@one.lk,b@two.lk").length, 2);
eq("the same address twice is one address", PE.supplierEmails("a@one.lk, a@one.lk").length, 1);
eq("a telephone number is not an address", PE.supplierEmails("011-2445678").length, 0);
eq("a half address is not an address", PE.supplierEmails("orders@localhost").length, 0);
eq("nonsense in the column yields nothing", PE.supplierEmails("n/a").length, 0);
eq("an empty column yields nothing", PE.supplierEmails("").length, 0);
eq("a missing column yields nothing", PE.supplierEmails(null).length, 0);
eq("an address in angle brackets is cleaned up",
  JSON.stringify(PE.supplierEmails("<sales@ceylon.lk>")), JSON.stringify(["sales@ceylon.lk"]));
eq("the first real address is the one used",
  PE.primarySupplierEmail("011-2445678; sales@ceylon.lk"), "sales@ceylon.lk");
eq("no address at all leaves nothing", PE.primarySupplierEmail("011-2445678"), "");
eq("what is not an address is reported back",
  JSON.stringify(PE.invalidSupplierEmailParts("sales@ceylon.lk; 011-2445678")),
  JSON.stringify(["011-2445678"]));
eq("an empty column reports nothing",
  JSON.stringify(PE.invalidSupplierEmailParts("")), JSON.stringify([]));
eq("the subject names the order and the salon",
  PE.poEmailSubject({ poNo: "PO0000004", companyName: "COLOMBO MAIN BRANCH" }),
  "Purchase Order PO0000004 — COLOMBO MAIN BRANCH");
eq("a salon with no name still gives a subject",
  PE.poEmailSubject({ poNo: "PO0000004", companyName: "" }), "Purchase Order PO0000004");
const mailCtx = {
  poNo: "PO0000004", companyName: "COLOMBO MAIN BRANCH", supplierName: "CEYLON ORGANIC HERBAL SUPPLIERS",
  poDate: "16-Sep-2026", dueDate: "16-Sep-2026", lineCount: 6, copy: "supplier",
};
const body = PE.poEmailBody(mailCtx);
eq("the note greets the supplier", body.includes("CEYLON ORGANIC HERBAL SUPPLIERS"), true);
eq("the note names the order", body.includes("PO0000004"), true);
eq("the note names the attachment", body.includes("PO0000004.pdf"), true);
eq("the note carries both dates", body.includes("16-Sep-2026"), true);
eq("the note counts the lines", body.includes("6 item line(s)"), true);
eq("the note signs off with the salon", body.trim().endsWith("COLOMBO MAIN BRANCH"), true);
eq("the note never mentions money", /(cost|price|total|value)/i.test(body), false);
eq("the SMTP settings this feature needs are listed",
  JSON.stringify(PE.SMTP_ENV_KEYS),
  JSON.stringify(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]));
const fullEnv = { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_USER: "a@b.c", SMTP_PASS: "x", SMTP_FROM: "SAYO <a@b.c>" };
eq("a filled-in environment is ready", PE.smtpConfigured(fullEnv), true);
eq("a missing password is caught", PE.smtpConfigured({ ...fullEnv, SMTP_PASS: "" }), false);
eq("the missing keys are named", JSON.stringify(PE.smtpMissingEnv({ SMTP_HOST: "smtp.gmail.com" })),
  JSON.stringify(["SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]));
eq("SMTP_SECURE is optional (587 is not 'secure')",
  PE.smtpMissingEnv(fullEnv).includes("SMTP_SECURE"), false);
eq("the setup message names the empty keys",
  PE.smtpSetupMessage(["SMTP_PASS"]).includes("SMTP_PASS"), true);
eq("the setup message says where they live",
  PE.smtpSetupMessage(["SMTP_PASS"]).includes(".env"), true);
eq("with nothing missing there is nothing to say", PE.smtpSetupMessage([]), "");


console.log("\n=== 13. Receiving against a purchase order, one line at a time ===");
/* The entry row: what it is filled with when a PO line comes forward. */
const poLine = {
  itemCode: "ITM000000001001", itemName: "L'OREAL PROF ABSOLUTE REPAIR SHAMPOO 250 ML",
  unitID: "UNIT000002", costPrice: 2450, retailPrice: 3650,
  poQty: 10, receivedQty: 4, openQty: 6,
};
const filled = Q.poEntryFields(poLine);
eq("the quantity starts at what is still open", filled.grnQty, "6");
eq("the cost price comes from the order", filled.costPrice, "2450");
eq("the retail price comes from the order", filled.retailPrice, "3650");
eq("the unit comes from the order", filled.unitID, "UNIT000002");
eq("the batch number is always empty (it is on the packet)", filled.batchNo, "");
eq("the free quantity starts empty", filled.freeQty, "");
eq("the expiry date starts empty", filled.expDate, "");
eq("the master price is not pushed anywhere by default", filled.updItemPrice, false);
eq("the order quantity is remembered for the hint", filled.poQty, 10);
eq("what was already received is remembered too", filled.alreadyReceived, 4);
eq("a fully received line arrives with an empty quantity",
  Q.poEntryFields({ ...poLine, openQty: 0 }).grnQty, "");
eq("a sold-out order still fills nothing", Q.poEntryFields({ ...poLine, openQty: 0 }).grnQty, "");
eq("a decimal quantity keeps its decimals", Q.poEntryFields({ ...poLine, openQty: 2.5 }).grnQty, "2.5");
eq("a string price is passed through as text", Q.poEntryFields({ ...poLine, costPrice: "2450" }).costPrice, "2450");
eq("a missing price stays empty rather than 0", Q.poEntryFields({ ...poLine, costPrice: null }).costPrice, "");
eq("a missing date never becomes 'null'", Q.poEntryFields({ ...poLine, costPrice: null }).costPrice.includes("null"), false);

/* The strip above the grid. */
eq("nothing added yet reads as 0 of N", Q.poEntryProgress(3, 3).text, "0 of 3 line(s) added · 3 left to add");
eq("half way through", Q.poEntryProgress(3, 1).text, "2 of 3 line(s) added · 1 left to add");
eq("added counts up", Q.poEntryProgress(3, 1).added, 2);
eq("left counts down", Q.poEntryProgress(3, 1).left, 1);
eq("the last line reads as all added", Q.poEntryProgress(1, 0).text,
  "all 1 open line(s) added — press Save when the rest of the note is filled in");
eq("everything added is 'done'", Q.poEntryProgress(2, 0).done, true);
eq("something still waiting is not 'done'", Q.poEntryProgress(2, 1).done, false);
eq("an order with nothing open says so", Q.poEntryProgress(0, 0).text, "this order has no lines still open");
eq("more waiting than the order has cannot be invented", Q.poEntryProgress(2, 9).left, 2);
eq("a broken count cannot produce a negative", Q.poEntryProgress(NaN, NaN).added, 0);

/* The queue: Add / Skip / removing a line from the grid. */
const L = (key) => ({ key, itemName: key });
const lines0 = [L("A"), L("B"), L("C")];
const accepted = Q.queueAccept([], lines0, "A");
eq("Add puts the entry line on the grid", accepted.lines.map((l) => l.key).join(""), "A");
eq("Add takes it off the queue", accepted.queue.map((l) => l.key).join(""), "BC");
eq("the next line is now first", accepted.queue[0].key, "B");
eq("Add on a line that is not waiting changes nothing",
  Q.queueAccept([], lines0, "Z").lines.length, 0);
eq("a line cannot be added twice (double Enter)",
  Q.queueAccept(accepted.lines, accepted.queue, "A").lines.length, 1);
const withA = Q.queueAccept(accepted.lines, accepted.queue, "B");
eq("the second Add appends after the first", withA.lines.map((l) => l.key).join(""), "AB");
eq("accepting the last line empties the queue", Q.queueAccept(withA.lines, withA.queue, "C").queue.length, 0);
eq("Skip sends the first line to the back", Q.queueSkipFirst(lines0).map((l) => l.key).join(""), "BCA");
eq("Skip does not change how many are left", Q.queueSkipFirst(lines0).length, 3);
eq("Skip on a single line does nothing", Q.queueSkipFirst([L("A")]).map((l) => l.key).join(""), "A");
eq("Skip on an empty queue is safe", Q.queueSkipFirst([]).length, 0);
eq("two Skips put the order back", Q.queueSkipFirst(Q.queueSkipFirst(lines0)).map((l) => l.key).join(""), "CAB");
eq("a line taken off the grid goes back in FRONT of the queue",
  Q.queueRequeue([L("B"), L("C")], L("A")).map((l) => l.key).join(""), "ABC");
eq("removing the same line twice does not duplicate it",
  Q.queueRequeue([L("A")], L("A")).map((l) => l.key).join(""), "A");
eq("a grid line that is no longer on the order is dropped",
  Q.queueRemove(lines0, "B").map((l) => l.key).join(""), "AC");
eq("dropping nothing leaves the queue alone", Q.queueRemove(lines0, "Z").length, 3);


console.log("\n=== 14. Telling an admin that a saved GRN needs confirming ===");
const facts = {
  grnNo: "GRN0000007", locCode: "LOC0000001", locationName: "MAIN BRANCH - COLOMBO 03",
  supplierName: "LANKA HAIR & SKIN CARE SUPPLIES", poNo: "PO0000004",
  netTotal: 70950, lineCount: 3, actorName: "Nimal", companyName: "SAYO Beauty",
};
const msg = N.grnNotifyMessage(facts);
eq("the message names the receipt", msg.includes("GRN0000007"), true);
eq("the message says what is waiting", msg.includes("waiting for Confirmation"), true);
eq("the message starts with the salon", msg.startsWith("SAYO Beauty:"), true);
eq("the message names the purchase order", msg.includes("PO0000004"), true);
eq("the message names the supplier", msg.includes("LANKA HAIR & SKIN CARE SUPPLIES"), true);
eq("the money is written the way the screens write it", msg.includes("70,950.00"), true);
eq("the message names the branch", msg.includes("MAIN BRANCH - COLOMBO 03"), true);
eq("the message counts the lines", msg.includes("3 item line(s)"), true);
eq("the message says who saved it", msg.includes("by Nimal"), true);
eq("there is no 'undefined' anywhere in it", /undefined|null|NaN/.test(msg), false);
eq("money is formatted with two decimals", N.notifyMoney(70950), "70,950.00");
eq("a missing total is not written as 0 on the sheet", N.notifyMoney(undefined), "0.00");
eq("a sentence can be missing and the rest still reads well",
  N.grnNotifyMessage({ grnNo: "GRN0000009" }).includes("GRN0000009"), true);
const tinyMsg = N.grnNotifyMessage({ grnNo: "GRN0000009" });
eq("a facts-less message has no empty brackets", /·\s*·|\s+·$/.test(tinyMsg), false);
eq("a short message is one part", N.smsPartCount("hello"), 1);
eq("a 200 character message is two parts", N.smsPartCount("x".repeat(200)), 2);
eq("the real message is one or two parts", N.smsPartCount(msg) <= 2, true);

/* who may be chosen */
const notifyGroupRows = [
  { GroupId: "GRP0000001", GroupDes: "Administrator" },
  { GroupId: "GRP0000002", GroupDes: "Technician" },
  { GroupId: "GRP0000003", GroupDes: "Store keeper" },
];
const staff = [
  { UserId: "ADM0000001", UserName: "Zara Admin", ContNo: "0771234567", GroupId: "GRP0000001", Enable: true },
  { UserId: "USR0000002", UserName: "Nimal Store", ContNo: "0719876543", GroupId: "GRP0000003", Enable: true },
  { UserId: "USR0000003", UserName: "Amal Tech", ContNo: "0761112222", GroupId: "GRP0000002", Enable: true },
  { UserId: "USR0000004", UserName: "No Phone", ContNo: "", GroupId: "GRP0000001", Enable: true },
  { UserId: "USR0000005", UserName: "Gone Home", ContNo: "0755555555", GroupId: "GRP0000001", Enable: false },
  { UserId: "USR0000006", UserName: "Land Line", ContNo: "0112445566", GroupId: "GRP0000001", Enable: true },
];
const people = N.notifyContacts(staff, notifyGroupRows);
eq("only reachable people are offered", people.length, 3);
eq("someone with no number is left out", people.some((p) => p.userId === "USR0000004"), false);
eq("a disabled login is left out", people.some((p) => p.userId === "USR0000005"), false);
eq("a land line is left out (Text.lk would refuse it)", people.some((p) => p.userId === "USR0000006"), false);
eq("an admin comes first", people[0].userId, "ADM0000001");
eq("the admin is marked as such", people[0].isAdmin, true);
eq("everyone else follows, by name", people.map((p) => p.name).join(" | "), "Zara Admin | Amal Tech | Nimal Store");
eq("the number is stored in the Text.lk format", people[0].phone, "94771234567");
eq("a 07 number is recognised", N.isMobileForSms("0771234567"), true);
eq("a +94 number is recognised", N.isMobileForSms("+94771234567"), true);
eq("a 0094 number is recognised", N.isMobileForSms("0094771234567"), true);
eq("a land line is refused", N.isMobileForSms("0112445566"), false);
eq("nonsense is refused", N.isMobileForSms("call the shop"), false);
eq("'Administrator' counts as an admin group", N.isAdminGroup("Administrator"), true);
eq("'Store keeper' does not", N.isAdminGroup("Store keeper"), false);
eq("the same number twice is offered once", N.notifyContacts([
  { UserId: "A", UserName: "First", ContNo: "0771234567", GroupId: "GRP0000002", Enable: true },
  { UserId: "B", UserName: "Second", ContNo: "0771234567", GroupId: "GRP0000001", Enable: true },
], notifyGroupRows).length, 1);
eq("…and the admin is the one kept", N.notifyContacts([
  { UserId: "A", UserName: "First", ContNo: "0771234567", GroupId: "GRP0000002", Enable: true },
  { UserId: "B", UserName: "Second", ContNo: "0771234567", GroupId: "GRP0000001", Enable: true },
], notifyGroupRows)[0].userId, "B");
eq("an empty staff list is not an error", N.notifyContacts([]).length, 0);
eq("staff with no group row still appear", N.notifyContacts([
  { UserId: "X", UserName: "Loose End", ContNo: "0770000001", GroupId: "GRP9", Enable: true },
]).length, 1);
eq("a number reads the way a person says it", N.displayPhone("94771234567"), "077 123 4567");
eq("an empty number displays as nothing", N.displayPhone(""), "");

/* the Text.lk settings */
eq("the two settings this needs are listed",
  JSON.stringify(SMS.SMS_ENV_KEYS), JSON.stringify(["TEXTLK_API_TOKEN", "TEXTLK_SENDER_ID"]));
eq("an empty environment is not configured", SMS.smsConfigured({}), false);
eq("the empty keys are named",
  JSON.stringify(SMS.smsMissingEnv({ TEXTLK_API_TOKEN: "t" })), JSON.stringify(["TEXTLK_SENDER_ID"]));
eq("a filled-in environment is ready",
  SMS.smsConfigured({ TEXTLK_API_TOKEN: "t", TEXTLK_SENDER_ID: "SAYO" }), true);
eq("a space is not a setting",
  SMS.smsConfigured({ TEXTLK_API_TOKEN: "  ", TEXTLK_SENDER_ID: "SAYO" }), false);
eq("the setup message names the empty key",
  SMS.smsSetupMessage(["TEXTLK_API_TOKEN"]).includes("TEXTLK_API_TOKEN"), true);
eq("the setup message says which file",
  SMS.smsSetupMessage(["TEXTLK_API_TOKEN"]).includes(".env"), true);
eq("with nothing missing there is nothing to say", SMS.smsSetupMessage([]), "");
eq("a number is normalised before it is sent", SMS.normalizeSmsPhone("077 123 4567"), "94771234567");

console.log("\n=== 15. When a purchase order counts as received (GRNed) ===");

/* The old desktop program finished its GRN save with
   UPDATE Tbl_POHeader SET GRNed = 'Y' … — these checks pin the rule the new
   screen follows when it writes that same column. */
eq("a single fully received line closes the order",
  RS.poFullyReceived([{ poQty: 20, grnQty: 20 }]), true);
eq("more than ordered is still received",
  RS.poFullyReceived([{ poQty: 20, grnQty: 25 }]), true);
eq("a part delivery leaves the order open",
  RS.poFullyReceived([{ poQty: 20, grnQty: 12 }]), false);
eq("one short line keeps the whole order open",
  RS.poFullyReceived([{ poQty: 10, grnQty: 10 }, { poQty: 5, grnQty: 4.5 }]), false);
eq("an order with no lines is never 'received'",
  RS.poFullyReceived([]), false);
eq("nothing passed in is not received either",
  RS.poFullyReceived(null), false);
eq("a rounding whisker is not a shortage",
  RS.poFullyReceived([{ poQty: 0.3, grnQty: 0.1 + 0.2 }]), true);
eq("text quantities are read like numbers",
  RS.poFullyReceived([{ poQty: "12", grnQty: "12.000" }]), true);
eq("…and a text shortage is still a shortage",
  RS.poFullyReceived([{ poQty: "12", grnQty: "11" }]), false);
eq("free goods do not change what was ordered",
  RS.poFullyReceived([{ poQty: 10, grnQty: 10 }]), true);

eq("the open quantity of a line",
  RS.poLineOpenQty({ poQty: 20, grnQty: 12.5 }), 7.5);
eq("an over-received line shows nothing open",
  RS.poLineOpenQty({ poQty: 10, grnQty: 12 }), 0);
eq("the summary counts both sides",
  JSON.stringify(RS.poReceiptSummary([
    { poQty: 10, grnQty: 10 },
    { poQty: 5, grnQty: 2 },
    { poQty: 1, grnQty: 1 },
  ])), JSON.stringify({ lines: 3, received: 2, open: 1, fullyReceived: false }));
eq("the flag for a finished order", RS.grnedFlag(true), "Y");
eq("the flag for an unfinished order", RS.grnedFlag(false), "N");
eq("a finished order is described plainly",
  RS.poReceiptWords(RS.poReceiptSummary([{ poQty: 4, grnQty: 4 }])), "all 1 line(s) received");
eq("a part delivery is described plainly",
  RS.poReceiptWords(RS.poReceiptSummary([
    { poQty: 4, grnQty: 4 },
    { poQty: 6, grnQty: 1 },
  ])), "1 of 2 line(s) received — 1 still open");
eq("an order with no lines says so",
  RS.poReceiptWords(RS.poReceiptSummary([])), "no lines on the order");

console.log("\n=== 16. The batch-wise stock row (tbl_itemdetail) ===");

/* The Item Master screen reads this table, so a receipt has to land in it too.
   The quantity must be the SAME one that went to StockBalance and the ledger. */
eq("received + free is what goes into the batch row", ID.itemDetailQty(20, 3), 23);
eq("nothing received writes nothing", ID.itemDetailQty(0, 0), 0);
eq("text quantities are read like numbers", ID.itemDetailQty("12", "0.5"), 12.5);
eq("…and the rounding matches the ledger", ID.itemDetailQty(0.1, 0.2), 0.3);
eq("a line with no expiry lands in one bucket", ID.itemDetailExpiry(null).toISOString(), "1900-01-01T00:00:00.000Z");
eq("1900-01-01 counts as no expiry", ID.itemDetailHasExpiry(new Date(Date.UTC(1900, 0, 1))), false);
eq("a real expiry is kept as it is",
  ID.itemDetailExpiry(new Date(Date.UTC(2027, 2, 31))).toISOString(), "2027-03-31T00:00:00.000Z");
eq("a text date is read too", ID.itemDetailExpiry("2027-03-31").toISOString(), "2027-03-31T00:00:00.000Z");
eq("…and it is marked as having an expiry", ID.itemDetailHasExpiry("2027-03-31"), true);
eq("no expiry is spelled out for people", ID.itemDetailExpiryLabel(null), "no expiry date");
eq("a real expiry is shown as the date", ID.itemDetailExpiryLabel("2027-03-31"), "2027-03-31");
eq("the activity-log words", ID.itemDetailRowWords(23, "2027-03-31"), "+23 into 2027-03-31");
eq("…and without an expiry", ID.itemDetailRowWords(5, null), "+5 into no expiry date");
eq("the missing-table note names the table",
  ID.ITEM_DETAIL_MISSING_NOTE.includes("tbl_itemdetail"), true);
eq("…and says what still happened",
  ID.ITEM_DETAIL_MISSING_NOTE.includes("ledger"), true);

console.log("\n=== 17. Rate limiting, the caller's address, and the reset codes ===");

/* ── the window arithmetic ─────────────────────────────────────────────── */
const rule = { limit: 3, windowMs: 60_000 };
let st = RL.decideRate(undefined, 1_000, rule);
eq("the first request of a window is allowed", st.decision.ok, true);
eq("…and counts as one", st.decision.count, 1);
st = RL.decideRate(st.counter, 2_000, rule);
eq("the second is allowed", st.decision.ok, true);
st = RL.decideRate(st.counter, 3_000, rule);
eq("the third is the last allowed one", st.decision.ok, true);
eq("…with nothing left", st.decision.remaining, 0);
st = RL.decideRate(st.counter, 4_000, rule);
eq("the fourth is refused", st.decision.ok, false);
eq("…and says how long to wait", st.decision.retryAfterSec, 57);
st = RL.decideRate(st.counter, 61_500, rule);
eq("a finished window starts again", st.decision.ok, true);
eq("…from one", st.decision.count, 1);
eq("a limit of 0 is treated as 1, never as unlimited",
  RL.decideRate(undefined, 1_000, { limit: 0, windowMs: 1000 }).decision.ok, true);
eq("…and blocks the second", (() => {
  const first = RL.decideRate(undefined, 1_000, { limit: 0, windowMs: 60_000 });
  return RL.decideRate(first.counter, 1_100, { limit: 0, windowMs: 60_000 }).decision.ok;
})(), false);

/* ── the live counters ─────────────────────────────────────────────────── */
RL.resetAllRates();
const smallRule = { bucket: "test:x", key: "1.2.3.4", limit: 2, windowMs: 60_000 };
eq("counted call 1", RL.rateLimit(smallRule).ok, true);
eq("counted call 2", RL.rateLimit(smallRule).ok, true);
eq("counted call 3 is over the line", RL.rateLimit(smallRule).ok, false);
eq("…and the counter exists", RL.rateCounterCount() > 0, true);
eq("a peek does not count", RL.rateLimitPeek(smallRule).count, 3);
eq("the key is not case sensitive", RL.rateLimit({ ...smallRule, key: "1.2.3.4" }).ok, false);
RL.clearRate("test:x", "1.2.3.4");
eq("clearing a counter forgives the caller", RL.rateLimit(smallRule).ok, true);
RL.resetAllRates();
eq("the table can be emptied", RL.rateCounterCount(), 0);

/* ── the sentence a person reads ──────────────────────────────────────── */
eq("seconds are spelled out", RL.waitWords(1), "1 second");
eq("…and pluralised", RL.waitWords(45), "45 seconds");
eq("minutes when it is long", RL.waitWords(600), "10 minutes");
eq("the booking message names the salon",
  RL.rateMessage("booking", 600).includes("call the salon"), true);
eq("the login message says when it comes back",
  RL.rateMessage("login", 60).includes("1 minute"), true);
eq("the OTP message exists", RL.rateMessage("otp_send", 30).length > 20, true);

/* ── whose address is it really ───────────────────────────────────────── */
const headers = (map) => (name) => map[name.toLowerCase()] ?? null;
eq("the socket address our own server measured wins",
  CIP.clientIpFromHeaders(headers({ "x-sayo-ip": "192.168.1.9", "x-forwarded-for": "9.9.9.9" }), 0, ""),
  "unknown");
eq("…once it proves it is our server",
  CIP.clientIpFromHeaders(headers({ "x-sayo-ip": "192.168.1.9", "x-sayo-ip-token": "s3cret" }), 0, "s3cret"),
  "192.168.1.9");
eq("a forged token is ignored and the caller is counted as unknown",
  CIP.clientIpFromHeaders(headers({ "x-sayo-ip": "1.2.3.4", "x-sayo-ip-token": "guess" }), 0, "s3cret"),
  "unknown");
eq("a typed x-forwarded-for buys nothing when there is no proxy",
  CIP.clientIpFromHeaders(headers({ "x-forwarded-for": "8.8.8.8" }), 0, ""),
  "unknown");
eq("behind one trusted proxy the last hop is the client",
  CIP.clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), 1, ""),
  "10.0.0.1");
eq("behind two trusted proxies it steps back two",
  CIP.clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }), 2, ""),
  "10.0.0.1");
eq("a chain shorter than the proxy count still yields something",
  CIP.clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7" }), 3, ""),
  "203.0.113.7");
eq("IPv4 mapped over IPv6 is unwrapped",
  CIP.normaliseIp("::ffff:192.168.1.5"), "192.168.1.5");
eq("an IPv6 loopback with a port is unwrapped", CIP.normaliseIp("[::1]:3000"), "::1");
eq("an IPv4 address with a port is unwrapped", CIP.normaliseIp("192.168.1.5:51234"), "192.168.1.5");
eq("an empty address is empty", CIP.normaliseIp("   "), "");
eq("TRUST_PROXY is read as a number", CIP.trustProxyCount({ TRUST_PROXY: "2" }), 2);
eq("…rubbish means no proxy", CIP.trustProxyCount({ TRUST_PROXY: "yes" }), 0);
eq("…and 0 or missing means none", CIP.trustProxyCount({}), 0);
eq("an address shown in a log loses its last octet",
  CIP.ipForLog("192.168.1.5"), "192.168.1.x");

/* ── the local web server (IIS) is the caller: believe what it appended ── */
eq("127.0.0.1 is this machine", CIP.isLoopbackIp("127.0.0.1"), true);
eq("…so is ::1", CIP.isLoopbackIp("::1"), true);
eq("…and the IPv6-written form of IPv4 loopback", CIP.isLoopbackIp("::ffff:127.0.0.1"), true);
eq("…and the rest of 127.0.0.0/8", CIP.isLoopbackIp("127.0.0.53"), true);
eq("a public address is not", CIP.isLoopbackIp("203.0.113.9"), false);
eq("…and an empty one is not", CIP.isLoopbackIp(""), false);
eq("IIS on this machine: the visitor IIS appended is the caller",
  CIP.clientIpFromHeaders(
    headers({ "x-sayo-ip": "127.0.0.1", "x-sayo-ip-token": "t", "x-forwarded-for": "1.2.3.4, 203.0.113.9" }),
    0, "t"),
  "203.0.113.9");
eq("…a value the caller typed in front of it is ignored",
  CIP.clientIpFromHeaders(
    headers({ "x-sayo-ip": "127.0.0.1", "x-sayo-ip-token": "t", "x-forwarded-for": "1.2.3.4" }),
    0, "t"),
  "1.2.3.4");
eq("…with nothing forwarded at all the socket address is used",
  CIP.clientIpFromHeaders(headers({ "x-sayo-ip": "127.0.0.1", "x-sayo-ip-token": "t" }), 0, "t"),
  "127.0.0.1");
eq("a visitor that reaches the app directly cannot fake a chain entry",
  CIP.clientIpFromHeaders(
    headers({ "x-sayo-ip": "203.0.113.9", "x-sayo-ip-token": "t", "x-forwarded-for": "1.2.3.4" }),
    0, "t"),
  "203.0.113.9");
eq("SAYO_IP_SOCKET_ONLY throws the forwarded header away",
  CIP.clientIpFromHeaders(
    headers({ "x-sayo-ip": "127.0.0.1", "x-sayo-ip-token": "t", "x-forwarded-for": "203.0.113.9" }),
    0, "t", true),
  "127.0.0.1");
eq("…and then an unknown socket stays unknown",
  CIP.clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.9" }), 0, "", true),
  "unknown");
eq("an unknown address is shown as unknown, not sliced",
  CIP.ipForLog(""), "unknown");

/* ── the reset code ───────────────────────────────────────────────────── */
eq("a code is always 6 digits", OTP.generateOtpCode(() => 42).length, 6);
eq("…and zero padded", OTP.generateOtpCode(() => 0), "000000");
eq("…and takes the value it is given", OTP.generateOtpCode(() => 123456), "123456");
eq("a nonsense generator cannot produce something odd",
  OTP.generateOtpCode(() => Number.NaN), "000000");
eq("the real generator is cryptographically random, not Math.random",
  OTP.generateOtpCode.toString().includes("Math.random"), false);
eq("reset codes are compared in constant time",
  OTP.otpEqual.toString().includes("timingSafeEqual"), true);
eq("the right code matches", OTP.otpEqual("123456", "123456"), true);
eq("a wrong code does not", OTP.otpEqual("123456", "123457"), false);
eq("a shorter guess does not throw", OTP.otpEqual("123456", "1"), false);

const live = { code: "654321", expiresAt: Date.now() + 60_000, attempts: 0 };
eq("the right code passes", OTP.evaluateOtp(live, "654321").ok, true);
eq("four tries left after one wrong guess",
  OTP.evaluateOtp(live, "000000").attemptsLeft, OTP.OTP_MAX_ATTEMPTS - 1);
eq("…and the reason is ‘wrong’", OTP.evaluateOtp(live, "000000").reason, "wrong");
eq("a burned code is refused",
  OTP.evaluateOtp({ ...live, attempts: OTP.OTP_MAX_ATTEMPTS }, "654321").reason, "too_many");
eq("an expired code is refused",
  OTP.evaluateOtp({ ...live, expiresAt: Date.now() - 1 }, "654321").reason, "expired");
eq("a code that was never asked for is refused",
  OTP.evaluateOtp(undefined, "654321").reason, "missing");
eq("the wrong-code message counts down",
  OTP.wrongCodeMessage(2).includes("2 attempts left"), true);
eq("…in the singular when it must", OTP.wrongCodeMessage(1).includes("1 attempt left"), true);
eq("…and says so on the last try",
  OTP.wrongCodeMessage(0).includes("request a new code"), true);
eq("five wrong tries is the limit", OTP.OTP_MAX_ATTEMPTS, 5);

/* the store sweeps expired records away */
OTP.otpStore.set("old@example.com", { code: "111111", expiresAt: Date.now() - 1, attempts: 0 });
OTP.otpStore.set("burned@example.com", { code: "111111", expiresAt: Date.now() + 60_000, attempts: OTP.OTP_MAX_ATTEMPTS });
OTP.otpStore.set("live@example.com", { code: "111111", expiresAt: Date.now() + 60_000, attempts: 0 });
OTP.sweepOtps();
eq("expired codes are swept away", OTP.otpStore.has("old@example.com"), false);
eq("burned codes are swept away", OTP.otpStore.has("burned@example.com"), false);
eq("a live code is kept", OTP.otpStore.has("live@example.com"), true);
OTP.otpStore.clear();

console.log(failures === 0 ? `\nALL PASS (${checks} checks)` : `\n${failures} of ${checks} FAILED`);
process.exit(failures ? 1 : 0);
