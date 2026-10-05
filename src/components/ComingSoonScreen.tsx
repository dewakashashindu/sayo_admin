'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar, { SIDEBAR_CSS } from '@/components/AdminSidebar';
import { useMyAccess } from '@/lib/useMyAccess';
import NoAccess from '@/components/NoAccess';
import AccessLoading from '@/components/AccessLoading';
import UserName from '@/components/UserName';

const PAGE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: 'Inter', sans-serif; overflow: hidden; }
  @media (max-width: 767px) {
    .cs-main { padding-bottom: 88px !important; }
  }
`;

export default function ComingSoonScreen({
  navKey,
  title,
  screen,
}: {
  navKey: string;
  title: string;
  screen: string;
}) {
  const { loaded, enforce, has } = useMyAccess();
  const router = useRouter();
  const [active, setActive] = useState(navKey);

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#c2d4d4' }}>
        <AccessLoading />
      </div>
    );
  }
  if (enforce && !has(screen, 'ACCESS')) {
    return <NoAccess screen={title} />;
  }

  function handleNavigate(key: string, path: string) {
    setActive(key);
    if (path) router.push(path);
  }

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <style>{PAGE_CSS}</style>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#c2d4d4' }}>
        <AdminSidebar active={active} onNav={handleNavigate} onLogout={() => router.push('/admin-login')} />
        <div className="cs-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <header style={{
            background: '#dae6e6', height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
            padding: '0 18px', gap: 12, borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#1e3a40', letterSpacing: '0.02em' }}>{title}</p>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}><UserName /></span>
          </header>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{
              textAlign: 'center', background: '#fff', border: '1.5px solid #d8e4e6',
              borderRadius: 16, padding: '48px 40px', maxWidth: 440, width: '100%',
              boxShadow: '0 8px 28px rgba(30,58,64,0.08)',
            }}>
              <p style={{
                color: '#1e3a40', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em',
                textTransform: 'uppercase', marginBottom: 10,
              }}>
                {title}
              </p>
              <h1 style={{ color: '#1e3a40', fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Coming soon</h1>
              <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6 }}>
                This screen is not ready yet. Check back shortly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
