import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

// Server-only: import this file only from Server Components and Server Actions.
export const API_URL = process.env.API_URL ?? 'http://localhost:3001';
export const SESSION_COOKIE = 'c9_session';

/** Calls the API with the signed-in user's session token, if there is one. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_URL}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(5_000), ...init, headers });
}

/** Forwards the browser's IP so the API can rate-limit per client. */
export async function clientIpHeader(): Promise<Record<string, string>> {
  const requestHeaders = await headers();
  // The proxy in front of apps/web must overwrite these headers, or clients could dodge the rate limit.
  const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0].trim() ?? requestHeaders.get('x-real-ip');
  return clientIp ? { 'X-Client-Ip': clientIp } : {};
}

/** GET for a page: no session → log in; not allowed, malformed id or missing → the 404 page. */
export async function fetchApiJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (res.status === 401) {
    redirect('/dang-nhap');
  }
  if (res.status === 400 || res.status === 403 || res.status === 404) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }
  return (await res.json()) as T;
}
