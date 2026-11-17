'use server';

import { revalidatePath } from 'next/cache';
import { sendFromAction } from '../../../lib/session';
import type { Guardian, StudentDetail } from '../students';

const BUSY = 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const studentPath = (studentId: string) => `/students/${encodeURIComponent(studentId)}`;

// --- Profile ---

export interface ProfileValues {
  dateOfBirth: string;
  schoolName: string;
  notes: string;
}

/** `values` is what was submitted, so the form keeps it after an error. */
export type SaveProfileState = { ok: boolean; message: string; values: ProfileValues } | undefined;

function profileFailure(status: number | undefined): string {
  switch (status) {
    case 400:
      return 'Thông tin chưa hợp lệ. Ngày sinh phải là một ngày có thật, tên trường tối đa 200 ký tự, ghi chú tối đa 2000 ký tự.';
    case 403:
      return 'Bạn không có quyền sửa hồ sơ học sinh.';
    case 404:
      return 'Không tìm thấy học sinh. Vui lòng tải lại trang.';
    case 409:
      return 'Vừa có người khác lưu hồ sơ này cùng lúc. Vui lòng tải lại trang và thử lại.';
    default:
      return BUSY;
  }
}

export async function saveStudentProfile(_state: SaveProfileState, formData: FormData): Promise<SaveProfileState> {
  const userId = field(formData, 'userId');
  const values: ProfileValues = { dateOfBirth: field(formData, 'dateOfBirth'), schoolName: field(formData, 'schoolName'), notes: field(formData, 'notes') };

  // The API trims text and turns blanks into null; an empty date input sends ''.
  const res = await sendFromAction(studentPath(userId), 'PUT', { ...values, dateOfBirth: values.dateOfBirth || null });
  if (!res?.ok) {
    return { ok: false, message: profileFailure(res?.status), values };
  }

  const { profile } = (await res.json()) as StudentDetail;
  revalidatePath('/hoc-sinh');
  revalidatePath(`/hoc-sinh/${userId}`);
  return {
    ok: true,
    message: `Đã lưu hồ sơ, mã học sinh ${profile?.studentCode}.`,
    values: { dateOfBirth: profile?.dateOfBirth ?? '', schoolName: profile?.schoolName ?? '', notes: profile?.notes ?? '' },
  };
}

// --- Guardians ---

export interface GuardianValues {
  fullName: string;
  phone: string;
  email: string;
  username: string;
}

export interface LinkValues {
  guardianId: string;
  relationship: string;
  isPrimaryContact: boolean;
}

/**
 * `values` is what was submitted, so the form keeps it after an error. `createdGuardianId` is set when the guardian
 * was created but not linked, so submitting again only retries the link instead of creating a duplicate.
 */
export type GuardianState = { ok: boolean; message: string; values: GuardianValues & LinkValues; createdGuardianId?: string } | undefined;
export type ActionState = { ok: boolean; message: string } | undefined;

function guardianFailure(status: number | undefined): string {
  switch (status) {
    case 400:
      return 'Thông tin chưa hợp lệ. Cần họ tên, và số điện thoại (8–20 chữ số) hoặc email hợp lệ. Tên đăng nhập, nếu nhập, phải là tài khoản có vai trò Phụ huynh.';
    case 403:
      return 'Bạn không có quyền quản lý phụ huynh.';
    case 404:
      return 'Không tìm thấy học sinh hoặc phụ huynh. Vui lòng tải lại trang.';
    case 409:
      return 'Tài khoản phụ huynh này đã gắn với một phụ huynh khác.';
    default:
      return BUSY;
  }
}

const guardianValues = (formData: FormData): GuardianValues => ({
  fullName: field(formData, 'fullName'),
  phone: field(formData, 'phone'),
  email: field(formData, 'email'),
  username: field(formData, 'username'),
});

const linkValues = (formData: FormData): LinkValues => ({
  guardianId: field(formData, 'guardianId'),
  relationship: field(formData, 'relationship'),
  isPrimaryContact: formData.get('isPrimaryContact') === 'on',
});

async function link(studentId: string, { guardianId, relationship, isPrimaryContact }: LinkValues): Promise<Response | undefined> {
  return sendFromAction(`${studentPath(studentId)}/guardians/${encodeURIComponent(guardianId)}`, 'PUT', { relationship, isPrimaryContact });
}

/** Creates a guardian, then links them to the student. A retry after a failed link only links. */
export async function createAndLinkGuardian(_state: GuardianState, formData: FormData): Promise<GuardianState> {
  const studentId = field(formData, 'studentId');
  const values = { ...guardianValues(formData), ...linkValues(formData) };

  let guardianId = field(formData, 'createdGuardianId');
  if (!guardianId) {
    const created = await sendFromAction('/guardians', 'POST', { fullName: values.fullName, phone: values.phone, email: values.email, username: values.username });
    if (!created?.ok) {
      return { ok: false, message: guardianFailure(created?.status), values };
    }
    guardianId = ((await created.json()) as Guardian).id;
  }
  const linked = await link(studentId, { ...values, guardianId });
  revalidatePath(`/hoc-sinh/${studentId}`);
  if (!linked?.ok) {
    return {
      ok: false,
      message: `Đã tạo phụ huynh nhưng chưa gắn được với học sinh. ${guardianFailure(linked?.status)} Bấm "Thêm phụ huynh" lần nữa để thử gắn lại.`,
      values,
      createdGuardianId: guardianId,
    };
  }
  return {
    ok: true,
    message: `Đã thêm ${values.fullName.trim()}.`,
    values: { fullName: '', phone: '', email: '', username: '', guardianId: '', relationship: '', isPrimaryContact: false },
  };
}

/** Links an existing guardian, or changes the relationship / primary contact of a linked one. */
export async function linkGuardian(_state: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = field(formData, 'studentId');
  const res = await link(studentId, linkValues(formData));
  if (!res?.ok) {
    return { ok: false, message: guardianFailure(res?.status) };
  }
  revalidatePath(`/hoc-sinh/${studentId}`);
  return { ok: true, message: 'Đã lưu.' };
}

/** Changes the guardian's own details, shared by every student they are linked to. */
export async function updateGuardian(_state: GuardianState, formData: FormData): Promise<GuardianState> {
  const studentId = field(formData, 'studentId');
  const values = { ...guardianValues(formData), ...linkValues(formData) };
  const res = await sendFromAction(`/guardians/${encodeURIComponent(values.guardianId)}`, 'PUT', guardianValues(formData));
  if (!res?.ok) {
    return { ok: false, message: guardianFailure(res?.status), values };
  }
  revalidatePath(`/hoc-sinh/${studentId}`);
  return { ok: true, message: 'Đã lưu thông tin phụ huynh.', values };
}

export async function unlinkGuardian(_state: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = field(formData, 'studentId');
  const res = await sendFromAction(`${studentPath(studentId)}/guardians/${encodeURIComponent(field(formData, 'guardianId'))}`, 'DELETE');
  if (!res?.ok) {
    return { ok: false, message: guardianFailure(res?.status) };
  }
  revalidatePath(`/hoc-sinh/${studentId}`);
  return { ok: true, message: 'Đã gỡ phụ huynh khỏi học sinh.' };
}
