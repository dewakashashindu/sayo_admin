"use client";

import type { ChartSpec } from "@/lib/billingReports/types";
import { moneyPlain } from "@/lib/billingReports/format";

const PALETTE = ["#15803d", "#22c55e", "#166534", "#86efac", "#4ade80", "#0f766e", "#14532d", "#a3e635"];

function shorten(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function Bars({ spec }: { spec: ChartSpec }) {
  const series = spec.series;
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const shown = labels.slice(0, 12);
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const groupW = Math.max(18, Math.min(42, 320 / Math.max(1, shown.length)));
  const barW = Math.max(6, (groupW - 4) / Math.max(1, series.length));
  const H = 160;
  const plotW = shown.length * (groupW + 8);

  return (
    <div className="br-chart bars">
      <h4>{spec.title}</h4>
      <svg width="100%" viewBox={`0 0 ${Math.max(plotW + 40, 280)} 190`} role="img">
        {ticks.map((t, i) => {
          const y = 10 + H - (t / max) * H;
          return (
            <g key={i}>
              <line x1={36} x2={plotW + 40} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={32} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{shorten(t)}</text>
            </g>
          );
        })}
        {shown.map((label, i) => (
          <g key={label} transform={`translate(${44 + i * (groupW + 8)}, 0)`}>
            {series.map((s, si) => {
              const val = s.points.find((p) => p.label === label)?.value ?? 0;
              const h = (val / max) * H;
              return (
                <rect
                  key={s.name}
                  x={si * barW}
                  y={10 + H - h}
                  width={barW - 1}
                  height={h}
                  fill={PALETTE[si % PALETTE.length]}
                >
                  <title>{`${label} · ${s.name} · ${moneyPlain(val)}`}</title>
                </rect>
              );
            })}
            <text x={groupW / 2} y={184} textAnchor="middle" fontSize="8" fill="#64748b">
              {label.length > 8 ? `${label.slice(0, 7)}…` : label}
            </text>
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
          {series.map((s, i) => (
            <span key={s.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#475569" }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], display: "inline-block" }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function HBars({ spec }: { spec: ChartSpec }) {
  const points = (spec.series[0]?.points ?? []).slice(0, 10);
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="br-chart hbars">
      <h4>{spec.title}</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {points.map((p, i) => (
          <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 130, fontSize: 11, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.label}>
              {p.label}
            </span>
            <div style={{ flex: 1, height: 14, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: `${(p.value / max) * 100}%`, height: "100%", background: PALETTE[i % PALETTE.length] }} />
            </div>
            <span style={{ width: 72, textAlign: "right", fontSize: 11, fontWeight: 700, color: "#1e3a40" }}>{moneyPlain(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pie({ spec }: { spec: ChartSpec }) {
  const points = (spec.series[0]?.points ?? []).filter((p) => p.value > 0).slice(0, 8);
  const total = points.reduce((s, p) => s + p.value, 0) || 1;
  let acc = 0;
  const cx = 70;
  const cy = 70;
  const r = 54;
  const ir = 28;
  const wedges = points.map((p, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += p.value;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const large = p.value / total > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const ix0 = cx + ir * Math.cos(a1);
    const iy0 = cy + ir * Math.sin(a1);
    const ix1 = cx + ir * Math.cos(a0);
    const iy1 = cy + ir * Math.sin(a0);
    const d = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix0} ${iy0} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`;
    return { d, color: PALETTE[i % PALETTE.length], p };
  });
  return (
    <div className="br-chart pie">
      <h4>{spec.title}</h4>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          {wedges.map((w) => (
            <path key={w.p.label} d={w.d} fill={w.color}>
              <title>{`${w.p.label} · ${moneyPlain(w.p.value)}`}</title>
            </path>
          ))}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="9" fill="#64748b">Total</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fontWeight="700" fill="#1e3a40">
            {shorten(total)}
          </text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {points.map((p, i) => (
            <span key={p.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#334155" }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], display: "inline-block" }} />
              {p.label}
              <b style={{ marginLeft: 4 }}>{((p.value / total) * 100).toFixed(0)}%</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReportCharts({ title, charts }: { title: string; charts: ChartSpec[] }) {
  if (!charts.length) return null;
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 800, color: "#1e3a40", marginBottom: 10 }}>
        {title} — charts from this report&apos;s data
      </p>
      <div className="br-charts">
        {charts.map((c) =>
          c.type === "bars" ? <Bars key={c.title} spec={c} /> :
          c.type === "hbars" ? <HBars key={c.title} spec={c} /> :
          <Pie key={c.title} spec={c} />,
        )}
      </div>
    </div>
  );
}
