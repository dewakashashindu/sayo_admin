'use client';

import React from 'react';

export interface ProviderAvailability {
  providerName:  string;
  serviceName:   string;
  isFree:        boolean;
  nextFreeSlot:  string | null;
}

export interface ConflictModalData {
  selectedSlot:   string;
  backToBackSlot: string | null;
  providers:      ProviderAvailability[];
  gapDescription: string;
}

interface Props {
  data:              ConflictModalData;
  onBookBackToBack:  (slot: string) => void;
  onBookSplit:       (selected: string, next: string) => void;
  onClose:           () => void;
}

/* ── tiny design tokens (self-contained so the modal has no external deps) ── */
const C = {
  gold:        '#B8860B',
  goldBorder:  'rgba(184,134,11,0.4)',
  goldBg:      'rgba(184,134,11,0.14)',
  white:       '#ffffff',
  whiteMuted:  'rgba(255,255,255,0.80)',
  whiteDim:    'rgba(255,255,255,0.70)',
  whiteFaint:  'rgba(255,255,255,0.35)',
  green:       '#22c55e',
  greenBg:     'rgba(34,197,94,0.14)',
  greenBorder: 'rgba(34,197,94,0.4)',
  amber:       '#f59e0b',
  amberBg:     'rgba(245,158,11,0.13)',
  amberBorder: 'rgba(245,158,11,0.55)',
  red:         '#ef4444',
  redFaint:    'rgba(239,68,68,0.75)',
  cardBg:      'rgba(20,18,15,0.97)',
  overlayBg:   'rgba(0,0,0,0.72)',
  border:      'rgba(255,255,255,0.10)',
  font:        'Inter, sans-serif',
};

const inlineStyles = `
  @keyframes modalIn {
    from { opacity:0; transform:translateY(28px) scale(0.96); }
    to   { opacity:1; transform:translateY(0)    scale(1);    }
  }
  .cm-modal { animation: modalIn 0.32s cubic-bezier(0.16,1,0.3,1) both; }
`;

