'use client';

import React from 'react';
import type { SlotResult } from '../lib/slotEvaluator';
import { t, svc as svcName, type Lang } from '@/i18n/translations';

/* ─────────────────────────────────────────────────────────────────────────────
   RE-EXPORTED LEGACY TYPES
───────────────────────────────────────────────────────────────────────────── */
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
  slotResult?:    SlotResult;
  serviceNames?:  string[];
}

interface Props {
  data:             ConflictModalData;
  onBookBackToBack: (slot: string) => void;
  onBookSplit:              (selected: string, next: string) => void;
  onBookSwapped:            (slot: string) => void;
  onClose:                  () => void;
  lang?:                    Lang; // <- current UI language (defaults to English)
}

/* ─────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────────────────────────────────────── */
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
  purple:      '#a855f7',
  purpleBg:    'rgba(168,85,247,0.13)',
  purpleBorder:'rgba(168,85,247,0.45)',
  gapColor:    '#f97316',
  gapBg:       'rgba(249,115,22,0.13)',
  gapBorder:   'rgba(249,115,22,0.45)',
  red:         '#ef4444',
  cardBg:      'rgba(20,18,15,0.97)',
  overlayBg:   'rgba(0,0,0,0.72)',
  border:      'rgba(255,255,255,0.10)',
  font:        'Inter, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif',
};

