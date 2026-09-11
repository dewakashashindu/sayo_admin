import {
  createSessionToken,
  verifySessionToken,
  adminCookieOptions,
  type AdminSessionPayload,
} from '@/lib/adminSession';

/** Customer (public booking) session — completely separate cookie from the
    admin/staff session, so a customer cookie never grants admin access. */
export const CUSTOMER_COOKIE = 'sayo_customer_session';

export type CustomerSessionPayload = AdminSessionPayload;

export async function createCustomerToken(
  p: Omit<AdminSessionPayload, 'exp'>,
): Promise<string | null> {
  return createSessionToken(p);
}

export async function verifyCustomerToken(
  token: string | undefined | null,
): Promise<CustomerSessionPayload | null> {
  return verifySessionToken(token);
}

export const customerCookieOptions = adminCookieOptions;
