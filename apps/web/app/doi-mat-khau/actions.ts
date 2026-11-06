'use server';

import { redirect } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { clearSessionCookie } from '../lib/session';

export type ChangePasswordState = { message: string } | undefined;

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

export async function changePassword(_state: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const currentPassword = formData.get('currentPassword');
  const newPassword = formData.get('newPassword');
  const confirmPassword = formData.get('confirmPassword');
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword) {
    return { message: 'Vui lòng nhập đủ mật khẩu hiện tại và mật khẩu mới.' };
  }
  if (newPassword.length < MIN_LENGTH || newPassword.length > MAX_LENGTH) {
    return { message: `Mật khẩu mới cần có từ ${MIN_LENGTH} đến ${MAX_LENGTH} ký tự.` };
  }
  if (newPassword !== confirmPassword) {
    return { message: 'Hai lần nhập mật khẩu mới chưa giống nhau.' };
  }
  if (newPassword === currentPassword) {
    return { message: 'Mật khẩu mới cần khác mật khẩu hiện tại.' };
  }

  let status: number;
  try {
    const res = await apiFetch('/auth/password', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    status = res.status;
  } catch {
    return { message: 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.' };
  }

  if (status === 401) {
    await clearSessionCookie();
    redirect('/dang-nhap');
  }
  if (status === 403) {
    return { message: 'Mật khẩu hiện tại không đúng.' };
  }
  if (status === 400) {
    return { message: `Mật khẩu mới cần có từ ${MIN_LENGTH} đến ${MAX_LENGTH} ký tự và khác mật khẩu hiện tại.` };
  }
  if (status !== 204) {
    return { message: 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.' };
  }
  redirect('/');
}
