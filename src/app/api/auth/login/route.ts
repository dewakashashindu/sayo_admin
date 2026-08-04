// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { localPrisma, cloudPrisma } from '@/lib/prisma';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    /* ── basic validation ── */
    if (!email?.trim())              return NextResponse.json({ error: 'Email address is required.'              }, { status: 400 });
    if (!password || password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });

    const emailNorm = email.trim().toLowerCase();

    /* ── try cloud first, fall back to local ── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localClient = localPrisma as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloudClient = cloudPrisma as any;

    const MODEL_NAMES = ['tbl_UserDetails', 'tblUserDetails', 'tbl_userdetails'];
    const localModel  = MODEL_NAMES.find(n => typeof localClient[n]?.findUnique === 'function');
    const cloudModel  = MODEL_NAMES.find(n => typeof cloudClient[n]?.findUnique === 'function');

    if (!localModel && !cloudModel) {
      return NextResponse.json({ error: 'User model not found. Run: npx prisma generate' }, { status: 500 });
    }

    const modelName = cloudModel ?? localModel!;

    /* ── look up user ── */
    let user: { UserId: number; UserName: string; EmailAddress: string; PasswordHash: string } | null = null;
    let source = 'cloud';

    try {
      user = await cloudClient[modelName].findUnique({
        where: { EmailAddress: emailNorm },
        select: { UserId: true, UserName: true, EmailAddress: true, PasswordHash: true },
      });
    } catch (err) {
      console.warn('[login] cloud lookup failed, trying local:', errMsg(err));
    }

    if (!user && localModel) {
      try {
        user = await localClient[localModel].findUnique({
          where: { EmailAddress: emailNorm },
          select: { UserId: true, UserName: true, EmailAddress: true, PasswordHash: true },
        });
        source = 'local';
      } catch (err) {
        console.error('[login] local lookup failed:', errMsg(err));
      }
    }

    /* ── user not found ── */
    if (!user) {
      return NextResponse.json({ error: 'No account found with this email address.' }, { status: 401 });
    }

    /* ── verify password ── */
    const passwordMatch = await bcrypt.compare(password, user.PasswordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
    }

    /* ── success ── */
    console.log(`[login] success — UserId: ${user.UserId} source: ${source}`);
    return NextResponse.json({
      success: true,
      userId:  user.UserId,
      name:    user.UserName,
      email:   user.EmailAddress,
    }, { status: 200 });

  } catch (err) {
    console.error('[login POST] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
  }
}