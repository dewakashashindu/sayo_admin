'use client';

import React from 'react';
import type { SlotResult } from '../lib/slotEvaluator';
import { t, svc as svcName, type Lang } from '@/i18n/translations';

/* ─────────────────────────────────────────────────────────────────────────────
   RE-EXPORTED LEGACY TYPES  (kept for callers that still pass the old shape)
───────────────────────────────────────────────────────────────────────────── */
export interface ProviderAvailability {
  providerName: string;
  serviceName:  string;
  isFree:       boolean;
  nextFreeSlot: string | null;
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
  onBookSplit:      (selected: string, next: string) => void;
  onBookSwapped:    (slot: string) => void;
  onClose:          () => void;
  lang?:            Lang;
}

/* ─────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────────────────────────────────────── */
const C = {
  gold:         '#B8860B',
  goldBorder:   'rgba(184,134,11,0.4)',
  goldBg:       'rgba(184,134,11,0.14)',
  white:        '#ffffff',
  whiteMuted:   'rgba(255,255,255,0.80)',
  whiteDim:     'rgba(255,255,255,0.70)',
  whiteFaint:   'rgba(255,255,255,0.35)',
  green:        '#22c55e',
  greenBg:      'rgba(34,197,94,0.14)',
  greenBorder:  'rgba(34,197,94,0.4)',
  amber:        '#f59e0b',
  amberBg:      'rgba(245,158,11,0.13)',
  amberBorder:  'rgba(245,158,11,0.55)',
  purple:       '#a855f7',
  purpleBg:     'rgba(168,85,247,0.13)',
  purpleBorder: 'rgba(168,85,247,0.45)',
  gapColor:     '#f97316',
  gapBg:        'rgba(249,115,22,0.13)',
  gapBorder:    'rgba(249,115,22,0.45)',
  red:          '#ef4444',
  cardBg:       'rgba(20,18,15,0.97)',
  overlayBg:    'rgba(0,0,0,0.72)',
  border:       'rgba(255,255,255,0.10)',
  font:         'Inter, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif',
} as const;

