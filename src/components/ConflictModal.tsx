'use client';

import React from 'react';

/* ─────────────────────────────────────────
   TYPES
───────────────────────────────────────── */
export interface ProviderAvailability {
  providerName: string;
  serviceName:  string;
  isFree:       boolean;
  nextFreeSlot: string | null;
}

export interface ConflictModalData {
  selectedSlot:    string;
  backToBackSlot:  string | null;
  providers:       ProviderAvailability[];
  gapDescription:  string;
}

interface ConflictModalProps {
  data:             ConflictModalData;
  onBookSplit:      (selectedSlot: string, nextFreeSlot: string) => void;
  onBookBackToBack: (slot: string) => void;
  onClose:          () => void;
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function timeToMinutes(timeStr: string): number {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function minutesToGapLabel(gapMins: number): string {
  if (gapMins <= 0) return '0-minute';
  if (gapMins < 60) return `${gapMins}-minute`;
  const h = Math.floor(gapMins / 60);
  const m = gapMins % 60;
  return m > 0 ? `${h}.${Math.round((m / 60) * 10)}-hour` : `${h}-hour`;
}

/* ─────────────────────────────────────────
   STYLES
───────────────────────────────────────── */
const css = {
  overlay: {
    position:       'fixed' as const,
    inset:          0,
    zIndex:         200,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '1.25rem',
  },
  backdrop: {
    position:             'absolute' as const,
    inset:                0,
    background:           'rgba(4,4,5,0.90)',
    backdropFilter:       'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  },
  dialog: {
    position:     'relative' as const,
    zIndex:       1,
    width:        '100%',
    maxWidth:     '520px',
    background:   'rgba(20,18,15,0.97)',
    border:       '1px solid rgba(255,255,255,0.10)',
    borderRadius: '1.25rem',
    padding:      'clamp(1.25rem,4vw,1.85rem)',
    fontFamily:   'Inter, sans-serif',
    boxShadow:    '0 32px 80px rgba(0,0,0,0.6)',
    maxHeight:    '92vh',
    overflowY:    'auto' as const,
  },
  header: {
    display:        'flex',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    gap:            '0.75rem',
    marginBottom:   '0.75rem',
  },
  badge: {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           '0.35rem',
    background:    'rgba(245,158,11,0.15)',
    border:        '1px solid rgba(245,158,11,0.45)',
    borderRadius:  '999px',
    padding:       '0.22rem 0.75rem',
    fontSize:      '0.68rem',
    fontWeight:    700,
    letterSpacing: '0.08em',
    color:         '#f59e0b',
    marginBottom:  '0.6rem',
  },
  title: {
    color:       '#ffffff',
    fontSize:    'clamp(1rem,2.5vw,1.2rem)',
    fontWeight:  600,
    lineHeight:  1.3,
    marginBottom:'0.4rem',
  },
  bodyText: {
    color:       'rgba(255,255,255,0.60)',
    fontSize:    '0.80rem',
    lineHeight:  1.7,
    marginBottom:'1.25rem',
  },
  optionCard: (highlight: boolean): React.CSSProperties => ({
    borderRadius: '0.875rem',
    border:       highlight
      ? '1.5px solid rgba(34,197,94,0.50)'
      : '1.5px solid rgba(255,255,255,0.12)',
    background:   highlight
      ? 'rgba(34,197,94,0.07)'
      : 'rgba(255,255,255,0.03)',
    padding:      '1rem 1.1rem',
    marginBottom: '0.75rem',
  }),
  optionLabel: (highlight: boolean): React.CSSProperties => ({
    display:       'flex',
    alignItems:    'center',
    gap:           '0.4rem',
    fontSize:      '0.65rem',
    fontWeight:    700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color:         highlight ? '#22c55e' : 'rgba(255,255,255,0.45)',
    marginBottom:  '0.35rem',
  }),
  optionTitle: {
    color:        '#ffffff',
    fontSize:     '0.92rem',
    fontWeight:   600,
    marginBottom: '0.3rem',
  },
  optionSubtitle: {
    color:        'rgba(255,255,255,0.55)',
    fontSize:     '0.76rem',
    lineHeight:   1.6,
    marginBottom: '0.85rem',
  },
  providerRow: {
    display:      'flex',
    alignItems:   'center',
    gap:          '0.5rem',
    padding:      '0.4rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize:     '0.78rem',
    color:        'rgba(255,255,255,0.75)',
  },
  btnPrimary: {
    width:          '100%',
    padding:        '0.78rem 1rem',
    background:     '#22c55e',
    border:         'none',
    borderRadius:   '0.75rem',
    color:          '#ffffff',
    fontSize:       '0.85rem',
    fontWeight:     600,
    fontFamily:     'Inter, sans-serif',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '0.4rem',
    transition:     'transform 0.18s, box-shadow 0.18s',
    letterSpacing:  '0.03em',
  },
  btnSecondary: {
    width:          '100%',
    padding:        '0.75rem 1rem',
    background:     'rgba(245,158,11,0.12)',
    border:         '1.5px solid rgba(245,158,11,0.40)',
    borderRadius:   '0.75rem',
    color:          '#f59e0b',
    fontSize:       '0.83rem',
    fontWeight:     600,
    fontFamily:     'Inter, sans-serif',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '0.4rem',
    transition:     'transform 0.18s, background 0.18s',
    letterSpacing:  '0.03em',
  },
  btnClose: {
    width:        '100%',
    padding:      '0.7rem 1rem',
    background:   'transparent',
    border:       '1.5px solid rgba(255,255,255,0.15)',
    borderRadius: '0.75rem',
    color:        'rgba(255,255,255,0.50)',
    fontSize:     '0.80rem',
    fontWeight:   500,
    fontFamily:   'Inter, sans-serif',
    cursor:       'pointer',
    marginTop:    '0.6rem',
    transition:   'border-color 0.18s, color 0.18s',
  },
  closeX: {
    background:     'rgba(255,255,255,0.06)',
    border:         '1px solid rgba(255,255,255,0.12)',
    borderRadius:   '50%',
    width:          '1.9rem',
    height:         '1.9rem',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    cursor:         'pointer',
    color:          'rgba(255,255,255,0.50)',
    fontSize:       '1rem',
    flexShrink:     0,
    lineHeight:     1,
  },
};

/* ─────────────────────────────────────────
   COMPONENT
───────────────────────────────────────── */
export default function ConflictModal({
  data,
  onBookSplit,
  onBookBackToBack,
  onClose,
}: ConflictModalProps) {
  const { selectedSlot, backToBackSlot, providers } = data;

  const freeProviders = providers.filter(p => p.isFree);
  const busyProviders = providers.filter(p => !p.isFree);

  const latestNextFree = busyProviders.reduce<string | null>((latest, p) => {
    if (!p.nextFreeSlot) return latest;
    if (!latest) return p.nextFreeSlot;
    return timeToMinutes(p.nextFreeSlot) > timeToMinutes(latest)
      ? p.nextFreeSlot
      : latest;
  }, null);

  const gapMins = latestNextFree
    ? timeToMinutes(latestNextFree) - timeToMinutes(selectedSlot)
    : 0;

  const gapLabel = minutesToGapLabel(gapMins);

  const busyNames = busyProviders.map(p => p.providerName).join(' & ');
  const conflictSentence =
    busyProviders.length === 1 && latestNextFree
      ? `${busyNames} is busy until ${latestNextFree}, causing a ${gapLabel} gap if you start at ${selectedSlot}.`
      : busyProviders.length > 1 && latestNextFree
      ? `${busyNames} are busy, with the last becoming free at ${latestNextFree} — a ${gapLabel} gap from ${selectedSlot}.`
      : `Some providers are not available at ${selectedSlot}.`;

  const splitNextSlot = latestNextFree;

  return (
    <div style={css.overlay} role="dialog" aria-modal="true" aria-labelledby="conflict-modal-title">
      <div style={css.backdrop} onClick={onClose} />

      <div style={css.dialog} className="scale-in">

        <div style={css.header}>
          <div>
            <div style={css.badge}>
              <span style={{
                width:'0.45rem', height:'0.45rem', borderRadius:'50%',
                background:'#f59e0b', display:'inline-block',
              }} />
              Partial Availability
            </div>
            <h2 id="conflict-modal-title" style={css.title}>
              Partial Availability at{' '}
              <span style={{ color:'#f59e0b' }}>{selectedSlot}</span>
            </h2>
          </div>
          <button style={css.closeX} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p style={css.bodyText}>{conflictSentence}</p>

        {/* OPTION B — Back-to-Back (Primary / Recommended) */}
        {backToBackSlot && (
          <div style={css.optionCard(true)}>
            <div style={css.optionLabel(true)}>
              <span style={{
                width:'1.1rem', height:'1.1rem', borderRadius:'50%',
                background:'rgba(34,197,94,0.2)', border:'1px solid rgba(34,197,94,0.5)',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                fontSize:'0.6rem', color:'#22c55e', fontWeight:700,
              }}>B</span>
              Recommended
            </div>
            <p style={css.optionTitle}>Option B: Continuous / Back-to-Back Visit</p>
            <p style={css.optionSubtitle}>
              Do all services in one go with no waiting time starting at{' '}
              <strong style={{ color:'#22c55e' }}>{backToBackSlot}</strong>.
              All {providers.length} providers will be free and ready.
            </p>
            <button
              style={css.btnPrimary}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(34,197,94,0.35)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
              onClick={() => onBookBackToBack(backToBackSlot)}
            >
              ✓ Book All at {backToBackSlot} (Recommended)
            </button>
          </div>
        )}

        {/* OPTION A — Split Booking (Secondary) */}
        {splitNextSlot && (
          <div style={css.optionCard(false)}>
            <div style={css.optionLabel(false)}>
              <span style={{
                width:'1.1rem', height:'1.1rem', borderRadius:'50%',
                background:'rgba(245,158,11,0.15)', border:'1px solid rgba(245,158,11,0.4)',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                fontSize:'0.6rem', color:'#f59e0b', fontWeight:700,
              }}>A</span>
              Split Option
            </div>
            <p style={css.optionTitle}>Option A: Split Booking (With Gap)</p>
            <p style={css.optionSubtitle}>
              Start your first service at{' '}
              <strong style={{ color:'#f59e0b' }}>{selectedSlot}</strong>{' '}
              and continue when {busyNames} is free — with a{' '}
              <strong style={{ color:'#f59e0b' }}>{gapLabel} gap</strong>.
            </p>

            <div style={{ marginBottom:'0.85rem' }}>
              {freeProviders.map(p => (
                <div key={p.providerName} style={css.providerRow}>
                  <span>✅</span>
                  <span>
                    <strong style={{ color:'rgba(255,255,255,0.90)' }}>{p.providerName}</strong>
                    {p.serviceName && (
                      <span style={{ color:'rgba(255,255,255,0.45)' }}> ({p.serviceName})</span>
                    )}
                    <span style={{ color:'rgba(255,255,255,0.45)' }}>: Available at </span>
                    <strong style={{ color:'#22c55e' }}>{selectedSlot}</strong>
                  </span>
                </div>
              ))}
              {busyProviders.map(p => (
                <div key={p.providerName} style={{ ...css.providerRow, borderBottom:'none' }}>
                  <span>☕</span>
                  <span>
                    <strong style={{ color:'rgba(255,255,255,0.90)' }}>{p.providerName}</strong>
                    {p.serviceName && (
                      <span style={{ color:'rgba(255,255,255,0.45)' }}> ({p.serviceName})</span>
                    )}
                    <span style={{ color:'rgba(255,255,255,0.45)' }}>: Next free at </span>
                    <strong style={{ color:'#f59e0b' }}>{p.nextFreeSlot ?? '—'}</strong>
                  </span>
                </div>
              ))}
            </div>

            <button
              style={css.btnSecondary}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.20)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'none';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.12)';
              }}
              onClick={() => onBookSplit(selectedSlot, splitNextSlot)}
            >
              Book as Split Visit ({selectedSlot} & {splitNextSlot})
            </button>
          </div>
        )}

        <button
          style={css.btnClose}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.35)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.75)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.50)';
          }}
          onClick={onClose}
        >
          ← Choose a different date or time
        </button>

      </div>
    </div>
  );
}