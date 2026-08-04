'use client';

import { useState, ReactNode } from 'react';

/* ─────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────── */
export const tokens = {
  color: {
    gold:        '#B8860B',
    goldBorder:  'rgba(184,134,11,0.4)',
    goldBg:      'rgba(184,134,11,0.14)',
    white:       '#ffffff',
    whiteMuted:  'rgba(255,255,255,0.80)',
    whiteDim:    'rgba(255,255,255,0.70)',
    whiteFaint:  'rgba(255,255,255,0.35)',
    whiteBorder: 'rgba(255,255,255,0.10)',
    cardBg:      'rgba(20,18,15,0.92)',
    green:       '#22c55e',
    greenBg:     'rgba(34,197,94,0.14)',
    greenBorder: 'rgba(34,197,94,0.4)',
    red:         '#ef4444',
    redBg:       'rgba(239,68,68,0.12)',
    redBorder:   'rgba(239,68,68,0.35)',
  },
  font: {
    family:    'Inter, sans-serif',
    heroTitle: 'clamp(1.8rem, 4vw, 3.5rem)',
    heroSub:   'clamp(0.85rem, 1.5vw, 1.2rem)',
  },
  radius: {
    card:  '1.25rem',
    pill:  '1.25rem',
    input: '0.625rem',
  },
} as const;

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
export function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function isValidPhone(v: string) {
  return /^[\d\s+\-()]{7,20}$/.test(v.trim());
}

export function getPasswordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

