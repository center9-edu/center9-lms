'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { attendanceBody } from '../../lib/attendance-form';
import { sendFromAction } from '../../lib/session';
import type { ClassSummary } from './classes';

export interface ClassValues {
  courseId: string;
  name: string;
  startDate: string;
  endDate: string;
  capacity: string;
}

/** `values` is what was submitted, so the form keeps it after an error. */
export type ClassState = { ok: boolean; message: string; values: ClassValues } | undefined;
export type StatusState = { ok: false; message: string } | undefined;
export type TeacherState = { ok: false; message: string } | undefined;
export type EnrollmentState = { ok: false; message: string } | undefined;
export type ScheduleState = { ok: false; message: string } | undefined;

function failureMessage(status: number | undefined): string {
  switch (status) {
    case 400:
      return 'Thông tin chưa hợp lệ. Tên lớp 1–150 ký tự; ngày kết thúc không trước ngày bắt đầu; sĩ số từ 1 đến 500 hoặc để trống.';
    case 403:
      return 'Bạn không có quyền quản lý lớp học.';
    case 404:
      return 'Không tìm thấy lớp hoặc khoá học. Vui lòng tải lại trang.';
    case 409:
      return 'Chưa lưu được: khoá học đã lưu trữ, lớp đã kết thúc hoặc đã huỷ, hoặc sĩ số nhỏ hơn số học sinh đang học. Vui lòng tải lại trang.';
    default:
      return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
  }
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? '').trim();

function readValues(formData: FormData): ClassValues {
  return {
    courseId: field(formData, 'courseId'),
    name: field(formData, 'name'),
    startDate: field(formData, 'startDate'),
    endDate: field(formData, 'endDate'),
    capacity: field(formData, 'capacity'),
  };
}

/** Blank inputs become null; the API validates the rest. */
const toBody = (values: ClassValues) => ({
  name: values.name,
  startDate: values.startDate || null,
  endDate: values.endDate || null,
  capacity: values.capacity ? Number(values.capacity) : null,
});

export async function createClass(_state: ClassState, formData: FormData): Promise<ClassState> {
  const values = readValues(formData);
  const res = await sendFromAction('/classes', 'POST', { ...toBody(values), courseId: values.courseId });
  if (!res?.ok) {
    return { ok: false, message: failureMessage(res?.status), values };
  }
  const created = (await res.json()) as ClassSummary;
  revalidatePath('/lop-hoc');
  redirect(`/lop-hoc/${created.code}`);
}

export async function updateClass(_state: ClassState, formData: FormData): Promise<ClassState> {
  const values = readValues(formData);
  const res = await sendFromAction(`/classes/${encodeURIComponent(field(formData, 'id'))}`, 'PUT', toBody(values));
  if (!res?.ok) {
    return { ok: false, message: failureMessage(res?.status), values };
  }
  const updated = (await res.json()) as ClassSummary;
  revalidatePath('/lop-hoc', 'layout');
  return { ok: true, message: 'Đã lưu thay đổi.', values: { ...values, capacity: updated.capacity === null ? '' : String(updated.capacity) } };
}

export async function changeClassStatus(_state: StatusState, formData: FormData): Promise<StatusState> {
  const res = await sendFromAction(`/classes/${encodeURIComponent(field(formData, 'id'))}/status`, 'POST', { status: field(formData, 'status') });
  if (!res?.ok) {
    return {
      ok: false,
      message: res?.status === 409 ? 'Trạng thái lớp vừa thay đổi. Vui lòng tải lại trang.' : failureMessage(res?.status),
    };
  }
  revalidatePath('/lop-hoc', 'layout');
  return undefined;
}