const css = `
  @keyframes modalIn {
    from { opacity:0; transform:translateY(28px) scale(0.96); }
    to   { opacity:1; transform:translateY(0)    scale(1);    }
  }
  .cm-modal  { animation: modalIn 0.32s cubic-bezier(0.16,1,0.3,1) both; }
  .cm-option { border-radius:0.875rem; padding:1rem; margin-bottom:0.85rem; transition: box-shadow 0.2s; }
  .cm-option:last-of-type { margin-bottom:0; }
  .cm-arrow  { display:flex; align-items:center; gap:0.4rem; font-size:0.8rem; font-weight:600; color:${C.whiteMuted}; flex-wrap:wrap; }
  .cm-arrow-svc { background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12); border-radius:0.375rem; padding:0.22rem 0.6rem; font-size:0.75rem; font-family:${C.font}; }
  .cm-arrow-icon { color:${C.whiteFaint}; font-size:0.85rem; flex-shrink:0; }
  .seq-row { display:flex; align-items:center; gap:0.4rem; font-size:0.79rem; color:${C.whiteMuted}; margin-bottom:0.28rem; }

  .cm-gap-pill {
    display:inline-flex; align-items:center; gap:0.28rem;
    background:rgba(249,115,22,0.18); border:1px solid rgba(249,115,22,0.5);
    border-radius:999px; padding:0.18rem 0.55rem;
    font-size:0.68rem; font-weight:700; letter-spacing:0.05em;
    color:${C.gapColor};
  }
`;

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function ConflictModal({
  data,
  onBookBackToBack,
  onBookSplit,
  onBookSwapped,
  onClose,
  lang = 'en',
}: Props) {
  const {
    selectedSlot,
    backToBackSlot,
    providers,
    gapDescription,
    slotResult,
    serviceNames = [],
  } = data;

  const sr = slotResult;

  /* ── Legacy split logic ── */
  const freeProviders = providers.filter(p =>  p.isFree);
  const busyProviders = providers.filter(p => !p.isFree);
  const splitNextSlot = busyProviders.reduce<string | null>((acc, p) => {
    if (!p.nextFreeSlot) return acc;
    if (!acc) return p.nextFreeSlot;
    return toMin(p.nextFreeSlot) > toMin(acc) ? p.nextFreeSlot : acc;
  }, null);
  const canSplit = freeProviders.length > 0 && splitNextSlot !== null;
  const canBtB   = !!backToBackSlot;

  /* ── New-mode flags ── */
  const hasSwap            = sr?.isSequenceSwapped && !!sr.swappedDetails;
  const hasRecommendedTime = !!sr?.recommendedOriginalTime;
  const useNewMode         = !!sr;

  /* ── Gap values from swappedDetails ── */
  const gapMinutes: number   = sr?.swappedDetails?.gapMinutes  ?? 0;
  const nextFreeTime: string = sr?.swappedDetails?.nextFreeTime ?? '';

  /* ── Derived display booleans ── */
  const hasGap = gapMinutes > 0;

  const opt1Color   = hasGap ? C.gapColor    : C.purple;
  const opt1Bg      = hasGap ? C.gapBg       : C.purpleBg;
  const opt1Border  = hasGap ? C.gapBorder   : C.purpleBorder;

  /* ── Sequence display helpers (raw English names from data) ── */
  const originalOrder = serviceNames;

  const swappedOrder: string[] =
    sr?.swappedDetails?.orderedServices ??
    (serviceNames.length === 2 ? [serviceNames[1], serviceNames[0]] : serviceNames);

  // Translated "A → B → C" label for the button
  const swapArrowLabel = swappedOrder.map(n => svcName(lang, n)).join(' → ');

  /* ── Dynamic label & badge text for Option 1 ── */
  const opt1HeaderLabel = t(lang, hasGap ? 'cm.seqSwapWait' : 'cm.seqSwapZero', { mins: gapMinutes });
  const opt1BadgeLabel  = t(lang, hasGap ? 'cm.newOrderGap' : 'cm.newOrderSeamless');

  /* ── Header title parts (word order differs per language) ── */
  const notFreeA = t(lang, 'cm.notFullyFreeA'); // English: "Not fully free at"  | si/ta: ""
  const notFreeB = t(lang, 'cm.notFullyFreeB'); // English: ""                   | si/ta: suffix

  /* ── "Why?" explanation sentence ── */
  const whySentence = (() => {
    if (!sr?.swappedDetails) return sr?.swappedDetails?.reason ?? '';

    const svc1 = swappedOrder[0] ? svcName(lang, swappedOrder[0]) : t(lang, 'cm.yourFirstService');
    const svc2 = swappedOrder[1] ? svcName(lang, swappedOrder[1]) : t(lang, 'cm.yourSecondService');
    const prov2Name = (() => {
      const perm = sr.swappedDetails!.permutation;
      if (perm.length >= 2 && providers.length > 0) {
        return providers[perm[1]]?.providerName ?? '';
      }
      return '';
    })();

    if (hasGap) {
      const provLabel = prov2Name || t(lang, 'cm.yourNextProvider');
      const timeLabel = nextFreeTime || t(lang, 'cm.aMomentLater');
      return t(lang, 'cm.whyGap', {
        svc1, svc2, prov: provLabel, slot: selectedSlot, time: timeLabel, mins: gapMinutes,
      });
    }

    // Zero-gap: keep the evaluator's reason string in English; otherwise build
    // a fully translated sentence.
    if (lang === 'en' && sr.swappedDetails!.reason) return sr.swappedDetails!.reason;
    return t(lang, 'cm.whySeamless', { svc1, svc2 });
  })();

  return (
    <>
      <style>{css}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position:'fixed', inset:0, zIndex:999,
          background: C.overlayBg,
          backdropFilter:'blur(4px)', WebkitBackdropFilter:'blur(4px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:'1rem',
        }}
      >
        {/* Modal card */}
        <div
          className="cm-modal"
          onClick={e => e.stopPropagation()}
          style={{
            background: C.cardBg,
            border:`1px solid ${C.border}`,
            borderRadius:'1.25rem',
            padding:'1.5rem',
            width:'100%', maxWidth:'500px',
            maxHeight:'90vh', overflowY:'auto',
            fontFamily: C.font,
            boxShadow:'0 24px 80px rgba(0,0,0,0.6)',
            position:'relative',
          }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              position:'absolute', top:'1rem', right:'1rem',
              background:'rgba(255,255,255,0.08)', border:'none',
              borderRadius:'50%', width:'2rem', height:'2rem',
              color: C.whiteDim, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'0.9rem',
            }}
            aria-label={t(lang, 'cm.closeAria')}
          >✕</button>

          {/* ── Header ── */}
          <div style={{ marginBottom:'1.1rem', paddingRight:'2.5rem' }}>
            <span style={{
              display:'inline-flex', alignItems:'center', gap:'0.35rem',
              background: C.amberBg, border:`1px solid ${C.amberBorder}`,
              borderRadius:'999px', padding:'0.18rem 0.7rem',
              fontSize:'0.63rem', fontWeight:700, letterSpacing:'0.08em',
              color: C.amber, marginBottom:'0.6rem',
            }}>
              ● {t(lang, 'cm.partialAvailability')}
            </span>
            <h2 style={{ color: C.white, fontSize:'1.15rem', fontWeight:700, marginBottom:'0.3rem', lineHeight:1.3 }}>
              {notFreeA && <>{notFreeA}{' '}</>}
              <span style={{ color: C.amber }}>{selectedSlot}</span>
              {notFreeB && <>{' '}{notFreeB}</>}
            </h2>
            {gapDescription && (
              <p style={{ color: C.whiteDim, fontSize:'0.79rem', lineHeight:1.65 }}>
                {gapDescription}
              </p>
            )}
          </div>

          <div style={{ height:'1px', background:'rgba(255,255,255,0.08)', marginBottom:'1rem' }}/>

          {/* ════════════════════════════════════════════════
              NEW MODE — Option 1: Sequence Swap (any N providers)
          ════════════════════════════════════════════════ */}
          {useNewMode && hasSwap && sr!.swappedDetails && (
            <div className="cm-option" style={{ border:`1.5px solid ${opt1Border}`, background: opt1Bg }}>

              {/* ── Option header row ── */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.6rem' }}>
                <Circle color={opt1Color} label="1"/>
                <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em', color: opt1Color }}>
                  {opt1HeaderLabel}
                </span>
              </div>

              {/* ── Subtitle ── */}
              <p style={{ color: C.white, fontWeight:600, fontSize:'0.91rem', marginBottom:'0.32rem' }}>
                {t(lang, 'cm.reorderA', { slot: selectedSlot })}
              </p>

              {/* ── Service order comparison ── */}
              <div style={{ marginBottom:'0.75rem' }}>

                {/* Original order (strikethrough) */}
                <div style={{ marginBottom:'0.4rem' }}>
                  <span style={{ fontSize:'0.66rem', color: C.whiteFaint, letterSpacing:'0.08em', fontWeight:600 }}>
                    {t(lang, 'cm.originalOrder')}
                  </span>
                  <div className="cm-arrow" style={{ marginTop:'0.25rem', opacity:0.45 }}>
                    {originalOrder.map((svc, i) => (
                      <React.Fragment key={`orig-${i}`}>
                        <span className="cm-arrow-svc" style={{ textDecoration:'line-through', color: C.whiteFaint }}>
                          {svcName(lang, svc)}
                        </span>
                        {i < originalOrder.length - 1 && <span className="cm-arrow-icon">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Winning permutation order */}
                <div>
                  <span style={{ fontSize:'0.66rem', color: opt1Color, letterSpacing:'0.08em', fontWeight:700 }}>
                    {opt1BadgeLabel}
                  </span>
                  <div className="cm-arrow" style={{ marginTop:'0.25rem' }}>
                    {swappedOrder.map((svc, i) => (
                      <React.Fragment key={`swap-${i}`}>
                        <span
                          className="cm-arrow-svc"
                          style={{
                            color: C.white,
                            borderColor: hasGap ? 'rgba(249,115,22,0.4)' : 'rgba(168,85,247,0.4)',
                            background:  hasGap ? 'rgba(249,115,22,0.12)' : 'rgba(168,85,247,0.12)',
                          }}
                        >
                          {svcName(lang, svc)}
                        </span>
                        {i < swappedOrder.length - 1 && (
                          <>
                            <span className="cm-arrow-icon" style={{ color: opt1Color }}>→</span>
                            {hasGap && i === 0 && (
                              <span className="cm-gap-pill">
                                ⏳ {t(lang, 'cm.minWait', { mins: gapMinutes })}
                              </span>
                            )}
                          </>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Why? explanation ── */}
              <p style={{
                fontSize:'0.74rem', color: C.whiteDim, lineHeight:1.6,
                background: hasGap ? 'rgba(249,115,22,0.07)' : 'rgba(168,85,247,0.07)',
                border:`1px solid ${hasGap ? 'rgba(249,115,22,0.2)' : 'rgba(168,85,247,0.2)'}`,
                borderRadius:'0.5rem', padding:'0.5rem 0.7rem', marginBottom:'0.85rem',
              }}>
                <span style={{ color: C.amber }}>{t(lang, 'cm.why')}</span>{' '}
                {whySentence}
              </p>

              {/* ── CTA button ── */}
              <button onClick={() => onBookSwapped(selectedSlot)} style={solidBtn(opt1Color)}>
                {hasGap
                  ? t(lang, 'cm.bookWithGap', { slot: selectedSlot })
                  : <>{t(lang, 'cm.bookAsPrefix')}{swapArrowLabel}{t(lang, 'cm.bookAsMid')}{selectedSlot}{t(lang, 'cm.bookAsSuffix')}</>}
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              NEW MODE — Option 2: Recommended Original Time
          ════════════════════════════════════════════════ */}
          {useNewMode && hasRecommendedTime && (
            <div className="cm-option" style={{ border:`1.5px solid ${C.greenBorder}`, background: C.greenBg }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.6rem' }}>
                <Circle color={C.green} label={hasSwap ? '2' : '1'}/>
                <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em', color: C.green }}>
                  {t(lang, 'cm.recOriginal')}
                </span>
              </div>

              <p style={{ color: C.white, fontWeight:600, fontSize:'0.91rem', marginBottom:'0.3rem' }}>
                {t(lang, 'cm.shiftA') && <>{t(lang, 'cm.shiftA')}{' '}</>}
                <span style={{ color: C.green }}>{sr!.recommendedOriginalTime}</span>
                {t(lang, 'cm.shiftB')}
              </p>

              <div className="cm-arrow" style={{ marginBottom:'0.75rem' }}>
                {originalOrder.map((svc, i) => (
                  <React.Fragment key={`rec-${i}`}>
                    <span className="cm-arrow-svc" style={{ color: C.white, borderColor:'rgba(34,197,94,0.35)', background:'rgba(34,197,94,0.1)' }}>
                      {svcName(lang, svc)}
                    </span>
                    {i < originalOrder.length - 1 && (
                      <span className="cm-arrow-icon" style={{ color: C.green }}>→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <p style={{ fontSize:'0.74rem', color: C.whiteDim, lineHeight:1.6, marginBottom:'0.85rem' }}>
                {t(lang, 'cm.allFreeAt', { time: sr!.recommendedOriginalTime! })}
              </p>

              <button onClick={() => onBookBackToBack(sr!.recommendedOriginalTime!)} style={solidBtn(C.green)}>
                {t(lang, 'cm.bookOriginalAt', { time: sr!.recommendedOriginalTime! })}
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              LEGACY MODE — single-provider / old flow fallback
          ════════════════════════════════════════════════ */}
          {!useNewMode && (
            <>
              {/* Option A: Split */}
              <div className="cm-option" style={{ border:`1.5px solid ${C.goldBorder}`, background: C.goldBg }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.5rem' }}>
                  <Circle color={C.gold} label="A"/>
                  <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em', color: C.gold }}>{t(lang, 'cm.splitOption')}</span>
                </div>
                <p style={{ color: C.white, fontWeight:600, fontSize:'0.92rem', marginBottom:'0.3rem' }}>
                  {t(lang, 'cm.optionA')}
                </p>
                {canSplit ? (
                  <>
                    <p style={{ color: C.whiteDim, fontSize:'0.79rem', lineHeight:1.6, marginBottom:'0.75rem' }}>
                      {t(lang, 'cm.splitDesc', {
                        slot:  selectedSlot,
                        names: busyProviders.map(p => p.providerName).join(' & '),
                        isAre: busyProviders.length === 1 ? 'is' : 'are', // (English only)
                        mins:  toMin(splitNextSlot!) - toMin(selectedSlot),
                      })}
                    </p>
                    {providers.map(p => (
                      <div key={p.providerName} className="seq-row">
                        <span>{p.isFree ? '✔' : '⏳'}</span>
                        <span>
                          <strong style={{ color: C.white }}>{p.providerName}</strong>
                          {p.serviceName ? ` (${svcName(lang, p.serviceName)})` : ''}: {' '}
                          {p.isFree
                            ? <span style={{ color: C.green }}>{t(lang, 'cm.availableAt', { slot: selectedSlot })}</span>
                            : <span style={{ color: C.amber }}>{t(lang, 'cm.nextFreeAt', { slot: p.nextFreeSlot! })}</span>
                          }
                        </span>
                      </div>
                    ))}
                    <button
                      style={{ ...outlineBtn(C.gold), marginTop:'0.85rem' }}
                      onClick={() => onBookSplit(selectedSlot, splitNextSlot!)}
                    >
                      {t(lang, 'cm.bookSplitVisit', { slot1: selectedSlot, slot2: splitNextSlot! })}
                    </button>
                  </>
                ) : (
                  <p style={{ color: C.whiteFaint, fontSize:'0.78rem' }}>
                    {t(lang, 'cm.noSplit')}
                  </p>
                )}
              </div>

              {/* Option B: Back-to-back */}
              <div className="cm-option" style={{ border:`1.5px solid ${C.greenBorder}`, background: C.greenBg }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginBottom:'0.5rem' }}>
                  <Circle color={C.green} label="B"/>
                  <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em', color: C.green }}>{t(lang, 'cm.recommended')}</span>
                </div>
                <p style={{ color: C.white, fontWeight:600, fontSize:'0.92rem', marginBottom:'0.3rem' }}>
                  {t(lang, 'cm.optionB')}
                </p>
                {canBtB ? (
                  <>
                    <p style={{ color: C.whiteDim, fontSize:'0.79rem', lineHeight:1.6, marginBottom:'0.85rem' }}>
                      {t(lang, 'cm.allInOneGo', { slot: backToBackSlot!, n: providers.length })}
                    </p>
                    <button style={solidBtn(C.green)} onClick={() => onBookBackToBack(backToBackSlot!)}>
                      {t(lang, 'cm.bookAllAt', { slot: backToBackSlot! })}
                    </button>
                  </>
                ) : (
                  <p style={{ color: C.whiteFaint, fontSize:'0.78rem' }}>
                    {t(lang, 'cm.noBackToBack')}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Footer ── */}
          <div style={{ height:'1px', background:'rgba(255,255,255,0.07)', margin:'1rem 0 0.85rem' }}/>
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
            {t(lang, 'cm.chooseDifferent')}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   LOCAL HELPERS
───────────────────────────────────────────────────────────────────────────── */
function toMin(t: string): number {
  const m = t.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10), p = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return h * 60 + mn;
}

function Circle({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      width:'1.4rem', height:'1.4rem', borderRadius:'50%',
      background: color, color:'#fff',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:'0.72rem', fontWeight:700, flexShrink:0,
    }}>
      {label}
    </div>
  );
}

function solidBtn(color: string): React.CSSProperties {
  return {
    width:'100%', padding:'0.78rem',
    background: color, border:'none',
    borderRadius:'0.625rem', color:'#fff',
    fontWeight:700, fontSize:'0.87rem',
    cursor:'pointer', fontFamily:'Inter, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif',
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
    cursor:'pointer', fontFamily:'Inter, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif',
  };
}
