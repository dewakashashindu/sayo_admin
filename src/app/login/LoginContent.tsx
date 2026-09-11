'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

export default function LoginContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState('');

  const [tEmail,    setTEmail]    = useState(false);
  const [tPassword, setTPassword] = useState(false);

  const errEmail    = tEmail    && !isValidEmail(email)   ? 'Enter a valid email address.'             : '';
  const errPassword = tPassword && password.length < 6    ? 'Password must be at least 6 characters.'  : '';
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

      // The server sets a signed httpOnly session cookie — no client-side
      // user store needed. Full-page navigation so the booking page loads
      // with the fresh session.
      const redirectTo = searchParams.get('redirect');
      window.location.href = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/booking';
      return;

    } catch {
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ══ FORM ══ */
  return (
    <>
      <style>{globalCss}</style>
      <main style={mainStyle}>
        <div style={overlayStyle} />
        <div style={pageWrapStyle}>

          {/* back */}
          <div className="reveal-up" style={{ maxWidth: '440px', margin: '0 auto', width: '100%' }}>
            <Link href="https://sayoweb.netlify.app/" className="back-link" style={{ marginBottom: '1.75rem', display: 'inline-flex' }}>
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