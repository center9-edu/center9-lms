'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { clearSessionCookie } from '../../lib/session';
import type { UserSummary } from './users';

export type CreateUserState =
  | { ok: true; username: string; fullName: string; temporaryPassword: string }
  | { ok: false; message: string; username: string; fullName: string; roles: string[] }
  | undefined;

export async function createUser(_state: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const username = String(formData.get('username') ?? '')
    .trim()
    .toLowerCase();
  const fullName = String(formData.get('fullName') ?? '').trim();
  const roles = formData.getAll('roles').filter((role): role is string => typeof role === 'string');
  const failed = (message: string): CreateUserState => ({ ok: false, message, username, fullName, roles });

  if (roles.length === 0) {
    return failed('Vui lòng chọn ít nhất một vai trò.');
  }

  let res: Response;
  try {
    res = await apiFetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, fullName, roles }),
    });
  } catch {
    return failed('Hệ thống đang bận. Vui lòng thử lại sau ít phút.');
  }

  if (res.status === 401) {
    await clearSessionCookie();
    redirect('/dang-nhap');
  }
  if (res.status === 409) {
    return failed('Tên đăng nhập này đã có người dùng. Vui lòng chọn tên khác.');
  }
  if (res.status === 403) {
    return failed('Bạn không có quyền tạo tài khoản với vai trò này.');
  }
  if (res.status === 400) {
    return failed(
      'Tên đăng nhập cần 3–32 ký tự gồm chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang. Họ tên không được để trống.',
    );
  }
  if (res.status !== 201) {
    return failed('Hệ thống đang bận. Vui lòng thử lại sau ít phút.');
  }

  const body = (await res.json()) as { user: UserSummary; temporaryPassword: string };
  revalidatePath('/quan-tri/tai-khoan');
  return { ok: true, username: body.user.username, fullName: body.user.fullName, temporaryPassword: body.temporaryPassword };
}

export type UpdateUserState = { ok: boolean; message: string } | undefined;
export type ResetPasswordState = { ok: true; temporaryPassword: string } | { ok: false; message: string } | undefined;

/** Messages for the admin endpoints that change someone else's account. */
function failureMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Vui lòng chọn ít nhất một vai trò.';
    case 403:
      return 'Bạn không có quyền sửa tài khoản này.';
    case 404:
      return 'Không tìm thấy tài khoản. Vui lòng tải lại trang.';
    case 409:
      return 'Chưa lưu được: hệ thống cần ít nhất một Quản trị hệ thống đang hoạt động, hoặc vừa có thay đổi khác cùng lúc. Vui lòng tải lại trang và thử lại.';
    default:
      return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
  }
}

async function send(path: string, method: string, body?: unknown): Promise<Response | undefined> {
  let res: Response;
  try {
    res = await apiFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return undefined;
  }
  // Outside the try block: redirect() works by throwing.
  if (res.status === 401) {
    await clearSessionCookie();
    redirect('/dang-nhap');
  }
  return res;
}

export async function updateUser(_state: UpdateUserState, formData: FormData): Promise<UpdateUserState> {
  const id = encodeURIComponent(String(formData.get('id') ?? ''));
  const roles = formData.getAll('roles').filter((role): role is string => typeof role === 'string');
  const status = String(formData.get('status') ?? '');
  // Only call what changed, so the audit log records real changes.
  const rolesChanged = [...roles].sort().join() !== String(formData.get('currentRoles') ?? '');
  const statusChanged = status !== formData.get('currentStatus');

  if (roles.length === 0) {
    return { ok: false, message: failureMessage(400) };
  }
  if (rolesChanged) {
    const res = await send(`/users/${id}/roles`, 'PUT', { roles });
    if (!res?.ok) {
      return { ok: false, message: failureMessage(res?.status ?? 0) };
    }
  }
  if (statusChanged) {
    const res = await send(`/users/${id}/status`, 'PATCH', { status });
    if (!res?.ok) {
      return { ok: false, message: failureMessage(res?.status ?? 0) };
    }
  }
  revalidatePath('/quan-tri/tai-khoan');
  return { ok: true, message: rolesChanged || statusChanged ? 'Đã lưu thay đổi.' : 'Không có gì thay đổi.' };
}

export async function resetPassword(_state: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const id = encodeURIComponent(String(formData.get('id') ?? ''));
  const res = await send(`/users/${id}/password-reset`, 'POST');
  if (!res?.ok) {
    return { ok: false, message: failureMessage(res?.status ?? 0) };
  }
  const { temporaryPassword } = (await res.json()) as { temporaryPassword: string };
  revalidatePath('/quan-tri/tai-khoan');
  return { ok: true, temporaryPassword };
}
