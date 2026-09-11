import { prisma } from '@/lib/prisma';

/**
 * Writes a row into `adminactivitylog` — the feed shown under
 * "Recent Activities" on the dashboard (booking events, SMS results,
 * confirm/cancel/check-in actions, …).
 *
 * Never throws: a failed log write must not break the calling flow.
 */
export async function logActivity(
  actor: string,
  section: string,
  action: string,
): Promise<void> {
  try {
    await prisma.adminactivitylog.create({
      data: {
        adminUsername: (actor || 'system').slice(0, 100),
        section: (section || 'system').slice(0, 50),
        action: (action || '').slice(0, 255),
      },
    });
  } catch (err) {
    console.error('[ACTIVITY_LOG_FAILED]', err);
  }
}

/** 0771234567 -> 077***567 (safe for logs / activity feed) */
export function maskPhoneForLog(phone: string): string {
  const p = (phone || '').trim();
  if (p.length < 7) return p || 'unknown';
  return `${p.slice(0, 3)}***${p.slice(-3)}`;
}
