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
