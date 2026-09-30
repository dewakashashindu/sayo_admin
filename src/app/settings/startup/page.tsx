'use client';
// /settings/startup — kept alive as a doorway.
//
// 2026-09-29 — "Start-up Settings" became a MENU GROUP holding the site editor
// (System Settings → Start-up Settings → Edit Site, which is /admin). This URL
// used to be the placeholder page; it now just sends you to the real screen, so
// an old bookmark or a typed address still lands somewhere useful.
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMyAccess } from '@/lib/useMyAccess';
import AccessLoading from '@/components/AccessLoading';
import NoAccessHome from '@/components/NoAccessHome';

export default function StartupSettingsPage() {
  const router = useRouter();
  const { loaded, enforce, has } = useMyAccess();

  useEffect(() => {
    if (loaded && (!enforce || has('EDITSITE', 'ACCESS'))) router.replace('/admin');
  }, [loaded, enforce, has, router]);

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#c2d4d4' }}>
        <AccessLoading />
      </div>
    );
  }
  if (enforce && !has('EDITSITE', 'ACCESS')) return <NoAccessHome screen="Start-up Settings" />;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#c2d4d4', color: '#1e3a40', fontSize: 13 }}>
      Opening Edit Site…
    </div>
  );
}
