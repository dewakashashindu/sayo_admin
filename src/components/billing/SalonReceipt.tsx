"use client";



export interface ReceiptLine {
  key: string;
  name: string;
  qty: number;
  price: number;
  tech?: string;
  extra?: string;
}

export interface ReceiptPay {
  id: string | number;
  label: string;
  amount: number;
}

export interface ReceiptTax {
  code: string;
  label: string;
  amount: number;
}

function money(n: number) {
  return `LKR ${Number(n || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dmy(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function Dash({ tight }: { tight?: "top" | "bottom" }) {
  const m = tight === "top" ? "8px 0 0" : tight === "bottom" ? "0 0 8px" : "14px 0";
  return <div className="rcpt-dash" style={{ margin: m }} />;
}

export default function SalonReceipt({
  billNo,
  date,
  time,
  status,
  mode,
  pax,
  cashier,
  technician,
  clientName,
  clientPhone,
  location,
  bookingID,
  lines,
  gross,
  discount,
  discountPercent,
  grossAfterDis,
  taxes,
  netTotal,
  payments,
}: {
  billNo: string;
  date: string;
  time: string;
  status: string;
  mode: string;
  pax?: number;
  cashier?: string;
  technician?: string;
  clientName: string;
  clientPhone?: string;
  location?: string;
  bookingID?: string;
  lines: ReceiptLine[];
  gross: number;
  discount: number;
  discountPercent?: number;
  grossAfterDis: number;
  taxes: ReceiptTax[];
  netTotal: number;
  payments: ReceiptPay[];
}) {
  const modeLabel = /walk/.test((mode || "").toLowerCase()) ? "WALK-IN" : "PRE-BOOKED";
  const sts = (status || "PAID").toUpperCase();
  const phone = (clientPhone || "").trim();
  const showPhone = phone && phone !== "—";

  return (
    <div className="rcpt-card print-area">
      <div className="rcpt-id">
        <img
          src="/sayologo.png"
          alt="Sayo Salon"
          width={150}
          height={75}
          style={{ objectFit: "contain", display: "block", margin: "0 auto 6px" }}
        />
        <h1>SAYO SALON</h1>
        {location ? <p className="rcpt-loc">{location}</p> : null}
      </div>

      <Dash tight="top" />
      <div className="rcpt-mode">{modeLabel}</div>
      <Dash tight="bottom" />

      <div className="rcpt-meta">
        <div className="rcpt-col">
          <div><b>INV:</b> {billNo || "—"}</div>
          <div><b>Date:</b> {dmy(date)}</div>
          {technician ? <div><b>Technician:</b> {technician}</div> : null}
          {cashier ? <div><b>Cashier:</b> {cashier}</div> : null}
          {clientName ? (
            <div style={{ wordBreak: "break-word" }}>
              <b>Customer:</b> {clientName}
              {showPhone ? (
                <>
                  {" "}
                  (<a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>)
                </>
              ) : null}
            </div>
          ) : null}
          {bookingID ? <div><b>Booking:</b> {bookingID}</div> : null}
        </div>
        <div className="rcpt-col right">
          <div><b>STS:</b> {sts}</div>
          {time ? <div><b>Time:</b> {time}</div> : null}
          <div><b>Mode:</b> {modeLabel}</div>
          {pax && pax > 0 ? <div><b>PAX:</b> {pax}</div> : null}
        </div>
      </div>

      <Dash />

      <div className="rcpt-head">
        <span>DESCRIPTION</span>
        <span>AMOUNT</span>
      </div>

      <div className="rcpt-items">
        {lines.map((line) => (
          <div className="rcpt-item" key={line.key}>
            <div className="rcpt-item-row">
              <span className="rcpt-item-name">{line.name}</span>
              <span className="rcpt-item-amt">{money(line.qty * line.price)}</span>
            </div>
            {line.qty > 0 && line.price >= 0 ? (
              <div className="rcpt-item-sub">
                {line.qty} × {money(line.price)}
              </div>
            ) : null}
            {line.tech ? <div className="rcpt-item-sub">Tech: {line.tech}</div> : null}
            {line.extra ? <div className="rcpt-item-sub">{line.extra}</div> : null}
          </div>
        ))}
      </div>

      <Dash />

      <div className="rcpt-totals">
        <div className="rcpt-tot gross">
          <span>Gross Total</span>
          <span>{money(gross)}</span>
        </div>
        {discount > 0 ? (
          <div className="rcpt-tot">
            <span>{discountPercent ? `Discount (${discountPercent} %)` : "Discount"}</span>
            <span>− {money(discount)}</span>
          </div>
        ) : null}
        {discount > 0 ? (
          <div className="rcpt-tot">
            <span>Gross After Dis.</span>
            <span>{money(grossAfterDis)}</span>
          </div>
        ) : null}
        {taxes.filter((t) => t.amount).map((t) => (
          <div className="rcpt-tot" key={t.code}>
            <span>{t.label}</span>
            <span>{money(t.amount)}</span>
          </div>
        ))}
      </div>

      <div className="rcpt-net">
        <span>NET TOTAL</span>
        <span>{money(netTotal)}</span>
      </div>

      {payments.length > 0 ? (
        <div className="rcpt-pay">
          <p>Payment Information</p>
          {payments.map((p) => (
            <div className="rcpt-pay-row" key={String(p.id)}>
              <span>{p.label}</span>
              <span>{money(p.amount)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <p className="rcpt-thanks">Thank you for visiting SAYO SALON!</p>
      <div className="rcpt-end" />
    </div>
  );
}
