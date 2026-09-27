'use client';

import React, { useState } from 'react';
import Link from 'next/link';

const BACKGROUND_IMAGE =
  "url('https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState('');
  const [phoneMasked, setPhoneMasked] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Type your login name first.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) { setError(data?.error || 'Could not send the OTP.'); setLoading(false); return; }
      setPhoneMasked(data.phoneMasked || '');
      setInfo(data.phoneMasked ? `OTP sent to ${data.phoneMasked}.` : (data.message || 'OTP sent.'));
      setStep(2);
      setLoading(false);
    } catch {
      setError('Could not reach the server. Please try again.');
      setLoading(false);
    }
  }

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!otp.trim()) { setError('Type the OTP.'); return; }
    if (!password) { setError('Type the new password.'); return; }
    if (password !== password2) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), otp: otp.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) { setError(data?.error || 'Could not reset the password.'); setLoading(false); return; }
      setInfo('Password reset ✓ — log in with your new password.');
      setStep(3);
      setLoading(false);
    } catch {
      setError('Could not reach the server. Please try again.');
      setLoading(false);
    }
  }

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400 text-gray-900 caret-[#1e3a40]';

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-6 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: BACKGROUND_IMAGE }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1614]/75 via-[#12211f]/45 to-[#0b1614]/65" />

      <div className="absolute top-6 right-8 z-10 drop-shadow">
        <img src="/sayologo.png" alt="SAYO" className="h-12 w-auto" />
      </div>

      <div className="relative z-10 w-[420px] max-w-full bg-white rounded-[24px] p-8 shadow-2xl text-center">
        <div className="flex justify-center mb-4">
          <img src="/sayologo.png" alt="SAYO" className="h-12 w-auto" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Reset Password</h1>

        {step === 1 && (
          <>
            <p className="text-gray-500 text-xs mt-1 mb-6 font-medium">
              Type your login name — we will text an OTP to the contact number saved on your account. It expires in 10 minutes.
            </p>
            <form onSubmit={sendOtp} className="space-y-3.5">
              <input className={inputCls} placeholder="login name" value={username}
                onChange={(e) => setUsername(e.target.value)} autoComplete="username" disabled={loading} />
              {error && <p className="text-[12px] text-[#cb5a5a] font-medium text-left" role="alert">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#bcd1cb] hover:bg-[#a6bcb6] text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-60">
                {loading ? 'Sending OTP…' : 'Send OTP'}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-gray-500 text-xs mt-1 mb-6 font-medium">
              {info || 'Check your messages.'} Type the OTP and your new password.
            </p>
            <form onSubmit={doReset} className="space-y-3.5">
              <input className={inputCls} placeholder="6-digit OTP" value={otp}
                onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" disabled={loading} />
              <input className={inputCls} type="password" placeholder="new password" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={loading} />
              <input className={inputCls} type="password" placeholder="new password again" value={password2}
                onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" disabled={loading} />
              {error && <p className="text-[12px] text-[#cb5a5a] font-medium text-left" role="alert">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#bcd1cb] hover:bg-[#a6bcb6] text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-60">
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
              <button type="button" disabled={loading}
                onClick={() => { setStep(1); setOtp(''); setError(''); }}
                className="text-[11px] text-[#6b8a84] hover:underline underline-offset-2">
                ← did not arrive? send again
              </button>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-gray-600 text-sm mt-4 mb-6 font-medium">{info}</p>
            <Link
              href="/admin-login"
              className="inline-block w-full py-3 bg-[#bcd1cb] hover:bg-[#a6bcb6] text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-sm"
            >
              Back to Login
            </Link>
          </>
        )}

        {step !== 3 && (
          <Link href="/admin-login" className="block text-[11px] text-gray-400 hover:text-gray-500 mt-5">
            ← back to login
          </Link>
        )}
      </div>
    </div>
  );
}