/** Assign a teacher (or change their role) or remove one; `intent` picks which, the API path is built here. */
export async function changeTeacher(_state: TeacherState, formData: FormData): Promise<TeacherState> {
  const path = `/classes/${encodeURIComponent(field(formData, 'id'))}/teachers/${encodeURIComponent(field(formData, 'teacherId'))}`;
  const remove = field(formData, 'intent') === 'remove';
  const res = await sendFromAction(path, remove ? 'DELETE' : 'PUT', remove ? undefined : { role: field(formData, 'role') });
  if (!res?.ok) {
    const messages: Record<number, string> = {
      400: 'Hãy chọn giáo viên và vai trò.',
      403: 'Bạn không có quyền phân công giáo viên.',
      404: 'Không tìm thấy giáo viên hoặc lớp. Giáo viên cần có hồ sơ trước khi được phân công.',
      409: 'Chưa lưu được: tài khoản giáo viên đã bị khoá, hoặc lớp đã kết thúc hay đã huỷ.',
    };
    return { ok: false, message: (res && messages[res.status]) ?? 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.' };
  }
  revalidatePath('/lop-hoc', 'layout');
  return undefined;
}

/** Enroll a student (`intent=enroll`) or change one's status; the API path is built here, never taken from the form. */
export async function changeEnrollment(_state: EnrollmentState, formData: FormData): Promise<EnrollmentState> {
  const classPath = `/classes/${encodeURIComponent(field(formData, 'id'))}/enrollments`;
  const res =
    field(formData, 'intent') === 'enroll'
      ? await sendFromAction(classPath, 'POST', { studentId: field(formData, 'studentId') })
      : await sendFromAction(`${classPath}/${encodeURIComponent(field(formData, 'enrollmentId'))}/status`, 'PUT', { status: field(formData, 'status') });
  if (!res?.ok) {
    const messages: Record<number, string> = {
      400: 'Hãy chọn học sinh.',
      403: 'Bạn không có quyền ghi danh học sinh.',
      404: 'Không tìm thấy học sinh hoặc lớp. Học sinh cần có hồ sơ trước khi ghi danh.',
      409: 'Chưa lưu được: lớp đã đủ sĩ số, học sinh đã ở trong lớp hoặc đã nghỉ học, tài khoản bị khoá, hoặc lớp đã kết thúc hay đã huỷ. Vui lòng tải lại trang.',
    };
    return { ok: false, message: (res && messages[res.status]) ?? 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.' };
  }
  revalidatePath('/lop-hoc', 'layout');
  return undefined;
}

/** Each schedule form names its change in `intent`; the API path is chosen here, never taken from the form. */
function scheduleRequest(intent: string, formData: FormData): [path: string, method: 'POST' | 'PUT', body?: unknown] | undefined {
  const classId = encodeURIComponent(field(formData, 'id'));
  const sessionId = encodeURIComponent(field(formData, 'sessionId'));
  const times = { date: field(formData, 'date'), startTime: field(formData, 'startTime'), endTime: field(formData, 'endTime') };
  switch (intent) {
    case 'createSchedule':
      return [
        `/classes/${classId}/schedule`,
        'POST',
        { startDate: field(formData, 'startDate'), weekdays: formData.getAll('weekdays').map(Number), startTime: times.startTime, endTime: times.endTime },
      ];
    case 'addSession':
      return [`/classes/${classId}/sessions`, 'POST', times];
    case 'updateSession':
      return [`/class-sessions/${sessionId}`, 'PUT', times];
    case 'dayOff':
      return [`/class-sessions/${sessionId}/day-off`, 'POST'];
    default:
      return undefined;
  }
}

const INVALID_SCHEDULE = 'Thông tin chưa hợp lệ: chọn ít nhất một thứ trong tuần, giờ dạng HH:MM, giờ kết thúc sau giờ bắt đầu, không chọn buổi đã qua, và ngày bắt đầu lịch không sớm hơn 30 ngày trước.';

export async function changeSchedule(_state: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const target = scheduleRequest(field(formData, 'intent'), formData);
  const res = target && (await sendFromAction(...target));
  if (!res?.ok) {
    const messages: Record<number, string> = {
      400: INVALID_SCHEDULE,
      403: 'Bạn không có quyền sửa lịch học. Chỉ giáo viên của lớp hoặc quản trị viên được báo nghỉ.',
      404: 'Không tìm thấy lớp hoặc buổi học. Vui lòng tải lại trang.',
      409: 'Chưa lưu được: lớp đã có lịch, khoá học chưa có bài, buổi đã huỷ hoặc đã dạy, hoặc lớp đã kết thúc hay đã huỷ. Vui lòng tải lại trang.',
    };
    return { ok: false, message: (res && messages[res.status]) ?? (target ? 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.' : INVALID_SCHEDULE) };
  }
  revalidatePath('/lop-hoc', 'layout');
  return undefined;
}

export type AttendanceState = { ok: boolean; message: string } | undefined;

export async function saveAttendance(_state: AttendanceState, formData: FormData): Promise<AttendanceState> {
  const res = await sendFromAction(`/class-sessions/${encodeURIComponent(field(formData, 'sessionId'))}/attendance`, 'PUT', attendanceBody(formData));
  if (!res?.ok) {
    const messages: Record<number, string> = {
      400: 'Chưa lưu được: danh sách học sinh vừa thay đổi hoặc ghi chú dài quá 500 ký tự. Vui lòng tải lại trang.',
      403: 'Chỉ giáo viên của lớp được điểm danh.',
      404: 'Không tìm thấy buổi học hoặc giáo viên dạy thay. Vui lòng tải lại trang.',
      409: 'Chưa lưu được: chưa tới giờ điểm danh, buổi đã nghỉ, lớp đã kết thúc, hoặc giáo viên dạy thay đã bị khoá tài khoản.',
    };
    return { ok: false, message: (res && messages[res.status]) ?? 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.' };
  }
  revalidatePath('/lop-hoc', 'layout');
  return { ok: true, message: 'Đã lưu điểm danh.' };
}
