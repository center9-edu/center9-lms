'use server';

import { revalidatePath } from 'next/cache';
import { sendFromAction } from '../../../lib/session';
import type { TeacherDetail } from '../teachers';

/** `bio` is what was submitted, so the form keeps it after an error. */
export type SaveTeacherState = { ok: boolean; message: string; bio: string } | undefined;

function failureMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return 'Giới thiệu tối đa 2000 ký tự.';
    case 403:
      return 'Bạn không có quyền sửa hồ sơ giáo viên.';
    case 404:
      return 'Không tìm thấy giáo viên. Vui lòng tải lại trang.';
    case 409:
      return 'Vừa có người khác lưu hồ sơ này cùng lúc. Vui lòng tải lại trang và thử lại.';
    default:
      return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
  }
}

export async function saveTeacherProfile(_state: SaveTeacherState, formData: FormData): Promise<SaveTeacherState> {
  const userId = String(formData.get('userId') ?? '');
  const bio = String(formData.get('bio') ?? '');

  const res = await sendFromAction(`/teachers/${encodeURIComponent(userId)}`, 'PUT', { bio });
  if (!res?.ok) {
    return { ok: false, message: failureMessage(res?.status), bio };
  }

  const { profile } = (await res.json()) as TeacherDetail;
  revalidatePath('/giao-vien');
  revalidatePath(`/giao-vien/${userId}`);
  return { ok: true, message: `Đã lưu hồ sơ, mã giáo viên ${profile?.teacherCode}.`, bio: profile?.bio ?? '' };
}
