// ─────────────────────────────────────────────────────────────
//  app/api/upload-gallery-photo/route.ts
//  Server-side Cloudinary upload for gallery images.
//
//  POST  multipart/form-data
//    file        : File  (required) — JPEG / PNG / WebP / GIF, max 5 MB
//    itemLabel   : string (optional) — used to build a clean public_id
//
//  Returns { success, url, public_id, width, height }
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData();
    const file      = formData.get('file')      as File   | null;
    const itemLabel = formData.get('itemLabel') as string | null;

    /* ── Validate input ── */
    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. JPEG, PNG, WebP, or GIF only.' },
        { status: 400 },
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 5 MB.' }, { status: 400 });
    }

    /* ── Env vars ── */
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      console.error('[upload-gallery-photo] Missing Cloudinary env vars');
      return NextResponse.json(
        { error: 'Server configuration error: Cloudinary credentials not set.' },
        { status: 500 },
      );
    }

    /* ── Build public_id ── */
    const slug     = (itemLabel ?? 'gallery-item')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const publicId = `sayo/gallery/${slug}-${Date.now()}`;

    /* ── Cloudinary signed-upload params ── */
    // Keep the natural aspect ratio of gallery photos, auto quality + format only.
    const transformation = 'q_auto,f_auto';
    const timestamp      = Math.round(Date.now() / 1000);

    // Signature string: alphabetical param order, no API key, no file
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}&transformation=${transformation}`;
    const signature    = createHash('sha1')
      .update(stringToSign + apiSecret)
      .digest('hex');

    /* ── Convert File → base64 data URI ── */
    const bytes   = await file.arrayBuffer();
    const base64  = Buffer.from(bytes).toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    /* ── POST to Cloudinary Upload API ── */
    const uploadForm = new FormData();
    uploadForm.append('file',           dataUri);
    uploadForm.append('api_key',        apiKey);
    uploadForm.append('timestamp',      String(timestamp));
    uploadForm.append('public_id',      publicId);
    uploadForm.append('signature',      signature);
    uploadForm.append('transformation', transformation);

    const uploadRes  = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: uploadForm },
    );
    const uploadJson = await uploadRes.json() as {
      secure_url?: string;
      public_id?:  string;
      width?:      number;
      height?:     number;
      error?:      { message: string };
    };

    if (!uploadRes.ok || uploadJson.error) {
      console.error('[upload-gallery-photo] Cloudinary error:', uploadJson);
      return NextResponse.json(
        { error: uploadJson.error?.message ?? 'Cloudinary upload failed.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success:   true,
      url:       uploadJson.secure_url,
      public_id: uploadJson.public_id,
      width:     uploadJson.width,
      height:    uploadJson.height,
    });

  } catch (err) {
    console.error('[upload-gallery-photo] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed.' },
      { status: 500 },
    );
  }
}