const css = `
  @keyframes modalIn {
    from { opacity:0; transform:translateY(28px) scale(0.96); }
    to   { opacity:1; transform:translateY(0)    scale(1);    }
  }
  .cm-modal  { animation: modalIn 0.32s cubic-bezier(0.16,1,0.3,1) both; }
  .cm-option { border-radius:0.875rem; padding:1rem; margin-bottom:0.85rem; transition:box-shadow 0.2s; }
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
  .cm-slots-pill {
    display:inline-flex; align-items:center; gap:0.28rem;
    background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4);
    border-radius:999px; padding:0.18rem 0.6rem;
    font-size:0.68rem; font-weight:600;
    color:${C.amber}; margin-right:0.25rem; margin-bottom:0.2rem;
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

  /* ── Legacy split helpers ── */
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

  /* ── Rule 4: gap-only (no swap, waiting time in original order) ── */
  const gapOnly = sr?.gapOnlyDetails;
  const hasGapOnly = !!gapOnly && !hasSwap;

  /* ── Swap gap values ── */
  const swapGapMinutes: number = sr?.swappedDetails?.gapMinutes ?? 0;
  const swapNextFree: string   = sr?.swappedDetails?.nextFreeTime ?? '';
  const hasSwapGap             = swapGapMinutes > 0;

  /* ── Option-1 colours (swap card) ── */
  const opt1Color  = hasSwapGap ? C.gapColor    : C.purple;
  const opt1Bg     = hasSwapGap ? C.gapBg       : C.purpleBg;
  const opt1Border = hasSwapGap ? C.gapBorder   : C.purpleBorder;

  /* ── Service order labels ── */
  const originalOrder = serviceNames;
  const swappedOrder: string[] =
    sr?.swappedDetails?.orderedServices ??
    (serviceNames.length === 2 ? [serviceNames[1], serviceNames[0]] : serviceNames);
  const swapArrowLabel = swappedOrder.map(n => svcName(lang, n)).join(' → ');

  /* ── Option-1 header labels ── */
  const opt1HeaderLabel = t(lang, hasSwapGap ? 'cm.seqSwapWait' : 'cm.seqSwapZero', { mins: swapGapMinutes });
  const opt1BadgeLabel  = t(lang, hasSwapGap ? 'cm.newOrderGap' : 'cm.newOrderSeamless');

  /* ── Header i18n ── */
  const notFreeA = t(lang, 'cm.notFullyFreeA');
  const notFreeB = t(lang, 'cm.notFullyFreeB');

  /* ───────────────────────────────────────────────────────────────────────────
     "WHY?" SENTENCE BUILDER
     Rule 2 (seamless swap):
       "Your original order isn't possible, but you can do [X] first, then [Y]
        seamlessly. Alternatively, you can start at [T] to keep your original order."
     Rule 3 (swap + gap):
       "Your original order isn't possible. You can do [X] first, then [Y], but
        you will have a N-minute waiting gap because [Provider] is busy until [T].
        Alternatively, you can start at [T2] to keep your original order."
     Rule 4 (gap only, no swap):
       "You can book this time, but you will have a N-minute waiting gap because
        [Provider] is busy until [T]."
  ─────────────────────────────────────────────────────────────────────────── */
  const whySentence = ((): string => {
    if (sr?.swappedDetails) {
      const svc1     = swappedOrder[0] ? svcName(lang, swappedOrder[0]) : t(lang, 'cm.yourFirstService');
      const svc2     = swappedOrder[1] ? svcName(lang, swappedOrder[1]) : t(lang, 'cm.yourSecondService');
      const perm     = sr.swappedDetails.permutation;
      const prov2Name =
        perm.length >= 2 && providers.length > 0
          ? (providers[perm[1]]?.providerName ?? '')
          : '';

      if (hasSwapGap) {
        // Rule 3 – swap + gap
        const provLabel  = prov2Name || t(lang, 'cm.yourNextProvider');
        const timeLabel  = swapNextFree || t(lang, 'cm.aMomentLater');
        const altTime    = sr.recommendedOriginalTime;
        const baseText   = t(lang, 'cm.whyGap', {
          svc1, svc2, prov: provLabel, slot: selectedSlot, time: timeLabel, mins: swapGapMinutes,
        });
        if (altTime) {
          return `${baseText} ${t(lang, 'cm.alternatively', { time: altTime })}`;
        }
        return baseText;
      }

      // Rule 2 – seamless swap
      const altTime  = sr.recommendedOriginalTime;
      const baseText =
        lang === 'en' && sr.swappedDetails.reason
          ? sr.swappedDetails.reason
          : t(lang, 'cm.whySeamless', { svc1, svc2 });
      if (altTime) {
        return `${baseText} ${t(lang, 'cm.alternatively', { time: altTime })}`;
      }
      return baseText;
    }

    if (gapOnly) {
      // Rule 4 – no swap, original order with waiting gap
      return t(lang, 'cm.whyGapOnly', {
        mins: gapOnly.gapMinutes,
        prov: gapOnly.busyProvider,
        time: gapOnly.busyUntil,
      });
    }

    return '';
  })();

  /* ─────────────────────────────────────────────────────────────────────────
     R5 – Occupied slot pills rendered in the modal header so the customer
     can see exactly which grid cells will be consumed.
  ───────────────────────────────────────────────────────────────────────── */
  const occupiedSlots: string[] = sr?.occupiedSlots ?? [];

  return (
    <>
      <style>{css}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: C.overlayBg,
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
      >
        {/* Modal card */}
        <div
          className="cm-modal"
          onClick={e => e.stopPropagation()}
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: '1.25rem',
            padding: '1.5rem',
            width: '100%', maxWidth: '500px',
            maxHeight: '90vh', overflowY: 'auto',
            fontFamily: C.font,
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            position: 'relative',
          }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'rgba(255,255,255,0.08)', border: 'none',
              borderRadius: '50%', width: '2rem', height: '2rem',
              color: C.whiteDim, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.9rem',
            }}
            aria-label={t(lang, 'cm.closeAria')}
          >✕</button>

          {/* ── Header ── */}
          <div style={{ marginBottom: '1.1rem', paddingRight: '2.5rem' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              background: C.amberBg, border: `1px solid ${C.amberBorder}`,
              borderRadius: '999px', padding: '0.18rem 0.7rem',
              fontSize: '0.63rem', fontWeight: 700, letterSpacing: '0.08em',
              color: C.amber, marginBottom: '0.6rem',
            }}>
              ● {t(lang, 'cm.partialAvailability')}
            </span>

            <h2 style={{ color: C.white, fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.3rem', lineHeight: 1.3 }}>
              {notFreeA && <>{notFreeA}{' '}</>}
              <span style={{ color: C.amber }}>{selectedSlot}</span>
              {notFreeB && <>{' '}{notFreeB}</>}
            </h2>

            {gapDescription && (
              <p style={{ color: C.whiteDim, fontSize: '0.79rem', lineHeight: 1.65 }}>
                {gapDescription}
              </p>
            )}

            {/* R5 – Booked slots indicator
                "Me deka thama oya book kale kiyala pennanna"
                These are the exact time slots your booking will occupy. */}
            {occupiedSlots.length > 0 && (
              <div style={{ marginTop: '0.6rem' }}>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em',
                  color: C.whiteFaint, display: 'block', marginBottom: '0.3rem',
                }}>
                  {t(lang, 'cm.slotsOccupied')}
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {occupiedSlots.map((s, i) => (
                    <span key={`occ-${i}`} className="cm-slots-pill">🕐 {s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', marginBottom: '1rem' }} />

          {/* ════════════════════════════════════════════════════════════════
              NEW MODE — Option 1a: Sequence Swap, NO gap (Rule R2)
              NEW MODE — Option 1b: Sequence Swap, WITH gap (Rule R3)
          ════════════════════════════════════════════════════════════════ */}
          {useNewMode && hasSwap && sr!.swappedDetails && (
            <div className="cm-option" style={{ border: `1.5px solid ${opt1Border}`, background: opt1Bg }}>

              {/* ── Option header row ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                <Circle color={opt1Color} label="1" />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: opt1Color }}>
                  {opt1HeaderLabel}
                </span>
              </div>

              {/* ── Subtitle ── */}
              <p style={{ color: C.white, fontWeight: 600, fontSize: '0.91rem', marginBottom: '0.32rem' }}>
                {t(lang, 'cm.reorderA', { slot: selectedSlot })}
              </p>

              {/* ── Service order comparison ── */}
              <div style={{ marginBottom: '0.75rem' }}>
                {/* Original order (dimmed/strikethrough) */}
                <div style={{ marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.66rem', color: C.whiteFaint, letterSpacing: '0.08em', fontWeight: 600 }}>
                    {t(lang, 'cm.originalOrder')}
                  </span>
                  <div className="cm-arrow" style={{ marginTop: '0.25rem', opacity: 0.45 }}>
                    {originalOrder.map((svc, i) => (
                      <React.Fragment key={`orig-${i}`}>
                        <span className="cm-arrow-svc" style={{ textDecoration: 'line-through', color: C.whiteFaint }}>
                          {svcName(lang, svc)}
                        </span>
                        {i < originalOrder.length - 1 && <span className="cm-arrow-icon">→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Winning permutation */}
                <div>
                  <span style={{ fontSize: '0.66rem', color: opt1Color, letterSpacing: '0.08em', fontWeight: 700 }}>
                    {opt1BadgeLabel}
                  </span>
                  <div className="cm-arrow" style={{ marginTop: '0.25rem' }}>
                    {swappedOrder.map((svc, i) => (
                      <React.Fragment key={`swap-${i}`}>
                        <span
                          className="cm-arrow-svc"
                          style={{
                            color: C.white,
                            borderColor: hasSwapGap ? 'rgba(249,115,22,0.4)' : 'rgba(168,85,247,0.4)',
                            background:  hasSwapGap ? 'rgba(249,115,22,0.12)' : 'rgba(168,85,247,0.12)',
                          }}
                        >
                          {svcName(lang, svc)}
                        </span>
                        {i < swappedOrder.length - 1 && (
                          <>
                            <span className="cm-arrow-icon" style={{ color: opt1Color }}>→</span>
                            {/* Gap pill only shown when Rule 3 applies */}
                            {hasSwapGap && i === 0 && (
                              <span className="cm-gap-pill">
                                ⏳ {t(lang, 'cm.minWait', { mins: swapGapMinutes })}
                              </span>
                            )}
                          </>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Why? box ── */}
              <p style={{
                fontSize: '0.74rem', color: C.whiteDim, lineHeight: 1.6,
                background: hasSwapGap ? 'rgba(249,115,22,0.07)' : 'rgba(168,85,247,0.07)',
                border: `1px solid ${hasSwapGap ? 'rgba(249,115,22,0.2)' : 'rgba(168,85,247,0.2)'}`,
                borderRadius: '0.5rem', padding: '0.5rem 0.7rem', marginBottom: '0.85rem',
              }}>
                <span style={{ color: C.amber }}>{t(lang, 'cm.why')}</span>{' '}
                {whySentence}
              </p>

              {/* ── CTA ── */}
              <button onClick={() => onBookSwapped(selectedSlot)} style={solidBtn(opt1Color)}>
                {hasSwapGap
                  ? t(lang, 'cm.bookWithGap', { slot: selectedSlot })
                  : <>{t(lang, 'cm.bookAsPrefix')}{swapArrowLabel}{t(lang, 'cm.bookAsMid')}{selectedSlot}{t(lang, 'cm.bookAsSuffix')}</>
                }
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              NEW MODE — Rule R4: Gap-only (no swap, original order with gap)
              Only shown when there IS a gap but no permutation improvement.
          ════════════════════════════════════════════════════════════════ */}
          {useNewMode && hasGapOnly && gapOnly && (
            <div className="cm-option" style={{ border: `1.5px solid ${C.gapBorder}`, background: C.gapBg }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                <Circle color={C.gapColor} label={hasRecommendedTime ? '1' : '!'} />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: C.gapColor }}>
                  {t(lang, 'cm.gapOnlyHeader', { mins: gapOnly.gapMinutes })}
                </span>
              </div>

              {/* Service order (original, unchanged) */}
              <div className="cm-arrow" style={{ marginBottom: '0.6rem' }}>
                {originalOrder.map((svc, i) => (
                  <React.Fragment key={`gap-orig-${i}`}>
                    <span
                      className="cm-arrow-svc"
                      style={{
                        color: C.white,
                        borderColor: 'rgba(249,115,22,0.4)',
                        background: 'rgba(249,115,22,0.12)',
                      }}
                    >
                      {svcName(lang, svc)}
                    </span>
                    {i < originalOrder.length - 1 && (
                      <>
                        <span className="cm-arrow-icon" style={{ color: C.gapColor }}>→</span>
                        {i === 0 && (
                          <span className="cm-gap-pill">
                            ⏳ {t(lang, 'cm.minWait', { mins: gapOnly.gapMinutes })}
                          </span>
                        )}
                      </>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Why box – Rule 4 copy */}
              <p style={{
                fontSize: '0.74rem', color: C.whiteDim, lineHeight: 1.6,
                background: 'rgba(249,115,22,0.07)',
                border: '1px solid rgba(249,115,22,0.2)',
                borderRadius: '0.5rem', padding: '0.5rem 0.7rem', marginBottom: '0.85rem',
              }}>
                <span style={{ color: C.amber }}>{t(lang, 'cm.why')}</span>{' '}
                {whySentence}
              </p>

              {/* R5 occupied slots specific to the gap-only path */}
              {gapOnly.occupiedSlots.length > 0 && (
                <div style={{ marginBottom: '0.85rem' }}>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em',
                    color: C.whiteFaint, display: 'block', marginBottom: '0.3rem',
                  }}>
                    {t(lang, 'cm.slotsOccupied')}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {gapOnly.occupiedSlots.map((s, i) => (
                      <span key={`gap-occ-${i}`} className="cm-slots-pill">🕐 {s}</span>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => onBookSwapped(selectedSlot)} style={solidBtn(C.gapColor)}>
                {t(lang, 'cm.bookWithGap', { slot: selectedSlot })}
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              NEW MODE — Option 2: Recommended Original Time
          ════════════════════════════════════════════════════════════════ */}
          {useNewMode && hasRecommendedTime && (
            <div className="cm-option" style={{ border: `1.5px solid ${C.greenBorder}`, background: C.greenBg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                {/* Number shifts: if there's a swap/gap card above, this is card 2; otherwise card 1 */}
                <Circle color={C.green} label={(hasSwap || hasGapOnly) ? '2' : '1'} />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: C.green }}>
                  {t(lang, 'cm.recOriginal')}
                </span>
              </div>

              <p style={{ color: C.white, fontWeight: 600, fontSize: '0.91rem', marginBottom: '0.3rem' }}>
                {t(lang, 'cm.shiftA') && <>{t(lang, 'cm.shiftA')}{' '}</>}
                <span style={{ color: C.green }}>{sr!.recommendedOriginalTime}</span>
                {t(lang, 'cm.shiftB')}
              </p>

              <div className="cm-arrow" style={{ marginBottom: '0.75rem' }}>
                {originalOrder.map((svc, i) => (
                  <React.Fragment key={`rec-${i}`}>
                    <span className="cm-arrow-svc" style={{
                      color: C.white,
                      borderColor: 'rgba(34,197,94,0.35)',
                      background: 'rgba(34,197,94,0.1)',
                    }}>
                      {svcName(lang, svc)}
                    </span>
                    {i < originalOrder.length - 1 && (
                      <span className="cm-arrow-icon" style={{ color: C.green }}>→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>

              <p style={{ fontSize: '0.74rem', color: C.whiteDim, lineHeight: 1.6, marginBottom: '0.85rem' }}>
                {t(lang, 'cm.allFreeAt', { time: sr!.recommendedOriginalTime! })}
              </p>

              <button onClick={() => onBookBackToBack(sr!.recommendedOriginalTime!)} style={solidBtn(C.green)}>
                {t(lang, 'cm.bookOriginalAt', { time: sr!.recommendedOriginalTime! })}
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              LEGACY MODE — single-provider / old flow fallback
          ════════════════════════════════════════════════════════════════ */}
          {!useNewMode && (
            <>
              {/* Option A: Split */}
              <div className="cm-option" style={{ border: `1.5px solid ${C.goldBorder}`, background: C.goldBg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <Circle color={C.gold} label="A" />
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: C.gold }}>
                    {t(lang, 'cm.splitOption')}
                  </span>
                </div>
                <p style={{ color: C.white, fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                  {t(lang, 'cm.optionA')}
                </p>
                {canSplit ? (
                  <>
                    <p style={{ color: C.whiteDim, fontSize: '0.79rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                      {t(lang, 'cm.splitDesc', {
                        slot:  selectedSlot,
                        names: busyProviders.map(p => p.providerName).join(' & '),
                        isAre: busyProviders.length === 1 ? 'is' : 'are',
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
                      style={{ ...outlineBtn(C.gold), marginTop: '0.85rem' }}
                      onClick={() => onBookSplit(selectedSlot, splitNextSlot!)}
                    >
                      {t(lang, 'cm.bookSplitVisit', { slot1: selectedSlot, slot2: splitNextSlot! })}
                    </button>
                  </>
                ) : (
                  <p style={{ color: C.whiteFaint, fontSize: '0.78rem' }}>
                    {t(lang, 'cm.noSplit')}
                  </p>
                )}
              </div>

              {/* Option B: Back-to-back */}
              <div className="cm-option" style={{ border: `1.5px solid ${C.greenBorder}`, background: C.greenBg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <Circle color={C.green} label="B" />
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: C.green }}>
                    {t(lang, 'cm.recommended')}
                  </span>
                </div>
                <p style={{ color: C.white, fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                  {t(lang, 'cm.optionB')}
                </p>
                {canBtB ? (
                  <>
                    <p style={{ color: C.whiteDim, fontSize: '0.79rem', lineHeight: 1.6, marginBottom: '0.85rem' }}>
                      {t(lang, 'cm.allInOneGo', { slot: backToBackSlot!, n: providers.length })}
                    </p>
                    <button style={solidBtn(C.green)} onClick={() => onBookBackToBack(backToBackSlot!)}>
                      {t(lang, 'cm.bookAllAt', { slot: backToBackSlot! })}
                    </button>
                  </>
                ) : (
                  <p style={{ color: C.whiteFaint, fontSize: '0.78rem' }}>
                    {t(lang, 'cm.noBackToBack')}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Footer ── */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '1rem 0 0.85rem' }} />
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '0.7rem',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${C.border}`,
              borderRadius: '0.625rem', color: C.whiteFaint,
              fontSize: '0.8rem', cursor: 'pointer', fontFamily: C.font,
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

function toMin(timeStr: string): number {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const mn = parseInt(m[2], 10);
  const p  = m[3].toUpperCase();
  if (p === 'PM' && h !== 12) h += 12;
  if (p === 'AM' && h === 12) h  = 0;
  return h * 60 + mn;
}

function Circle({ color, label }: { color: string; label: string }) {
  return (
    <div style={{
      width: '1.4rem', height: '1.4rem', borderRadius: '50%',
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
    }}>
      {label}
    </div>
  );
}

function solidBtn(color: string): React.CSSProperties {
  return {
    width: '100%', padding: '0.78rem',
    background: color, border: 'none',
    borderRadius: '0.625rem', color: '#fff',
    fontWeight: 700, fontSize: '0.87rem',
    cursor: 'pointer', fontFamily: 'Inter, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif',
    boxShadow: `0 4px 20px ${color}55`,
  };
}

function outlineBtn(color: string): React.CSSProperties {
  return {
    width: '100%', padding: '0.78rem',
    background: 'transparent',
    border: `1.5px solid ${color}`,
    borderRadius: '0.625rem', color,
    fontWeight: 700, fontSize: '0.87rem',
    cursor: 'pointer', fontFamily: 'Inter, "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif',
  };
}

