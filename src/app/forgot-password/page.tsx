'use client';

import { useState, useRef, useEffect } from 'react';
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
  AuthStepIndicator,
  isValidEmail,
  mainStyle,
  overlayStyle,
  pageWrapStyle,
  spinnerStyle,
} from '@/components/auth/shared';

type ForgotStep = 1 | 2 | 3;

const STEP_LABELS = ['Email', 'Verify', 'Reset'];

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<ForgotStep>(1);

  /* step 1 */
  const [email, setEmail]   = useState('');
  const [tEmail, setTEmail] = useState(false);

  /* step 2 */
  const [otp, setOtp]               = useState<string[]>(Array(6).fill(''));
  const otpRefs                      = useRef<(HTMLInputElement | null)[]>([]);
  const [resendTimer, setResendTimer] = useState(30);
  const [otpError, setOtpError]       = useState('');

  /* step 3 */
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tNew, setTNew]         = useState(false);
  const [tConfirm, setTConfirm] = useState(false);

  /* shared */
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  /* resend countdown */
  useEffect(() => {
    if (step !== 2 || resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendTimer]);

  /* focus first OTP box when entering step 2 */
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const errEmail   = tEmail && !isValidEmail(email) ? 'Enter a valid email address.' : '';
  const otpCode    = otp.join('');
  const canSend    = isValidEmail(email);
  const canVerify  = otpCode.length === 6;

  const errNew     = tNew     && newPassword.length < 6           ? 'Password must be at least 6 characters.' : '';
  const errConfirm = tConfirm && confirmPassword !== newPassword  ? 'Passwords do not match.'                 : '';
  const canReset   = newPassword.length >= 6 && confirmPassword === newPassword;

  /* ── STEP 1 — send code ── */
  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    setTEmail(true);
    if (!canSend) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(2);
      setResendTimer(30);
      setOtp(Array(6).fill(''));
      setOtpError('');
    }, 1300);
  };

  /* ── STEP 2 — OTP ── */
  const handleOtpChange = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    setOtpError('');
    if (v && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = [...otp];
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canVerify) { setOtpError('Please enter all 6 digits.'); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      /* simulate wrong code for demo — remove in production */
      setStep(3);
    }, 1000);
  };

  const handleResend = () => {
    if (resendTimer > 0) return;
    setOtp(Array(6).fill(''));
    setOtpError('');
    setResendTimer(30);
    setTimeout(() => otpRefs.current[0]?.focus(), 50);
  };

  /* ── STEP 3 — reset ── */
  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setTNew(true);
    setTConfirm(true);
    if (!canReset) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1300);
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
            <div className="reveal-up" style={{ maxWidth: '480px', textAlign: 'center' }}>
              <div className="check-pop" style={{
                width: '5.5rem', height: '5.5rem', borderRadius: '50%',
                background: 'rgba(34,197,94,0.15)',
                border: `2px solid ${tokens.color.green}`,
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 1.5rem',
              }}>
                <Ico.Shield s={30} c={tokens.color.green} />
              </div>
              <p style={{
                color: tokens.color.green, fontSize: '0.68rem', fontWeight: 700,
                letterSpacing: '0.28em', textTransform: 'uppercase', marginBottom: '0.5rem',
              }}>
                Password Reset
              </p>
              <h2 style={{
                color: '#fff', fontSize: 'clamp(1.6rem,3vw,2.2rem)',
                fontWeight: 600, marginBottom: '0.75rem',
              }}>
                All Done!
              </h2>
              <p style={{
                color: tokens.color.whiteMuted, fontSize: '0.88rem',
                lineHeight: 1.8, marginBottom: '2rem',
              }}>
                Your password has been reset successfully.
                <br />You can now sign in with your new password.
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                  padding: '0.85rem 2.5rem', fontSize: '0.9rem',
                  background: 'linear-gradient(135deg,#B8860B,#d4a017)',
                  color: '#fff', borderRadius: '0.75rem',
                  fontFamily: tokens.font.family, fontWeight: 600,
                  letterSpacing: '0.06em', textDecoration: 'none',
                }}
              >
                Back to Sign In
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
            <Link href="/login" className="back-link" style={{ marginBottom: '1.75rem', display: 'inline-flex' }}>
              <Ico.ArrowLeft s={13} /> Back to Sign In
            </Link>
          </div>

          {/* hero */}
          <div className="reveal-up" style={{ textAlign: 'center', marginBottom: 'clamp(1.25rem,3vw,2rem)' }}>
            <div style={{
              width: '3.5rem', height: '3.5rem', borderRadius: '50%',
              background: 'rgba(184,134,11,0.15)',
              border: `1.5px solid rgba(184,134,11,0.4)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1rem',
            }}>
              <Ico.Lock s={20} c={tokens.color.gold} />
            </div>
            <p style={{
              color: tokens.color.gold, fontSize: '0.68rem', fontWeight: 700,
              letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '0.55rem',
            }}>
              Account Recovery
            </p>
            <h1 style={{
              color: '#fff', fontSize: tokens.font.heroTitle,
              fontWeight: 600, lineHeight: 1.15, marginBottom: '0.65rem',
            }}>
              Reset Your <span style={{ color: tokens.color.gold }}>Password</span>
            </h1>
            <p style={{
              color: tokens.color.whiteMuted, fontSize: tokens.font.heroSub,
              lineHeight: 1.7, maxWidth: '400px', margin: '0 auto',
            }}>
              {step === 1 && 'Enter your email and we will send you a reset code.'}
              {step === 2 && `We sent a 6-digit code to ${email}`}
              {step === 3 && 'Almost there — choose a new password.'}
            </p>
          </div>

          {/* step indicator */}
          <AuthStepIndicator current={step} total={3} labels={STEP_LABELS} />

          {/* card */}
          <div className="reveal-up-d1" style={{ maxWidth: '440px', margin: '0 auto', width: '100%' }}>
            <Card>

              {/* ── STEP 1 — EMAIL ── */}
              {step === 1 && (
                <form onSubmit={handleSendCode}>
                  <Label text="Email Verification" />
                  <div style={{ marginBottom: '1.6rem' }}>
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

                  <div style={{
                    background: 'rgba(184,134,11,0.08)',
                    border: '1px solid rgba(184,134,11,0.25)',
                    borderRadius: '0.625rem',
                    padding: '0.65rem 0.9rem',
                    marginBottom: '1.4rem',
                    fontSize: '0.74rem',
                    color: tokens.color.whiteDim,
                    fontFamily: tokens.font.family,
                    lineHeight: 1.6,
                  }}>
                    A one-time verification code will be sent to your registered email address.
                  </div>

                  <button
                    type="submit"
                    className="btn-gold"
                    disabled={loading || !canSend}
                    style={{ width: '100%', padding: '0.9rem', fontSize: '0.9rem', marginBottom: '1.25rem' }}
                  >
                    {loading
                      ? (<><span style={spinnerStyle} />Sending Code…</>)
                      : 'Send Reset Code'
                    }
                  </button>

                  <p style={{
                    textAlign: 'center', color: tokens.color.whiteFaint,
                    fontSize: '0.82rem', fontFamily: tokens.font.family,
                  }}>
                    Remembered your password?{' '}
                    <Link href="/login" className="auth-link">Sign In</Link>
                  </p>
                </form>
              )}

              {/* ── STEP 2 — OTP ── */}
              {step === 2 && (
                <form onSubmit={handleVerifyOtp}>
                  <Label text="Enter Verification Code" />

                  <p style={{
                    color: tokens.color.whiteFaint, fontSize: '0.78rem',
                    marginBottom: '1.4rem', fontFamily: tokens.font.family,
                    lineHeight: 1.6,
                  }}>
                    We sent a 6-digit code to{' '}
                    <strong style={{ color: tokens.color.gold }}>{email}</strong>.
                    Check your inbox and spam folder.
                  </p>

                  {/* OTP inputs */}
                  <div className="otp-wrap" onPaste={handleOtpPaste}>
                    {otp.map((v, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el; }}
                        className={`otp-box${v ? ' filled' : ''}`}
                        inputMode="numeric"
                        maxLength={1}
                        value={v}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                      />
                    ))}
                  </div>

                  {otpError && (
                    <p className="field-err" style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                      {otpError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="btn-gold"
                    disabled={loading || !canVerify}
                    style={{ width: '100%', padding: '0.9rem', fontSize: '0.9rem', marginBottom: '1.15rem' }}
                  >
                    {loading
                      ? (<><span style={spinnerStyle} />Verifying…</>)
                      : 'Verify Code'
                    }
                  </button>

                  {/* resend */}
                  <div style={{
                    display: 'flex', justifyContent: 'center',
                    alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap',
                  }}>
                    <span style={{
                      color: tokens.color.whiteFaint, fontSize: '0.78rem',
                      fontFamily: tokens.font.family,
                    }}>
                      Didn&apos;t receive it?
                    </span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendTimer > 0}
                      style={{
                        background: 'none', border: 'none',
                        cursor: resendTimer > 0 ? 'not-allowed' : 'pointer',
                        color: resendTimer > 0 ? tokens.color.whiteFaint : tokens.color.gold,
                        fontSize: '0.78rem', fontWeight: 600,
                        fontFamily: tokens.font.family,
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        transition: 'color 0.2s',
                      }}
                    >
                      <Ico.Refresh s={11} />
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend Code'}
                    </button>
                  </div>

                  {/* change email */}
                  <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => { setStep(1); setOtp(Array(6).fill('')); }}
                      style={{
                        background: 'none', border: 'none',
                        color: tokens.color.whiteFaint, fontSize: '0.75rem',
                        fontFamily: tokens.font.family, cursor: 'pointer',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = tokens.color.gold)}
                      onMouseLeave={e => (e.currentTarget.style.color = tokens.color.whiteFaint)}
                    >
                      ← Change email address
                    </button>
                  </div>
                </form>
              )}

              {/* ── STEP 3 — NEW PASSWORD ── */}
              {step === 3 && (
                <form onSubmit={handleResetPassword}>
                  <Label text="Create New Password" />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.6rem' }}>
                    <div>
                      <FieldLabel text="New Password" />
                      <PasswordField
                        value={newPassword}
                        onChange={setNewPassword}
                        onBlur={() => setTNew(true)}
                        error={errNew}
                      />
                      <PasswordStrengthBar password={newPassword} />
                    </div>

                    <div>
                      <FieldLabel text="Confirm New Password" />
                      <PasswordField
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        onBlur={() => setTConfirm(true)}
                        placeholder="Re-enter new password"
                        error={errConfirm}
                      />
                    </div>
                  </div>

                  {/* password tips */}
                  <div style={{
                    background: 'rgba(184,134,11,0.08)',
                    border: '1px solid rgba(184,134,11,0.22)',
                    borderRadius: '0.625rem',
                    padding: '0.7rem 0.9rem',
                    marginBottom: '1.4rem',
                  }}>
                    <p style={{
                      color: tokens.color.gold, fontSize: '0.67rem', fontWeight: 700,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      marginBottom: '0.45rem', fontFamily: tokens.font.family,
                    }}>
                      Password Tips
                    </p>
                    {[
                      'At least 8 characters',
                      'Mix of uppercase and lowercase',
                      'Include numbers and symbols',
                    ].map(tip => (
                      <div key={tip} style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        marginBottom: '0.2rem',
                      }}>
                        <div style={{
                          width: '0.35rem', height: '0.35rem', borderRadius: '50%',
                          background: tokens.color.gold, flexShrink: 0,
                        }} />
                        <span style={{
                          color: tokens.color.whiteFaint, fontSize: '0.72rem',
                          fontFamily: tokens.font.family,
                        }}>
                          {tip}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="btn-gold"
                    disabled={loading || !canReset}
                    style={{ width: '100%', padding: '0.9rem', fontSize: '0.9rem' }}
                  >
                    {loading
                      ? (<><span style={spinnerStyle} />Resetting Password…</>)
                      : 'Reset Password'
                    }
                  </button>
                </form>
              )}

            </Card>
          </div>

        </div>
      </main>
    </>
  );
}