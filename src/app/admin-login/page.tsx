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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setLoading(true);

    /* Hard client-side timeout — the button can never spin forever */
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);

    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      clearTimeout(timer);
      if (res.ok && data.success) {
        /* Full-page navigation (not router.push) — guarantees a clean load
           of the admin area with the fresh session cookie. */
        const next = params.get('next');
        window.location.href = next && next.startsWith('/') ? next : '/admin';
        return; // keep the button disabled while the browser navigates
      }
      setError(data?.error || 'Invalid username or password.');
      setLoading(false);
    } catch (err) {
      clearTimeout(timer);
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'The server took too long to respond. Check the database connection (DATABASE_URL) and server logs, then try again.'
          : 'Could not reach the server. Please try again.',
      );
      setLoading(false);
    }
  };

  return (
    <form className="w-full max-w-[300px] space-y-3.5" onSubmit={handleSubmit}>
      {/* Email / username field */}
      <div>
        <input
          type="text"
          placeholder="username"
          className="w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400"
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
          className="w-full px-4 py-3 rounded-xl bg-[#f8fafc] border border-gray-200 text-sm focus:outline-none focus:border-[#bcd1cb] transition-colors placeholder:text-gray-400"
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

      {/* Forgot password hint */}
      <div className="text-right">
        <span className="text-[11px] text-gray-400" title="Ask a system administrator to reset your password from Settings → Users">
          Forgot password? Ask your system administrator
        </span>
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
      {/* Soft veil so the white card and the gold logo stay readable on the photo */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1614]/75 via-[#12211f]/45 to-[#0b1614]/65" />

      {/* Top Right Logo */}
      <div className="absolute top-6 right-8 z-10 flex flex-col items-center justify-center text-[#d4a359]">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 drop-shadow">
          <path d="M12 3c-1.2 2.2-2.8 4.2-4.5 6 1.7 1.8 3.3 3.8 4.5 6 1.2-2.2 2.8-4.2 4.5-6-1.7-1.8-3.3-3.8-4.5-6z" />
        </svg>
        <span className="text-[10px] font-semibold tracking-widest text-[#d4a359] uppercase mt-0.5 drop-shadow">SAYO</span>
      </div>

      {/* Main Card */}
      <div className="relative z-10 w-[880px] max-w-full md:h-[500px] bg-white rounded-[24px] p-4 flex flex-col md:flex-row shadow-2xl">

        {}
        <div
          className="relative w-full md:w-[45%] h-[190px] md:h-full rounded-[18px] overflow-hidden p-6 flex flex-col justify-start"
          style={WINDOW_BG}
        >
          {/* gentle shading inside the window so the titles keep their contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-black/25" />
          <div className="relative z-10">
            <h2 className="text-[#e3b467] text-xl font-bold tracking-wider uppercase drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              SAYO BEAUTY
            </h2>
            <p className="text-white font-extrabold text-xs tracking-wider mt-0.5 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
              ADMIN PORTAL
            </p>
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
