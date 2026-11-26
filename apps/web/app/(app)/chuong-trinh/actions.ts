'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sendFromAction } from '../../lib/session';
import type { CourseDetail } from './courses';

export interface CourseValues {
  title: string;
  description: string;
  subject: string;
  level: string;
  slug: string;
}

/** `values` is what was submitted, so the form keeps it after an error. */
export type CourseState = { ok: boolean; message: string; values: CourseValues } | undefined;
export type ArchiveState = { ok: false; message: string } | undefined;

function failureMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return 'Thông tin chưa hợp lệ. Tên khoá học 1–150 ký tự, mô tả tối đa 2000 ký tự, phải chọn nhóm và trình độ. Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang, tối đa 60 ký tự.';
    case 403:
      return 'Bạn không có quyền sửa chương trình học.';
    case 404:
      return 'Không tìm thấy khoá học. Vui lòng tải lại trang.';
    case 409:
      return 'Chưa lưu được: đường dẫn này đã có khoá học khác dùng, hoặc khoá học đã được lưu trữ. Vui lòng tải lại trang và thử lại.';
    default:
      return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
  }
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');

export async function createCourse(_state: CourseState, formData: FormData): Promise<CourseState> {
  const values = {
    title: field(formData, 'title'),
    description: field(formData, 'description'),
    subject: field(formData, 'subject'),
    level: field(formData, 'level'),
    slug: '',
  };
  const res = await sendFromAction('/courses', 'POST', { title: values.title, description: values.description, subject: values.subject, level: values.level });
  if (!res?.ok) {
    return { ok: false, message: failureMessage(res?.status), values };
  }
  const course = (await res.json()) as CourseDetail;
  revalidatePath('/chuong-trinh');
  redirect(`/chuong-trinh/${course.slug}`);
}

export async function updateCourse(_state: CourseState, formData: FormData): Promise<CourseState> {
  const id = field(formData, 'id');
  const values = {
    title: field(formData, 'title'),
    description: field(formData, 'description'),
    subject: field(formData, 'subject'),
    level: field(formData, 'level'),
    slug: field(formData, 'slug').trim().toLowerCase(),
  };
  const res = await sendFromAction(`/courses/${encodeURIComponent(id)}`, 'PUT', values);
  if (!res?.ok) {
    return { ok: false, message: failureMessage(res?.status), values };
  }
  const course = (await res.json()) as CourseDetail;
  revalidatePath('/chuong-trinh');
  if (course.slug !== field(formData, 'currentSlug')) {
    // The page lives at the slug, so follow it.
    redirect(`/chuong-trinh/${course.slug}`);
  }
  revalidatePath(`/chuong-trinh/${course.slug}`);
  return {
    ok: true,
    message: 'Đã lưu thay đổi.',
    values: { title: course.title, description: course.description ?? '', subject: course.subject, level: course.level, slug: course.slug },
  };
}

export async function archiveCourse(_state: ArchiveState, formData: FormData): Promise<ArchiveState> {
  const res = await sendFromAction(`/courses/${encodeURIComponent(field(formData, 'id'))}/archive`, 'POST');
  if (!res?.ok) {
    return { ok: false, message: failureMessage(res?.status) };
  }
  revalidatePath('/chuong-trinh');
  revalidatePath(`/chuong-trinh/${field(formData, 'currentSlug')}`);
  return undefined;
}