/* ─────────────────────────────────────────
   GLOBAL CSS
───────────────────────────────────────── */
export const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:#040405;}

  @keyframes fadeInUp {
    from{opacity:0;transform:translateY(20px)}
    to{opacity:1;transform:translateY(0)}
  }
  @keyframes checkPop {
    0%{transform:scale(0) rotate(-20deg);opacity:0}
    70%{transform:scale(1.2) rotate(5deg)}
    100%{transform:scale(1) rotate(0);opacity:1}
  }
  @keyframes spin {
    to{transform:rotate(360deg)}
  }
  @keyframes shake {
    10%,90%{transform:translateX(-1px)}
    20%,80%{transform:translateX(2px)}
    30%,50%,70%{transform:translateX(-3px)}
    40%,60%{transform:translateX(3px)}
  }
  @keyframes shimmer {
    0%{background-position:-200% 0}
    100%{background-position:200% 0}
  }

  .reveal-up {animation:fadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) both;}
  .reveal-up-d1 {animation:fadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.1s both;}
  .reveal-up-d2 {animation:fadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.2s both;}
  .reveal-up-d3 {animation:fadeInUp 0.55s cubic-bezier(0.16,1,0.3,1) 0.3s both;}
  .check-pop {animation:checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;}
  .shake {animation:shake 0.4s;}

  /* step indicator */
  .step-dot {
    width:2.1rem;height:2.1rem;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:0.75rem;font-weight:600;flex-shrink:0;
    transition:all 0.35s;font-family:Inter,sans-serif;
  }
  .step-line {
    height:2px;border-radius:2px;transition:background 0.5s;
  }

  /* input */
  .sayo-input {
    width:100%;background:rgba(255,255,255,0.06);
    border:1.5px solid rgba(255,255,255,0.15);
    border-radius:0.625rem;padding:0.75rem 1rem;
    font-family:Inter,sans-serif;font-size:0.9rem;color:#fff;
    outline:none;transition:border-color 0.25s,background 0.25s;
    color-scheme:dark;
  }
  .sayo-input::placeholder {color:rgba(255,255,255,0.3);}
  .sayo-input:focus {border-color:#B8860B;background:rgba(184,134,11,0.07);}
  .sayo-input.err {border-color:#e05c5c !important;}
  .field-err {color:#e05c5c;font-size:0.7rem;margin-top:0.28rem;font-family:Inter,sans-serif;}

  /* password field */
  .pass-wrap {position:relative;}
  .pass-wrap .sayo-input {padding-right:2.75rem;}
  .eye-btn {
    position:absolute;right:0.65rem;top:50%;transform:translateY(-50%);
    background:transparent;border:none;cursor:pointer;
    color:rgba(255,255,255,0.4);
    display:flex;align-items:center;justify-content:center;
    padding:0.3rem;transition:color 0.2s;
  }
  .eye-btn:hover {color:#B8860B;}

  /* checkbox */
  .chk-box {
    width:1.1rem;height:1.1rem;border-radius:0.3rem;flex-shrink:0;
    border:1.5px solid rgba(255,255,255,0.28);
    background:rgba(255,255,255,0.05);
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:all 0.2s;
  }
  .chk-box-active {background:#B8860B;border-color:#B8860B;}

  /* password strength */
  .strength-bar {display:flex;gap:0.3rem;margin-top:0.55rem;}
  .strength-seg {
    height:4px;flex:1;border-radius:2px;
    background:rgba(255,255,255,0.1);transition:background 0.3s;
  }
  .strength-label {
    font-size:0.68rem;font-weight:600;margin-top:0.35rem;
    font-family:Inter,sans-serif;
  }

  /* otp */
  .otp-wrap {
    display:flex;gap:0.55rem;justify-content:center;
    margin-bottom:1.5rem;flex-wrap:wrap;
  }
  .otp-box {
    width:2.9rem;height:3.3rem;border-radius:0.625rem;
    text-align:center;font-size:1.25rem;font-weight:700;
    color:#fff;background:rgba(255,255,255,0.06);
    border:1.5px solid rgba(255,255,255,0.15);
    font-family:Inter,sans-serif;outline:none;
    transition:border-color 0.25s,background 0.25s;
    color-scheme:dark;
  }
  .otp-box:focus {border-color:#B8860B;background:rgba(184,134,11,0.07);}
  .otp-box.filled {border-color:rgba(184,134,11,0.5);background:rgba(184,134,11,0.1);}

  /* links */
  .auth-link {
    color:#B8860B;font-weight:600;cursor:pointer;
    text-decoration:none;transition:opacity 0.2s;
  }
  .auth-link:hover {opacity:0.75;text-decoration:underline;}

  /* buttons */
  .btn-gold {
    cursor:pointer;outline:none;border:none;
    font-family:Inter,sans-serif;font-weight:600;
    letter-spacing:0.06em;border-radius:0.75rem;
    background:linear-gradient(135deg,#B8860B,#d4a017);
    color:#fff;
    display:inline-flex;align-items:center;justify-content:center;gap:0.45rem;
    transition:transform 0.2s,box-shadow 0.2s,opacity 0.2s;
  }
  .btn-gold:hover:not(:disabled) {
    transform:translateY(-2px);
    box-shadow:0 8px 28px rgba(184,134,11,0.42);
  }
  .btn-gold:disabled {opacity:0.42;cursor:not-allowed;}

  .btn-ghost {
    cursor:pointer;outline:none;background:transparent;
    border:1.5px solid rgba(255,255,255,0.28);
    border-radius:0.75rem;font-family:Inter,sans-serif;
    font-weight:500;color:rgba(255,255,255,0.65);
    transition:all 0.2s;
  }
  .btn-ghost:hover {border-color:#B8860B;color:#fff;transform:translateY(-2px);}

  /* back link */
  .back-link {
    display:inline-flex;align-items:center;gap:0.35rem;
    color:rgba(255,255,255,0.55);font-size:0.78rem;
    font-weight:500;text-decoration:none;
    transition:color 0.2s;font-family:Inter,sans-serif;
  }
  .back-link:hover {color:#B8860B;}

  /* divider */
  .auth-divider {
    display:flex;align-items:center;gap:0.75rem;
    margin:1.25rem 0;
  }
  .auth-divider-line {
    flex:1;height:1px;background:rgba(255,255,255,0.1);
  }
  .auth-divider-text {
    color:rgba(255,255,255,0.3);font-size:0.72rem;
    font-family:Inter,sans-serif;white-space:nowrap;
  }

  /* info box */
  .info-box-gold {
    background:rgba(184,134,11,0.09);
    border:1px solid rgba(184,134,11,0.28);
    border-radius:0.625rem;padding:0.65rem 0.9rem;
    font-size:0.75rem;color:rgba(255,255,255,0.65);
    font-family:Inter,sans-serif;line-height:1.55;
  }
  .info-box-green {
    background:rgba(34,197,94,0.08);
    border:1px solid rgba(34,197,94,0.3);
    border-radius:0.625rem;padding:0.65rem 0.9rem;
    font-size:0.75rem;color:rgba(255,255,255,0.65);
    font-family:Inter,sans-serif;line-height:1.55;
  }

  @media(max-width:420px){
    .otp-box {width:2.4rem;height:2.9rem;font-size:1.05rem;}
  }
`;

/* ─────────────────────────────────────────
   ICONS
───────────────────────────────────────── */
export const Ico = {
  Check: ({ s = 16, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Eye: ({ s = 16, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: ({ s = 16, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  Mail: ({ s = 13, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  ArrowLeft: ({ s = 14, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  ),
  Refresh: ({ s = 12, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>
  ),
  Shield: ({ s = 32, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
  User: ({ s = 13, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Phone: ({ s = 13, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.61 19a19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.9-8.2A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17z"/>
    </svg>
  ),
  Lock: ({ s = 13, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Sparkle: ({ s = 28, c = 'currentColor' }: { s?: number; c?: string }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  ),
};

/* ─────────────────────────────────────────
   SHARED UI COMPONENTS
───────────────────────────────────────── */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: tokens.color.cardBg,
      border: `1px solid ${tokens.color.whiteBorder}`,
      borderRadius: tokens.radius.card,
      padding: 'clamp(1.5rem,3vw,2.1rem)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Label({ text }: { text: string }) {
  return (
    <p style={{
      color: tokens.color.gold,
      fontSize: '0.67rem',
      fontWeight: 700,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      marginBottom: '1.1rem',
      fontFamily: tokens.font.family,
    }}>
      {text}
    </p>
  );
}

export function FieldLabel({
  text,
  opt,
}: {
  text: string;
  opt?: boolean;
}) {
  return (
    <label style={{
      display: 'block',
      color: tokens.color.whiteDim,
      fontSize: '0.78rem',
      fontWeight: 500,
      marginBottom: '0.35rem',
      fontFamily: tokens.font.family,
    }}>
      {text}
      {opt && (
        <span style={{ color: tokens.color.whiteFaint, marginLeft: '0.3rem' }}>
          (optional)
        </span>
      )}
    </label>
  );
}

export function PasswordField({
  value,
  onChange,
  onBlur,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="pass-wrap">
        <input
          className={`sayo-input${error ? ' err' : ''}`}
          type={show ? 'text' : 'password'}
          placeholder={placeholder || '••••••••'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete="off"
        />
        <button
          type="button"
          className="eye-btn"
          tabIndex={-1}
          onClick={() => setShow(v => !v)}
        >
          {show ? <Ico.EyeOff s={17} /> : <Ico.Eye s={17} />}
        </button>
      </div>
      {error && <p className="field-err">{error}</p>}
    </div>
  );
}

export function PasswordStrengthBar({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = [
    'rgba(255,255,255,0.1)',
    tokens.color.red,
    tokens.color.gold,
    '#f59e0b',
    tokens.color.green,
  ];
  if (!password) return null;
  return (
    <div style={{ marginTop: '0.45rem' }}>
      <div className="strength-bar">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="strength-seg" style={{
            background: i < strength ? colors[strength] : 'rgba(255,255,255,0.1)',
          }} />
        ))}
      </div>
      <p className="strength-label" style={{ color: colors[strength] }}>
        {labels[strength]}
      </p>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}
      onClick={onChange}
    >
      <div className={`chk-box${checked ? ' chk-box-active' : ''}`} style={{ marginTop: '0.12rem' }}>
        {checked && <Ico.Check s={11} c="#fff" />}
      </div>
      <span style={{
        color: tokens.color.whiteDim,
        fontSize: '0.78rem',
        lineHeight: 1.6,
        fontFamily: tokens.font.family,
      }}>
        {label}
      </span>
    </div>
  );
}

export function AuthStepIndicator({
  current,
  total,
  labels,
}: {
  current: number;
  total: number;
  labels?: string[];
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 'clamp(1.5rem,4vw,2.25rem)',
    }}>
      {Array.from({ length: total }).map((_, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.28rem' }}>
              <div className="step-dot" style={{
                background: done
                  ? tokens.color.gold
                  : active
                  ? 'rgba(184,134,11,0.18)'
                  : 'rgba(255,255,255,0.06)',
                border: active
                  ? `2px solid ${tokens.color.gold}`
                  : done
                  ? 'none'
                  : '2px solid rgba(255,255,255,0.18)',
                color: done || active ? '#fff' : tokens.color.whiteFaint,
              }}>
                {done ? <Ico.Check s={11} c="#fff" /> : n}
              </div>
              {labels && labels[i] && (
                <span style={{
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  fontFamily: tokens.font.family,
                  color: active
                    ? tokens.color.gold
                    : done
                    ? tokens.color.whiteDim
                    : tokens.color.whiteFaint,
                }}>
                  {labels[i]}
                </span>
              )}
            </div>
            {i < total - 1 && (
              <div className="step-line" style={{
                width: '3rem',
                margin: labels ? '0 0.35rem 1.1rem' : '0 0.35rem',
                background: done ? tokens.color.gold : 'rgba(255,255,255,0.12)',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Divider({ text = 'or' }: { text?: string }) {
  return (
    <div className="auth-divider">
      <div className="auth-divider-line" />
      <span className="auth-divider-text">{text}</span>
      <div className="auth-divider-line" />
    </div>
  );
}

/* ─────────────────────────────────────────
   SHARED STYLES
───────────────────────────────────────── */
export const spinnerStyle: React.CSSProperties = {
  width: '0.85rem',
  height: '0.85rem',
  border: '2px solid rgba(255,255,255,0.3)',
  borderTopColor: '#fff',
  borderRadius: '50%',
  display: 'inline-block',
  animation: 'spin 0.7s linear infinite',
};

export const mainStyle: React.CSSProperties = {
  minHeight: '100vh',
  fontFamily: tokens.font.family,
  backgroundImage: 'url(/booking.jpg)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  position: 'relative',
};

export const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(4,4,5,0.82)',
  zIndex: 0,
};

export const pageWrapStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: 'clamp(1.5rem,5vw,3.5rem) clamp(1rem,4vw,2rem) clamp(3rem,6vw,4rem)',
};