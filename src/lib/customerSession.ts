import {
  createSessionToken,
  verifySessionToken,
  adminCookieOptions,
  type AdminSessionPayload,
  type NewSessionInput,
} from '@/lib/adminSession';

/** Customer (public booking) session — completely separate cookie from the
    admin/staff session, so a customer cookie never grants admin access.

    Since 2026-09-29 the token also carries `aud: 'customer'`, and the verifier
    below asks for that audience. This is what actually stops the swap: before
    it, a token minted by the public /api/auth/register endpoint was accepted by
    the admin middleware as soon as the cookie was renamed. */
export const CUSTOMER_COOKIE = 'sayo_customer_session';

export type CustomerSessionPayload = AdminSessionPayload;

export async function createCustomerToken(
  p: Omit<NewSessionInput, 'sv'>,
): Promise<string | null> {
  return createSessionToken(p, 'customer');
}

export async function verifyCustomerToken(
  token: string | undefined | null,
): Promise<CustomerSessionPayload | null> {
  return verifySessionToken(token, 'customer');
}

export const customerCookieOptions = adminCookieOptions;
