'use server';

import { revalidatePath } from 'next/cache';
import { sendFromAction } from '../../../lib/session';

/** Only failures have a message: after a change the page simply shows the new tree. */
export type CurriculumState = { ok: false; message: string } | undefined;

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '');
const id = (formData: FormData, name: string) => encodeURIComponent(field(formData, name));
const ids = (formData: FormData) => field(formData, 'ids').split(',').filter(Boolean);
const lesson = (formData: FormData) => ({ title: field(formData, 'title'), partCount: Number(field(formData, 'partCount')) });

/** Each form names its change in `intent`; the API path is chosen here, never taken from the form. */
function request(intent: string, formData: FormData): [path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown] | undefined {
  const courseId = id(formData, 'courseId');
  const chapterId = id(formData, 'chapterId');
  const lessonId = id(formData, 'lessonId');
  switch (intent) {
    case 'addChapter':
      return [`/courses/${courseId}/chapters`, 'POST', { title: field(formData, 'title') }];
    case 'renameChapter':
      return [`/chapters/${chapterId}`, 'PUT', { title: field(formData, 'title') }];
    case 'deleteChapter':
      return [`/chapters/${chapterId}`, 'DELETE'];
    case 'orderChapters':
      return [`/courses/${courseId}/chapters/order`, 'PUT', { ids: ids(formData) }];
    case 'addLesson':
      return [`/chapters/${chapterId}/lessons`, 'POST', lesson(formData)];
    case 'updateLesson':
      return [`/lessons/${lessonId}`, 'PUT', lesson(formData)];
    case 'deleteLesson':
      return [`/lessons/${lessonId}`, 'DELETE'];
    case 'orderLessons':
      return [`/chapters/${chapterId}/lessons/order`, 'PUT', { ids: ids(formData) }];
    case 'deleteFile':
      return [`/lesson-files/${id(formData, 'fileId')}`, 'DELETE'];
    default:
      return undefined;
  }
}

function failureMessage(intent: string, status: number | undefined): string {
  switch (status) {
    case 400:
      return 'Thông tin chưa hợp lệ. Tên dài 1–150 ký tự, số phần của bài từ 1 đến 50.';
    case 403:
      return 'Bạn không có quyền sửa chương trình học.';
    case 404:
      return 'Không tìm thấy mục này, có thể vừa bị xoá. Vui lòng tải lại trang.';
    case 409:
      // The API's reasons share one status; each intent has few enough to name them all.
      if (intent === 'deleteChapter') {
        return 'Chưa xoá được: chương còn bài học (hãy xoá các bài trước), hoặc khoá học đã lưu trữ.';
      }
      if (intent === 'deleteLesson') {
        return 'Chưa xoá được: bài còn file (hãy xoá các file trước), bài đã được dạy ở buổi học của lớp, hoặc khoá học đã lưu trữ.';
      }
      if (intent === 'updateLesson') {
        return 'Chưa lưu được: lớp học đã dạy tới phần lớn hơn số phần mới, hoặc khoá học đã lưu trữ.';
      }
      return 'Khoá học đã lưu trữ, không sửa được. Vui lòng tải lại trang.';
    default:
      return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
  }
}

export async function changeCurriculum(_state: CurriculumState, formData: FormData): Promise<CurriculumState> {
  const intent = field(formData, 'intent');
  const target = request(intent, formData);
  if (!target) {
    return { ok: false, message: failureMessage(intent, 400) };
  }
  const res = await sendFromAction(...target);
  if (!res?.ok) {
    return { ok: false, message: failureMessage(intent, res?.status) };
  }
  revalidatePath(`/chuong-trinh/${field(formData, 'slug')}`, 'layout');
  return undefined;
}
