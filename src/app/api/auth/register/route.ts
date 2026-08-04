import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { localPrisma, cloudPrisma } from '@/lib/prisma';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

/* ── internationally recognised gender options ── */
export const GENDER_OPTIONS = [
  { value: 'male',              label: 'Male'                  },
  { value: 'female',            label: 'Female'                },
  { value: 'non_binary',        label: 'Non-binary'            },
  { value: 'genderqueer',       label: 'Genderqueer'           },
  { value: 'genderfluid',       label: 'Gender-fluid'          },
  { value: 'agender',           label: 'Agender'               },
  { value: 'bigender',          label: 'Bigender'              },
  { value: 'two_spirit',        label: 'Two-Spirit'            },
  { value: 'prefer_not_to_say', label: 'Prefer not to say'    },
  { value: 'other',             label: 'Other'                 },
] as const;

export type GenderValue = typeof GENDER_OPTIONS[number]['value'];

const VALID_GENDERS = new Set(GENDER_OPTIONS.map(g => g.value));

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, password, gender } = body as {
      name?:     string;
      email?:    string;
      phone?:    string;
      password?: string;
      gender?:   string;
    };

    console.log('[register] body received:', {
      name,
      email,
      phone,
      gender,
      passwordLength: password?.length,
    });

    /* ── basic validation ── */
    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Full name is required.' },
        { status: 400 },
      );
    }
    if (!email?.trim()) {
      return NextResponse.json(
        { error: 'Email address is required.' },
        { status: 400 },
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 },
      );
    }

    /* ── gender validation ── */
    const genderValue = gender?.trim().toLowerCase() ?? null;
    if (genderValue && !VALID_GENDERS.has(genderValue as GenderValue)) {
      return NextResponse.json(
        { error: 'Invalid gender value provided.' },
        { status: 400 },
      );
    }

    const PasswordHash = await bcrypt.hash(password, 12);

    const data = {
      UserName:     name.trim(),
      EmailAddress: email.trim().toLowerCase(),
      PhoneNumber:  phone?.trim() ?? null,
      PasswordHash,
      Gender:       genderValue,
    };

    console.log('[register] attempting DB writes...');
    console.log('[register] localPrisma keys:', Object.keys(localPrisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
    console.log('[register] cloudPrisma keys:', Object.keys(cloudPrisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));

    let cloudResult: unknown = null;
    let localResult: unknown = null;
    let cloudError:  unknown = null;
    let localError:  unknown = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localClient = localPrisma as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cloudClient = cloudPrisma as any;

    /* ── find the correct model accessor ── */
    const MODEL_NAMES = [
      'tbl_UserDetails',
      'tblUserDetails',
      'tbl_userdetails',
      'tbl_Userdetails',
    ];
    const localModel = MODEL_NAMES.find(n => typeof localClient[n]?.create === 'function');
    const cloudModel = MODEL_NAMES.find(n => typeof cloudClient[n]?.create === 'function');

    console.log('[register] localModel accessor:', localModel);
    console.log('[register] cloudModel accessor:', cloudModel);

    if (!localModel && !cloudModel) {
      return NextResponse.json(
        { error: 'Tbl_UserDetails model not found. Run: npx prisma generate && restart server.' },
        { status: 500 },
      );
    }

    const modelName = localModel ?? cloudModel!;

    try {
      cloudResult = await cloudClient[modelName].create({ data });
    } catch (err) {
      cloudError = err;
      console.error('[register] cloud error:', errMsg(err));
    }

    try {
      localResult = await localClient[modelName].create({ data });
    } catch (err) {
      localError = err;
      console.error('[register] local error:', errMsg(err));
    }

    const isDupe = (e: unknown) =>
      e instanceof Error && (e as { code?: string }).code === 'P2002';

    if (isDupe(cloudError) || isDupe(localError)) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    if (cloudResult || localResult) {
      const saved = (cloudResult ?? localResult) as {
        UserId:       number;
        UserName:     string;
        EmailAddress: string;
        Gender:       string | null;
      };

      console.log('[register] success! UserId:', saved.UserId);

      return NextResponse.json(
        {
          success: true,
          userId:  saved.UserId,
          name:    saved.UserName,
          email:   saved.EmailAddress,
          gender:  saved.Gender,
          source:  cloudResult ? 'cloud' : 'local',
          ...(cloudResult && localError
            ? { warning: 'Saved to cloud only — local mirror failed.' }
            : {}),
          ...(localResult && cloudError
            ? { warning: 'Saved locally only — cloud was unreachable.' }
            : {}),
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        error:   'Registration failed on both databases.',
        details: { cloud: errMsg(cloudError), local: errMsg(localError) },
      },
      { status: 500 },
    );

  } catch (err) {
    console.error('[register POST] unexpected error:', err);
    return NextResponse.json(
      { error: 'Unexpected server error.', detail: errMsg(err) },
      { status: 500 },
    );
  }
}