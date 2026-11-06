import { notFound, redirect } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import type { Role } from '../../lib/session';

// Server-only: import this file only from Server Components and Server Actions.

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
  roles: Role[];
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
}

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN'];

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Học sinh',
  PARENT: 'Phụ huynh',
  TEACHER: 'Giáo viên',
  SALES: 'Tư vấn tuyển sinh',
  CENTER_ADMIN: 'Quản lý trung tâm',
  SUPER_ADMIN: 'Quản trị hệ thống',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Ngừng hoạt động',
  LOCKED: 'Đã khoá',
};

export async function fetchUsers(): Promise<UserSummary[]> {
  const res = await apiFetch('/users');
  if (res.status === 401) {
    redirect('/dang-nhap');
  }
  if (res.status === 403) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }
  return (await res.json()) as UserSummary[];
}
