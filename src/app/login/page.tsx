'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  tokens,
  globalCss,
  Ico,
  Card,
  Label,
  FieldLabel,
  PasswordField,
  Checkbox,
  Divider,
  isValidEmail,
  mainStyle,
  overlayStyle,
  pageWrapStyle,
  spinnerStyle,
} from '@/components/auth/shared';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [userName, setUserName] = useState('');
  const [apiError, setApiError] = useState('');

  const [tEmail, setTEmail]       = useState(false);
  const [tPassword, setTPassword] = useState(false);

  const errEmail    = tEmail    && !isValidEmail(email) ? 'Enter a valid email address.'            : '';
  const errPassword = tPassword && password.length < 6  ? 'Password must be at least 6 characters.' : '';
  const canSubmit   = isValidEmail(email) && password.length >= 6;

  /* ══ SUBMIT ══ */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTEmail(true);
    setTPassword(true);
    setApiError('');
    if (!canSubmit) return;

    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setApiError(data.error ?? 'Sign in failed. Please try again.');
        return;
      }

      /* ── store minimal session info ── */
      sessionStorage.setItem('sayo_user', JSON.stringify({
        userId: data.userId,
        name:   data.name,
        email:  data.email,
      }));

      setUserName(data.name);
      setSuccess(true);

      /* ── auto-redirect after 2 s ── */
      setTimeout(() => router.push('/booking'), 2000);

    } catch {
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ══ SUCCESS ══ */
  if (success) {
    return (
      <>
        <style>{globalCss}</style>
        <main style={mainStyle}>
          <div style={overlayStyle} />
          <div style={{
            position: 'relative', zIndex: 1,
            minHeight: '100vh', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '2rem',
          }}>
            <div className="reveal-up" style={{ maxWidth: '460px', textAlign: 'center' }}>

              <div className="check-pop" style={{
                width: '5.5rem', height: '5.5rem', borderRadius: '50%',
                background: 'rgba(184,134,11,0.15)',
                border: `2px solid ${tokens.color.gold}`,
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 1.5rem',
              }}>
                <Ico.Check s={34} c={tokens.color.gold} />
              </div>

              <p style={{
                color: tokens.color.gold, fontSize: '0.68rem', fontWeight: 700,
                letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: '0.5rem',
              }}>
                Signed In Successfully
              </p>

              <h2 style={{
                color: '#fff', fontSize: 'clamp(1.6rem,3vw,2.2rem)',
                fontWeight: 600, marginBottom: '0.75rem',
              }}>
                Welcome Back, {userName.split(' ')[0]}!
              </h2>

              <p style={{
                color: tokens.color.whiteMuted, fontSize: '0.88rem',
                lineHeight: 1.8, marginBottom: '2rem',
              }}>
                You have successfully signed in to your Sayo account.
                <br />
                <span style={{ color: tokens.color.whiteFaint, fontSize: '0.8rem' }}>
                  Redirecting you to the booking page…
                </span>
              </p>

              <Link
                href="/booking"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                  padding: '0.85rem 2.5rem', fontSize: '0.9rem',
                  background: 'linear-gradient(135deg,#B8860B,#d4a017)',
                  color: '#fff', borderRadius: '0.75rem',
                  fontFamily: tokens.font.family, fontWeight: 600,
                  letterSpacing: '0.06em', textDecoration: 'none',
                  boxShadow: '0 8px 28px rgba(184,134,11,0.38)',
                }}
              >
                Go to Booking Page
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  /* ══ FORM ══ */
  return (
    <>
      <style>{globalCss}</style>
      <main style={mainStyle}>
        <div style={overlayStyle} />
        <div style={pageWrapStyle}>

          {/* back */}
          <div className="reveal-up" style={{ maxWidth: '440px', margin: '0 auto', width: '100%' }}>
            <Link href="/" className="back-link" style={{ marginBottom: '1.75rem', display: 'inline-flex' }}>
              <Ico.ArrowLeft s={13} /> Back to Home
            </Link>
          </div>

          {/* hero */}
          <div className="reveal-up" style={{ textAlign: 'center', marginBottom: 'clamp(1.5rem,4vw,2.5rem)' }}>
            <div style={{
              width: '3.5rem', height: '3.5rem', borderRadius: '50%',
              background: 'rgba(184,134,11,0.15)',
              border: '1.5px solid rgba(184,134,11,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <Ico.Sparkle s={22} c={tokens.color.gold} />
            </div>

            <p style={{
              color: tokens.color.gold, fontSize: '0.68rem', fontWeight: 700,
              letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '0.55rem',
            }}>
              Member Access
            </p>

            <h1 style={{
              color: '#fff', fontSize: tokens.font.heroTitle,
              fontWeight: 600, lineHeight: 1.15, marginBottom: '0.65rem',
            }}>
              Welcome <span style={{ color: tokens.color.gold }}>Back</span>
            </h1>

            <p style={{
              color: tokens.color.whiteMuted, fontSize: tokens.font.heroSub,
              lineHeight: 1.7, maxWidth: '380px', margin: '0 auto',
            }}>
              Sign in to manage your bookings and preferences.
            </p>
          </div>

          {/* card */}
          <div className="reveal-up-d1" style={{ maxWidth: '440px', margin: '0 auto', width: '100%' }}>
            <Card>
              <form onSubmit={handleSubmit}>
                <Label text="Sign In to Your Account" />

                {/* api error banner */}
                {apiError && (
                  <div style={{
                    background: 'rgba(220,38,38,0.12)',
                    border: '1px solid rgba(220,38,38,0.4)',
                    borderRadius: '0.625rem',
                    padding: '0.65rem 0.9rem',
                    marginBottom: '1rem',
                    display: 'flex', gap: '0.5rem', alignItems: 'center',
                  }}>
                    <span style={{
                      color: '#fca5a5', fontSize: '0.78rem',
                      fontFamily: tokens.font.family,
                    }}>
                      {apiError}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>

                  {/* email */}
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
                        position: 'absolute', left: '0.8rem', top: '50%',
                        transform: 'translateY(-50%)', color: tokens.color.whiteFaint,
                        pointerEvents: 'none',
                      }}>
                        <Ico.Mail s={14} />
                      </div>
                    </div>
                    {errEmail && <p className="field-err">{errEmail}</p>}
                  </div>

                  {/* password */}
                  <div>
                    <FieldLabel text="Password" />
                    <PasswordField
                      value={password}
                      onChange={setPassword}
                      onBlur={() => setTPassword(true)}
                      error={errPassword}
                    />
                  </div>
                </div>

                {/* remember + forgot */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: '1.6rem',
                  flexWrap: 'wrap', gap: '0.5rem',
                }}>
                  <Checkbox
                    checked={remember}
                    onChange={() => setRemember(v => !v)}
                    label="Remember me"
                  />
                  <Link href="/forgot-password" className="auth-link" style={{ fontSize: '0.78rem' }}>
                    Forgot Password?
                  </Link>
                </div>

                {/* submit */}
                <button
                  type="submit"
                  className="btn-gold"
                  disabled={loading}
                  style={{ width: '100%', padding: '0.9rem', fontSize: '0.9rem', marginBottom: '1.4rem' }}
                >
                  {loading
                    ? (<><span style={spinnerStyle} />Signing In…</>)
                    : 'Sign In'
                  }
                </button>

                <Divider />

                <p style={{
                  textAlign: 'center', color: tokens.color.whiteFaint,
                  fontSize: '0.82rem', fontFamily: tokens.font.family,
                }}>
                  Don&apos;t have an account?{' '}
                  <Link href="/register" className="auth-link">Create Account</Link>
                </p>
              </form>
            </Card>

            <p style={{
              textAlign: 'center', color: tokens.color.whiteFaint,
              fontSize: '0.7rem', marginTop: '1.25rem',
              fontFamily: tokens.font.family, lineHeight: 1.6,
            }}>
              By signing in you agree to our{' '}
              <span className="auth-link" style={{ fontSize: '0.7rem' }}>Terms of Service</span>
              {' '}and{' '}
              <span className="auth-link" style={{ fontSize: '0.7rem' }}>Privacy Policy</span>.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}