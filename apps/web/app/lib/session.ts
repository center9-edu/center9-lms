import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { apiFetch, SESSION_COOKIE } from './api';

// Server-only: import this file only from Server Components and Server Actions.

export type Role = 'SUPER_ADMIN' | 'CENTER_ADMIN' | 'SALES' | 'TEACHER' | 'STUDENT' | 'PARENT';

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN'];

/** May manage student profiles; mirrors @Roles on the API's StudentsController. */
export const STUDENT_MANAGER_ROLES: Role[] = [...ADMIN_ROLES, 'SALES'];

/** Author curriculum; mirrors the write @Roles on the API's CoursesController. */
export const CURRICULUM_AUTHOR_ROLES: Role[] = [...ADMIN_ROLES, 'TEACHER'];

/** Read curriculum; sales read only. */
export const CURRICULUM_READ_ROLES: Role[] = [...CURRICULUM_AUTHOR_ROLES, 'SALES'];

/** See classes; mirrors @Roles on the API's ClassesController. Teachers see only the classes they teach; admins also run them. */
export const CLASS_ROLES: Role[] = ['SUPER_ADMIN', 'CENTER_ADMIN', 'SALES', 'TEACHER'];

/** See their own classes and open lessons; mirrors @Roles on the API's LearnerClassesController. */
export const LEARNER_ROLES: Role[] = ['STUDENT', 'PARENT'];

/** Staff views win for someone who also has a learner role, as on the API. */
export const isStaff = (user: SessionUser) => CLASS_ROLES.some((role) => user.roles.includes(role));

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Học sinh',
  PARENT: 'Phụ huynh',
  TEACHER: 'Giáo viên',
  SALES: 'Tư vấn tuyển sinh',
  CENTER_ADMIN: 'Quản lý trung tâm',
  SUPER_ADMIN: 'Quản trị hệ thống',
};

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

/**
 * For Server Actions: calls the API with a JSON body. Returns undefined when the API could not be reached;
 * a lost session (401) clears the cookie and goes back to the login page.
 */
export async function sendFromAction(path: string, method: string, body?: unknown): Promise<Response | undefined> {
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
