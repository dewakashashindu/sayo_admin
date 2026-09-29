'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const BACKGROUND_IMAGE =
  "url('https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')";

const WINDOW_BG: React.CSSProperties = {
  backgroundImage: BACKGROUND_IMAGE,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
};

function LoginForm() {
  const params = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState('');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /* Where the signed-in admin ends up (the middleware put ?next=… there). */
  function goToAdminArea() {
    const next = params.get('next');
    window.location.href = next && next.startsWith('/') ? next : '/dashboard';
  }

  /* Hard client-side timeout — the button can never spin forever */
  async function post(path: string, body: unknown) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      return { res, data } as { res: Response; data: any };
    } finally {
      clearTimeout(timer);
    }
  }

  const timeoutMessage = (err: unknown) =>
    err instanceof DOMException && err.name === 'AbortError'
      ? 'The server took too long to respond. Check the database connection (DATABASE_URL) and server logs, then try again.'
      : 'Could not reach the server. Please try again.';

  /** Step 1 — username + password. The super administrator gets a code next. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await post('/api/auth/admin-login', {
        username: username.trim(),
        password,
      });

      /* The hidden super administrator: the password was right, but no
         session yet — a 6-digit code has gone to the saved phone + e-mail. */
      if (data?.otpRequired) {
        setChallenge(String(data.challenge ?? ''));
        setInfo(String(data.message ?? 'A sign-in code has been sent to you.'));
        setError(String(data.error ?? ''));
        setOtp('');
        setStep('otp');
        setLoading(false);
        return;
      }

      if (res.ok && data.success) {
        /* Full-page navigation (not router.push) — guarantees a clean load
           of the admin area with the fresh session cookie. */
        goToAdminArea();
        return; // keep the button disabled while the browser navigates
      }
      setError(data?.error || 'Invalid username or password.');
      setLoading(false);
    } catch (err) {
      setError(timeoutMessage(err));
      setLoading(false);
    }
  };

  /** Step 2 — the code. Only this call hands out the session cookie. */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!challenge) {
      setError('This sign-in expired. Please start again.');
      setStep('credentials');
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Type the 6-digit code from the message.');
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await post('/api/auth/admin-login/verify-otp', {
        challenge,
        code: otp.trim(),
      });
      if (res.ok && data.success) {
        goToAdminArea();
        return;
      }
      setError(data?.error || 'That code is not correct.');
      if (res.status === 401 && /start again|expired|used or replaced/i.test(String(data?.error ?? ''))) {
        setChallenge('');
      }
      setLoading(false);
    } catch (err) {
      setError(timeoutMessage(err));
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!challenge || loading) return;
    setError('');
    setLoading(true);
    try {
      const { res, data } = await post('/api/auth/admin-login/resend-otp', { challenge });
      if (res.ok && data?.otpRequired) {
        setInfo(String(data.message ?? 'A new code has been sent.'));
      } else {
        setError(data?.error || 'Could not send a new code.');
      }
      setLoading(false);
    } catch (err) {
      setError(timeoutMessage(err));
      setLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <form className="w-full max-w-[300px] space-y-3.5" onSubmit={handleVerifyOtp}>
        <p className="text-[13px] text-gray-700 font-semibold">Two-step verification</p>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          {info || 'A 6-digit code was sent to the registered phone number and e-mail.'}
        </p>

        <div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            className="w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm tracking-[0.35em] text-center focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400 text-gray-900 caret-[#1e3a40]"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            disabled={loading}
            autoFocus
          />
        </div>

        {error && (
          <p className="text-[12px] text-[#cb5a5a] font-medium text-left" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#bcd1cb] hover:bg-[#a6bcb6] text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Checking…' : 'Verify & sign in'}
        </button>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={loading || !challenge}
            className="text-[11px] text-[#6b8a84] hover:text-[#4f6d68] font-medium underline-offset-2 hover:underline disabled:opacity-50"
          >
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('credentials');
              setChallenge('');
              setOtp('');
              setError('');
              setInfo('');
            }}
            className="text-[11px] text-gray-400 hover:text-gray-600 font-medium underline-offset-2 hover:underline"
          >
            Back
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="w-full max-w-[300px] space-y-3.5" onSubmit={handleSubmit}>
      {/* Email / username field */}
      <div>
        <input
          type="text"
          placeholder="username"
          className="w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400 text-gray-900 caret-[#1e3a40]"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          disabled={loading}
        />
      </div>

      {/* Password field */}
      <div>
        <input
          type="password"
          placeholder="password"
          className="w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400 text-gray-900 caret-[#1e3a40]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={loading}
        />
      </div>

      {/* Error message */}
      {error && (
        <p className="text-[12px] text-[#cb5a5a] font-medium text-left" role="alert">
          {error}
        </p>
      )}

      {/* Forgot password — self-service OTP reset */}
      <div className="text-right">
        <a
          href="/admin-login/forgot-password"
          className="text-[11px] text-[#6b8a84] hover:text-[#4f6d68] font-medium underline-offset-2 hover:underline"
        >
          Forgot password?
        </a>
      </div>

      {/* Login button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-[#bcd1cb] hover:bg-[#a6bcb6] text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-sm active:scale-[0.98] mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in…' : 'Login'}
      </button>

      {/* No public signup — accounts are created by an administrator */}
      <p className="text-[11px] text-gray-400 pt-2">
        Accounts are created by the system administrator.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    /* The whole window is the picture now — no more flat dark-green gradient. */
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-6 bg-cover bg-center bg-fixed"
      style={{ backgroundImage: BACKGROUND_IMAGE }}
    >
      {/* Soft veil so the white card and the logo stay readable on the photo */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1614]/75 via-[#12211f]/45 to-[#0b1614]/65" />

      {/* Top Right Logo */}
      <div className="absolute top-6 right-8 z-10 drop-shadow">
        <img src="/sayologo.png" alt="SAYO" className="h-12 w-auto" />
      </div>

      {/* Main Card */}
      <div className="relative z-10 w-[880px] max-w-full md:h-[500px] bg-white rounded-[24px] p-4 flex flex-col md:flex-row shadow-2xl">

        <div
          className="relative w-full md:w-[45%] h-[190px] md:h-full rounded-[18px] overflow-hidden p-6 flex flex-col justify-start"
          style={WINDOW_BG}
        >
          {/* gentle shading inside the window so the titles keep their contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-black/25" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="bg-white/90 rounded-full p-2 shadow">
              <img src="/sayologo.png" alt="SAYO" className="h-8 w-auto" />
            </div>
            <div>
              <h2 className="text-[#e3b467] text-xl font-bold tracking-wider uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                SAYO BEAUTY
              </h2>
              <p className="text-white font-extrabold text-xs tracking-wider mt-0.5 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                ADMIN PORTAL
              </p>
            </div>
          </div>
        </div>

        {/* Right side - Form */}
        <div className="w-full md:w-[55%] md:h-full px-10 py-6 flex flex-col justify-center items-center text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Hi SAYO..!
          </h1>
          <p className="text-gray-500 text-xs mt-1 mb-8 font-medium">
            Welcome to Admin Portal.
          </p>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

      </div>
    </div>
  );
}