export default function ConflictModal({ data, onBookBackToBack, onBookSplit, onClose }: Props) {
  const { selectedSlot, backToBackSlot, providers, gapDescription } = data;

  // Providers who are free / busy at selectedSlot
  const freeProviders = providers.filter(p =>  p.isFree);
  const busyProviders = providers.filter(p => !p.isFree);

  // Latest "next free" slot among busy providers → split target
  const splitNextSlot = busyProviders.reduce<string | null>((acc, p) => {
    if (!p.nextFreeSlot) return acc;
    if (!acc) return p.nextFreeSlot;
    return toMin(p.nextFreeSlot) > toMin(acc) ? p.nextFreeSlot : acc;
  }, null);

  const canSplit = freeProviders.length > 0 && splitNextSlot !== null;
  const canBtB   = !!backToBackSlot;

  return (
    <>
      <style>{inlineStyles}</style>

      {/* ── Overlay ── */}
      <div
        onClick={onClose}
        style={{
          position:'fixed', inset:0, zIndex:999,
          background: C.overlayBg,
          backdropFilter:'blur(4px)',
          WebkitBackdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'1rem',
        }}
      >
        {/* ── Modal card ── */}
        <div
          className="cm-modal"
          onClick={e => e.stopPropagation()}
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius:'1.25rem',
            padding:'1.5rem',
            width:'100%',
            maxWidth:'480px',
            maxHeight:'90vh',
            overflowY:'auto',
            fontFamily: C.font,
            boxShadow:'0 24px 80px rgba(0,0,0,0.6)',
            position:'relative',
          }}
        >
          {/* close button */}
          <button
            onClick={onClose}
            style={{
              position:'absolute', top:'1rem', right:'1rem',
              background:'rgba(255,255,255,0.08)', border:'none',
              borderRadius:'50%', width:'2rem', height:'2rem',
              color: C.whiteDim, cursor:'pointer', fontSize:'1rem',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}
            aria-label="Close"
          >✕</button>

          {/* ── Header ── */}
          <div style={{ marginBottom:'1.1rem' }}>
            <span style={{
              display:'inline-flex', alignItems:'center', gap:'0.35rem',
              background: C.amberBg, border:`1px solid ${C.amberBorder}`,
              borderRadius:'999px', padding:'0.18rem 0.7rem',
              fontSize:'0.63rem', fontWeight:700, letterSpacing:'0.08em',
              color: C.amber, marginBottom:'0.6rem',
            }}>
              ● Partial Availability
            </span>

            <h2 style={{ color: C.white, fontSize:'1.2rem', fontWeight:700, marginBottom:'0.35rem' }}>
              Partial Availability at{' '}
              <span style={{ color: C.amber }}>{selectedSlot}</span>
            </h2>

            {gapDescription && (
              <p style={{ color: C.whiteDim, fontSize:'0.8rem', lineHeight:1.6 }}>
                {gapDescription}
              </p>
            )}
          </div>

          {/* ════════════════════════════════════════
              OPTION A  —  Split Booking  (shown first)
          ════════════════════════════════════════ */}
          <div style={{
            border: `1.5px solid ${C.goldBorder}`,
            borderRadius:'0.875rem',
            padding:'1rem',
            marginBottom:'0.85rem',
            background: C.goldBg,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.5rem' }}>
              <span style={badgeStyle(C.gold)}>A</span>
              <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em', color: C.gold }}>
                SPLIT OPTION
              </span>
            </div>

            <p style={{ color: C.white, fontWeight:600, fontSize:'0.92rem', marginBottom:'0.3rem' }}>
              Option A: Split Booking (With Gap)
            </p>

            {canSplit ? (
              <>
                <p style={{ color: C.whiteDim, fontSize:'0.79rem', lineHeight:1.6, marginBottom:'0.75rem' }}>
                  Start your first service at{' '}
                  <strong style={{ color: C.amber }}>{selectedSlot}</strong> and continue when{' '}
                  {busyProviders.map(p => p.providerName).join(' & ')} {busyProviders.length === 1 ? 'is' : 'are'} free
                  {' '}— with a{' '}
                  <strong style={{ color: C.amber }}>
                    {toMin(splitNextSlot!) - toMin(selectedSlot)}-minute gap.
                  </strong>
                </p>

                {/* per-provider rows */}
                <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem', marginBottom:'0.85rem' }}>
                  {providers.map(p => (
                    <div key={p.providerName} style={{
                      display:'flex', alignItems:'center', gap:'0.5rem',
                      fontSize:'0.79rem', color: C.whiteMuted,
                    }}>
                      {p.isFree
                        ? <span style={{ color: C.green, fontSize:'0.85rem' }}>✔</span>
                        : <span style={{ fontSize:'0.85rem' }}>⏳</span>
                      }
                      <span>
                        <strong style={{ color: C.white }}>{p.providerName}</strong>
                        {p.serviceName ? ` (${p.serviceName})` : ''}
                        {': '}
                        {p.isFree
                          ? <span style={{ color: C.green }}>Available at {selectedSlot}</span>
                          : <span style={{ color: C.amber }}>Next free at {p.nextFreeSlot}</span>
                        }
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => onBookSplit(selectedSlot, splitNextSlot!)}
                  style={outlineBtn(C.gold)}
                >
                  Book as Split Visit ({selectedSlot} &amp; {splitNextSlot})
                </button>
              </>
            ) : (
              <p style={{ color: C.whiteFaint, fontSize:'0.78rem' }}>
                No split option available — both providers are busy at this slot.
              </p>
            )}
          </div>

          {/* ════════════════════════════════════════
              OPTION B  —  Back-to-Back  (shown second)
          ════════════════════════════════════════ */}
          <div style={{
            border: `1.5px solid ${C.greenBorder}`,
            borderRadius:'0.875rem',
            padding:'1rem',
            marginBottom:'0.85rem',
            background: C.greenBg,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.5rem' }}>
              <span style={badgeStyle(C.green)}>B</span>
              <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em', color: C.green }}>
                RECOMMENDED
              </span>
            </div>

            <p style={{ color: C.white, fontWeight:600, fontSize:'0.92rem', marginBottom:'0.3rem' }}>
              Option B: Continuous / Back-to-Back Visit
            </p>

            {canBtB ? (
              <>
                <p style={{ color: C.whiteDim, fontSize:'0.79rem', lineHeight:1.6, marginBottom:'0.85rem' }}>
                  Do all services in one go with no waiting time starting at{' '}
                  <strong style={{ color: C.green }}>{backToBackSlot}</strong>.
                  All {providers.length} providers will be free and ready.
                </p>

                <button
                  onClick={() => onBookBackToBack(backToBackSlot!)}
                  style={solidBtn(C.green)}
                >
                  ✓ Book All at {backToBackSlot} (Recommended)
                </button>
              </>
            ) : (
              <p style={{ color: C.whiteFaint, fontSize:'0.78rem' }}>
                No back-to-back slot available for all providers today.
              </p>
            )}
          </div>

          {/* ── Footer ── */}
          <button
            onClick={onClose}
            style={{
              width:'100%', padding:'0.7rem',
              background:'rgba(255,255,255,0.05)',
              border:`1px solid ${C.border}`,
              borderRadius:'0.625rem', color: C.whiteFaint,
              fontSize:'0.8rem', cursor:'pointer', fontFamily: C.font,
            }}
          >
            ← Choose a different date or time
          </button>
        </div>
      </div>
    </>
  );
}

/* ── helpers ── */
function toMin(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10), p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + mn;
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    width:'1.4rem', height:'1.4rem', borderRadius:'50%',
    background: color, color:'#fff',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:'0.72rem', fontWeight:700, flexShrink:0,
  };
}

function solidBtn(color: string): React.CSSProperties {
  return {
    width:'100%', padding:'0.78rem',
    background: color, border:'none',
    borderRadius:'0.625rem', color:'#fff',
    fontWeight:700, fontSize:'0.87rem',
    cursor:'pointer', fontFamily:'Inter, sans-serif',
    boxShadow:`0 4px 20px ${color}55`,
  };
}

function outlineBtn(color: string): React.CSSProperties {
  return {
    width:'100%', padding:'0.78rem',
    background:'transparent',
    border:`1.5px solid ${color}`,
    borderRadius:'0.625rem', color,
    fontWeight:700, fontSize:'0.87rem',
    cursor:'pointer', fontFamily:'Inter, sans-serif',
  };
}