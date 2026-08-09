'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  tokens,
  globalCss,
  Ico,
  Card,
  Label,
  FieldLabel,
  PasswordField,
  PasswordStrengthBar,
  Checkbox,
  Divider,
  isValidEmail,
  isValidPhone,
  mainStyle,
  overlayStyle,
  pageWrapStyle,
  spinnerStyle,
} from '@/components/auth/shared';
import GenderSelect, { type GenderValue } from '@/components/auth/GenderSelect';

export default function RegisterPage() {
  /* ── field state ── */
  const [name,            setName           ] = useState('');
  const [email,           setEmail          ] = useState('');
  const [phone,           setPhone          ] = useState('');
  const [gender,          setGender         ] = useState<GenderValue>('');
  const [password,        setPassword       ] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agree,           setAgree          ] = useState(false);

  /* ── ui state ── */
  const [loading,     setLoading    ] = useState(false);
  const [success,     setSuccess    ] = useState(false);
  const [serverError, setServerError] = useState('');

  /* ── touched flags ── */
  const [tName,     setTName    ] = useState(false);
  const [tEmail,    setTEmail   ] = useState(false);
  const [tPhone,    setTPhone   ] = useState(false);
  const [tGender,   setTGender  ] = useState(false);
  const [tPassword, setTPassword] = useState(false);
  const [tConfirm,  setTConfirm ] = useState(false);
  const [tAgree,    setTAgree   ] = useState(false);

  /* ── inline validation errors ── */
  const errName    = tName     && !name.trim()                ? 'Full name is required.'                   : '';
  const errEmail   = tEmail    && !isValidEmail(email)         ? 'Enter a valid email address.'             : '';
  const errPhone   = tPhone    && !isValidPhone(phone)         ? 'Enter a valid phone number.'              : '';
  const errGender  = tGender   && !gender                      ? 'Please select your gender.'              : '';
  const errPass    = tPassword && password.length < 6          ? 'Password must be at least 6 characters.' : '';
  const errConfirm = tConfirm  && confirmPassword !== password ? 'Passwords do not match.'                 : '';
  const errAgree   = tAgree    && !agree                       ? 'You must agree to the terms.'            : '';

  /* ── gate ── */
  const canSubmit =
    !!name.trim()        &&
    isValidEmail(email)  &&
    isValidPhone(phone)  &&
    !!gender             &&
    password.length >= 6 &&
    confirmPassword === password &&
    agree;

  /* ══ SUBMIT ══ */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setTName(true); setTEmail(true); setTPhone(true);
    setTGender(true); setTPassword(true); setTConfirm(true); setTAgree(true);

    if (!canSubmit) return;

    setLoading(true);
    setServerError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, gender, password }),
      });

      console.log('[register page] response status:', res.status);

      let data: Record<string, unknown> | null = null;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error('[register page] JSON parse error:', parseErr);
        if (res.ok) {
          setSuccess(true);
          return;
        }
        setServerError('Unexpected server response. Please try again.');
        return;
      }

      console.log('[register page] response data:', data);

      // Expect backend to return { success: true } on success
      if (!res.ok || data?.success !== true) {
        const msg = (data && (data.message || (data.error as string))) ?? 'Registration failed. Please try again.';
        setServerError(String(msg));
        return;
      }

      setSuccess(true);

    } catch (err) {
      console.error('[register page] fetch error:', err);
      setServerError(
        err instanceof TypeError
          ? 'Cannot reach the server. Please check your internet connection.'
          : 'An unexpected error occurred. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  /* ══ SUCCESS SCREEN ══ */
  if (success) {
    return (
      <>
        <style>{globalCss}</style>
        <main style={mainStyle}>
          <div style={overlayStyle} />

          <div style={{
            position:       'relative',
            zIndex:         1,
            minHeight:      '100vh',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        '2rem',
          }}>
            <div className="reveal-up" style={{ maxWidth: '480px', textAlign: 'center' }}>

              <div
                className="check-pop"
                style={{
                  width:          '5.5rem',
                  height:         '5.5rem',
                  borderRadius:   '50%',
                  background:     'rgba(184,134,11,0.15)',
                  border:         `2px solid ${tokens.color.gold}`,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  margin:         '0 auto 1.5rem',
                }}
              >
                <Ico.Check s={34} c={tokens.color.gold} />
              </div>

              <p style={{
                color:         tokens.color.gold,
                fontSize:      '0.68rem',
                fontWeight:    700,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                marginBottom:  '0.5rem',
              }}>
                Account Created
              </p>

              <h2 style={{
                color:        '#fff',
                fontSize:     'clamp(1.6rem,3vw,2.2rem)',
                fontWeight:   600,
                marginBottom: '0.75rem',
              }}>
                Welcome, {name.split(' ')[0]}!
              </h2>

              <p style={{
                color:        tokens.color.whiteMuted,
                fontSize:     '0.88rem',
                lineHeight:   1.8,
                marginBottom: '2rem',
              }}>
                Your Sayo account has been created successfully.
                <br />Please sign in to start booking your appointments.
              </p>

              <Link
                href="/login"
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  gap:            '0.45rem',
                  padding:        '0.85rem 2.5rem',
                  fontSize:       '0.9rem',
                  background:     'linear-gradient(135deg,#B8860B,#d4a017)',
                  color:          '#fff',
                  borderRadius:   '0.75rem',
                  fontFamily:     tokens.font.family,
                  fontWeight:     600,
                  letterSpacing:  '0.06em',
                  textDecoration: 'none',
                }}
              >
                Continue to Sign In
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  /* ══ REGISTRATION FORM ══ */
  return (
    <>
      <style>{globalCss}</style>
      <main style={mainStyle}>
        <div style={overlayStyle} />
        <div style={pageWrapStyle}>

          <div
            className="reveal-up"
            style={{ maxWidth: '480px', margin: '0 auto', width: '100%' }}
          >
            <Link
              href="https://sayoweb.netlify.app/"
              className="back-link"
              style={{ marginBottom: '1.75rem', display: 'inline-flex' }}
            >
              <Ico.ArrowLeft s={13} /> Back to Home
            </Link>
          </div>

          <div
            className="reveal-up"
            style={{
              textAlign:    'center',
              marginBottom: 'clamp(1.5rem,4vw,2.5rem)',
            }}
          >
            <div style={{
              width:          '3.5rem',
              height:         '3.5rem',
              borderRadius:   '50%',
              background:     'rgba(184,134,11,0.15)',
              border:         '1.5px solid rgba(184,134,11,0.4)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              margin:         '0 auto 1rem',
            }}>
              <Ico.Sparkle s={22} c={tokens.color.gold} />
            </div>

            <p style={{
              color:         tokens.color.gold,
              fontSize:      '0.68rem',
              fontWeight:    700,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginBottom:  '0.55rem',
            }}>
              Join Us
            </p>

            <h1 style={{
              color:        '#fff',
              fontSize:     tokens.font.heroTitle,
              fontWeight:   600,
              lineHeight:   1.15,
              marginBottom: '0.65rem',
            }}>
              Create Your <span style={{ color: tokens.color.gold }}>Account</span>
            </h1>

            <p style={{
              color:      tokens.color.whiteMuted,
              fontSize:   tokens.font.heroSub,
              lineHeight: 1.7,
              maxWidth:   '420px',
              margin:     '0 auto',
            }}>
              Sign up to book appointments and enjoy exclusive member benefits.
            </p>
          </div>

          <div
            className="reveal-up-d1"
            style={{ maxWidth: '480px', margin: '0 auto', width: '100%' }}
          >
            <Card>
              <form onSubmit={handleSubmit}>
                <Label text="Your Details" />

                <div style={{
                  display:       'flex',
                  flexDirection: 'column',
                  gap:           '1rem',
                  marginBottom:  '1.4rem',
                }}>

                  {/* ── full name ── */}
                  <div>
                    <FieldLabel text="Full Name" />
                    <div style={{ position: 'relative' }}>
                      <input
                        className={`sayo-input${errName ? ' err' : ''}`}
                        type="text"
                        placeholder="e.g. Amara Silva"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onBlur={() => setTName(true)}
                        style={{ paddingLeft: '2.5rem' }}
                      />
                      <div style={{
                        position:      'absolute',
                        left:          '0.8rem',
                        top:           '50%',
                        transform:     'translateY(-50%)',
                        color:         tokens.color.whiteFaint,
                        pointerEvents: 'none',
                      }}>
                        <Ico.User s={14} />
                      </div>
                    </div>
                    {errName && <p className="field-err">{errName}</p>}
                  </div>

                  {/* ── email ── */}
                  <div>
                    <FieldLabel text="Email Address" />
                    <div style={{ position: 'relative' }}>
                      <input
                        className={`sayo-input${errEmail ? ' err' : ''}`}
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        onBlur={() => setTEmail(true)}
                        style={{ paddingLeft: '2.5rem' }}
                      />
                      <div style={{
                        position:      'absolute',
                        left:          '0.8rem',
                        top:           '50%',
                        transform:     'translateY(-50%)',
                        color:         tokens.color.whiteFaint,
                        pointerEvents: 'none',
                      }}>
                        <Ico.Mail s={14} />
                      </div>
                    </div>
                    {errEmail && <p className="field-err">{errEmail}</p>}
                  </div>

                  {/* ── phone ── */}
                  <div>
                    <FieldLabel text="Phone Number" />
                    <div style={{ position: 'relative' }}>
                      <input
                        className={`sayo-input${errPhone ? ' err' : ''}`}
                        type="tel"
                        placeholder="+94 77 000 0000"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onBlur={() => setTPhone(true)}
                        style={{ paddingLeft: '2.5rem' }}
                      />
                      <div style={{
                        position:      'absolute',
                        left:          '0.8rem',
                        top:           '50%',
                        transform:     'translateY(-50%)',
                        color:         tokens.color.whiteFaint,
                        pointerEvents: 'none',
                      }}>
                        <Ico.Phone s={14} />
                      </div>
                    </div>
                    {errPhone && <p className="field-err">{errPhone}</p>}
                  </div>

                  {/* ── gender ── */}
                  <div>
                    <FieldLabel text="Gender" />
                    <GenderSelect
                      value={gender}
                      onChange={v => { setGender(v); setTGender(true); }}
                      onBlur={() => setTGender(true)}
                      error={errGender}
                    />
                    {errGender && <p className="field-err">{errGender}</p>}
                  </div>

                  {/* ── password ── */}
                  <div>
                    <FieldLabel text="Password" />
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      onBlur={() => setTPassword(true)}
                      error={errPass}
                    />
                    <PasswordStrengthBar password={password} />
                  </div>

                  {/* ── confirm password ── */}
                  <div>
                    <FieldLabel text="Confirm Password" />
                    <PasswordField
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      onBlur={() => setTConfirm(true)}
                      placeholder="Re-enter password"
                      error={errConfirm}
                    />
                  </div>

                </div>

                {/* ── agree to terms ── */}
                <div style={{ marginBottom: errAgree ? '0.5rem' : '1.6rem' }}>
                  <Checkbox
                    checked={agree}
                    onChange={() => { setAgree(v => !v); setTAgree(true); }}
                    label={
                      <>
                        I agree to the{' '}
                        <span className="auth-link">Terms of Service</span>
                        {' '}and{' '}
                        <span className="auth-link">Privacy Policy</span>
                      </>
                    }
                  />
                </div>
                {errAgree && (
                  <p className="field-err" style={{ marginBottom: '1rem' }}>
                    {errAgree}
                  </p>
                )}

                {/* ── server error banner ── */}
                {serverError && (
                  <div style={{
                    background:   'rgba(220,38,38,0.12)',
                    border:       '1px solid rgba(220,38,38,0.4)',
                    borderRadius: '0.5rem',
                    padding:      '0.7rem 1rem',
                    marginBottom: '1rem',
                    color:        '#fca5a5',
                    fontSize:     '0.83rem',
                    fontFamily:   tokens.font.family,
                    lineHeight:   1.5,
                  }}>
                    {serverError}
                  </div>
                )}

                {/* ── submit button (fixed) ── */}
                <button
                  type="submit"
                  className="btn-gold"
                  disabled={loading}
                  style={{
                    width:        '100%',
                    padding:      '0.9rem',
                    fontSize:     '0.9rem',
                    marginBottom: '1.4rem',
                  }}
                >
                  {loading ? (
                    <span style={{
                      display:    'inline-flex',
                      alignItems: 'center',
                      gap:        '0.5rem',
                    }}>
                      <span style={spinnerStyle} />
                      Creating Account…
                    </span>
                  ) : (
                    'Create Account'
                  )}
                </button>

                <Divider />

                <p style={{
                  textAlign:  'center',
                  color:      tokens.color.whiteFaint,
                  fontSize:   '0.82rem',
                  fontFamily: tokens.font.family,
                }}>
                  Already have an account?{' '}
                  <Link href="/login" className="auth-link">Sign In</Link>
                </p>

              </form>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}