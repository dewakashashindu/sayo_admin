"use client";

import { useEffect, useState } from "react";
import { MOCK_LOCATIONS, MOCK_PAY_MODES } from "@/lib/billingReports/mock";
import { DatePreset, presetRange } from "@/lib/billingReports/dates";
import type { ReportDef } from "@/lib/billingReports/types";

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "year", label: "This Year" },
  { id: "last30", label: "Last 30 Days" },
];

export interface AppliedRange {
  from: string;
  to: string;
  loc: string;
  pm: string;
}

export default function DateRangeModal({
  open,
  report,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  report: ReportDef;
  initial: AppliedRange;
  onClose: () => void;
  onApply: (next: AppliedRange) => void;
}) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [loc, setLoc] = useState(initial.loc);
  const [pm, setPm] = useState(initial.pm || MOCK_PAY_MODES[0].payCode);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setFrom(initial.from);
    setTo(initial.to);
    setLoc(initial.loc);
    setPm(initial.pm || MOCK_PAY_MODES[0].payCode);
    setErr("");
  }, [open, initial.from, initial.to, initial.loc, initial.pm]);

  if (!open) return null;

  function applyPreset(id: DatePreset) {
    const r = presetRange(id);
    setFrom(r.from);
    setTo(r.to);
    setErr("");
  }

  function submit() {
    if (!from || !to) {
      setErr("Please select both From and To dates");
      return;
    }
    if (from > to) {
      setErr("'From' date must be before or equal to 'To' date");
      return;
    }
    onApply({
      from,
      to,
      loc,
      pm: report.extraFilter === "payMode" ? pm : "",
    });
  }

  return (
    <div className="br-modal-bg" onClick={onClose} role="presentation">
      <div className="br-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h2>Select Date Range</h2>
            <p className="rep">{report.navLabel}</p>
          </div>
          <button className="br-x" type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {PRESETS.map((p) => (
            <button key={p.id} className="br-chip" type="button" onClick={() => applyPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="br-field">
            Location
            <select value={loc} onChange={(e) => setLoc(e.target.value)}>
              <option value="">All Locations</option>
              {MOCK_LOCATIONS.map((l) => (
                <option key={l.locCode} value={l.locCode}>{l.locCode} — {l.locName}</option>
              ))}
            </select>
          </label>

          {report.extraFilter === "payMode" && (
            <label className="br-field">
              Pay Mode
              <select value={pm} onChange={(e) => setPm(e.target.value)}>
                {MOCK_PAY_MODES.map((m) => (
                  <option key={m.payCode} value={m.payCode}>{m.payCode} — {m.payDes}</option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label className="br-field">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="br-field">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>

        {err && <p className="br-err" style={{ marginTop: 12 }}>{err}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="br-cancel" type="button" onClick={onClose}>Cancel</button>
          <button className="br-view" type="button" onClick={submit}>View Report</button>
        </div>
      </div>
    </div>
  );
}
