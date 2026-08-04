'use client';

import { tokens } from '@/components/auth/shared';
import { CSSProperties, useState } from 'react';

/* ── same list mirrored client-side ── */
export const GENDER_OPTIONS = [
  { value: 'male',              label: 'Male'               },
  { value: 'female',            label: 'Female'             },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'other',             label: 'Other'              },
] as const;

export type GenderValue = typeof GENDER_OPTIONS[number]['value'] | '';

interface GenderSelectProps {
  value:    GenderValue;
  onChange: (v: GenderValue) => void;
  onBlur?:  () => void;
  error?:   string;
}

/* shared input surface styles — mirrors your sayo-input class */
const baseSelectStyle: CSSProperties = {
  width:           '100%',
  padding:         '0.72rem 2.5rem 0.72rem 2.5rem',
  background:      'rgba(255,255,255,0.05)',
  border:          '1px solid rgba(255,255,255,0.12)',
  borderRadius:    '0.65rem',
  color:           '#fff',
  fontSize:        '0.88rem',
  fontFamily:      tokens.font.family,
  outline:         'none',
  appearance:      'none',        // hide native arrow
  WebkitAppearance:'none',
  cursor:          'pointer',
  transition:      'border-color 0.2s, box-shadow 0.2s',
};

const errSelectStyle: CSSProperties = {
  ...baseSelectStyle,
  border:     '1px solid rgba(220,38,38,0.6)',
  boxShadow:  '0 0 0 3px rgba(220,38,38,0.12)',
};

/* SVG chevron — pure inline so no extra deps */
function ChevronIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/* Gender icon (person silhouette) */
function GenderIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <circle cx="12" cy="8"  r="4" />
      <path   d="M6 20v-2a6 6 0 0 1 12 0v2" />
    </svg>
  );
}

export default function GenderSelect({
  value,
  onChange,
  onBlur,
  error,
}: GenderSelectProps) {
  const [focused, setFocused] = useState(false);

  const style: CSSProperties = {
    ...(error ? errSelectStyle : baseSelectStyle),
    ...(focused
      ? {
          border:    `1px solid ${tokens.color.gold}`,
          boxShadow: `0 0 0 3px rgba(184,134,11,0.18)`,
        }
      : {}),
    /* placeholder colour when nothing selected */
    color: value ? '#fff' : 'rgba(255,255,255,0.35)',
  };

  return (
    <div style={{ position: 'relative' }}>

      {/* left icon */}
      <div style={{
        position:       'absolute',
        left:           '0.8rem',
        top:            '50%',
        transform:      'translateY(-50%)',
        color:          tokens.color.whiteFaint,
        pointerEvents:  'none',
        zIndex:         1,
      }}>
        <GenderIcon />
      </div>

      <select
        value={value}
        onChange={e  => onChange(e.target.value as GenderValue)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        style={style}
      >
        {/* placeholder option */}
        <option value="" disabled style={{ background: '#1a1a2e', color: 'rgba(255,255,255,0.4)' }}>
          Select your gender
        </option>

        {GENDER_OPTIONS.map(opt => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ background: '#1a1a2e', color: '#fff' }}
          >
            {opt.label}
          </option>
        ))}
      </select>

      {/* right chevron */}
      <div style={{
        position:      'absolute',
        right:         '0.85rem',
        top:           '50%',
        transform:     'translateY(-50%)',
        color:         tokens.color.whiteFaint,
        pointerEvents: 'none',
        zIndex:        1,
      }}>
        <ChevronIcon />
      </div>
    </div>
  );
}