'use server';

import { redirect } from 'next/navigation';
import { API_URL, apiFetch, clientIpHeader } from '../lib/api';
import { clearSessionCookie, setSessionCookie } from '../lib/session';
import type { SessionUser } from '../lib/session';

export type LoginState = { message: string; username: string } | undefined;

const BUSY_MESSAGE = 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get('username');
  const password = formData.get('password');
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return { message: 'Vui lòng nhập tên đăng nhập và mật khẩu.', username: typeof username === 'string' ? username : '' };
  }

  let user: SessionUser;
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', ...(await clientIpHeader()) },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 401 || res.status === 400) {
      return { message: 'Tên đăng nhập hoặc mật khẩu không đúng.', username };
    }
    if (res.status === 429) {
      return { message: 'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.', username };
    }
    if (res.status === 403) {
      return { message: 'Tài khoản này đang bị khoá. Vui lòng liên hệ trung tâm.', username };
    }
    if (!res.ok) {
      return { message: BUSY_MESSAGE, username };
    }
    const body = (await res.json()) as { token: string; user: SessionUser };
    await setSessionCookie(body.token);
    user = body.user;
  } catch {
    return { message: BUSY_MESSAGE, username };
  }

  // redirect() throws, so it must stay outside the try block.
  redirect(user.mustChangePassword ? '/doi-mat-khau' : '/');
}

export async function logout() {
  // Revoke on the API first; clear the cookie even if the API is unreachable.
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
  await clearSessionCookie();
  redirect('/dang-nhap');
}
