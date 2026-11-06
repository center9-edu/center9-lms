import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { apiFetch, SESSION_COOKIE } from './api';

// Server-only: import this file only from Server Components and Server Actions.

export type Role = 'SUPER_ADMIN' | 'CENTER_ADMIN' | 'SALES' | 'TEACHER' | 'STUDENT' | 'PARENT';

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  roles: Role[];
  mustChangePassword: boolean;
}

// The API also ends sessions after 30 days; the cookie never needs to outlive that.
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** The signed-in user, or null. The API checks the session on every call; this is not a cached claim. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!(await cookies()).has(SESSION_COOKIE)) {
    return null;
  }
  const res = await apiFetch('/auth/me');
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }
  return (await res.json()) as SessionUser;
});

/**
 * For pages behind login: sends visitors to log in, users with a temporary password to change it,
 * and hides the page (404) from users without one of `roles`. The API checks again on every call.
 */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect('/dang-nhap');
  }
  if (user.mustChangePassword) {
    redirect('/doi-mat-khau');
  }
  if (roles && !roles.some((role) => user.roles.includes(role))) {
    notFound();
  }
  return user;
}

/** Only from Server Actions: cookies can be changed only while responding to one. */
export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
