'use client';

import { useActionState, useState } from 'react';
import { ERROR_ALERT, FOCUS, INPUT, LABEL, SMALL_BUTTON, SMALL_OUTLINE_BUTTON, SUCCESS_ALERT } from '../../../../../ui/styles';
import { saveAttendance } from '../../../actions';

interface Props {
  sessionId: string;
  students: { enrollmentId: string; studentCode: string; fullName: string; left: boolean; status: string | null; note: string | null }[];
  /** Status values with their labels, in the order to offer them; the first is "present". */
  options: { value: string; label: string }[];
  teacherOptions: { userId: string; label: string }[];
  /** Who is recorded as teaching, if anyone: kept unless another teacher is chosen. */
  taughtByName: string | null;
}

/** One row per student with a status and a note; built for a phone held in class. */
export function AttendanceForm({ sessionId, students, options, teacherOptions, taughtByName }: Props) {
  const [state, action, pending] = useActionState(saveAttendance, undefined);
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map(({ enrollmentId, status }) => [enrollmentId, status ?? ''])),
  );
  const present = options[0]?.value ?? 'PRESENT';
  const unmarked = students.filter(({ enrollmentId }) => !statuses[enrollmentId]).length;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setStatuses(Object.fromEntries(students.map(({ enrollmentId }) => [enrollmentId, present])))}
          className={SMALL_OUTLINE_BUTTON}
        >
          Có mặt tất cả
        </button>
        <span role="status" className="text-sm text-muted">
          {unmarked === 0 ? 'Đã chọn cho mọi học sinh.' : `Còn ${unmarked} học sinh chưa chọn.`}
        </span>
      </div>

      <ol className="m-0 grid list-none gap-3 p-0">
        {students.map((student) => (
          <li key={student.enrollmentId} className="rounded-xl border border-solid border-border p-3">
            <input type="hidden" name="enrollmentId" value={student.enrollmentId} />
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-2 p-0">
                <span className="font-semibold">{student.fullName}</span>{' '}
                <span className="text-sm text-muted">
                  {student.studentCode}
                  {student.left && ' · đã rời lớp'}
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border border-solid px-3 py-2 text-sm ${
                      statuses[student.enrollmentId] === option.value ? 'border-primary bg-primary-50 font-semibold text-primary' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`status-${student.enrollmentId}`}
                      value={option.value}
                      checked={statuses[student.enrollmentId] === option.value}
                      onChange={() => setStatuses((current) => ({ ...current, [student.enrollmentId]: option.value }))}
                      className={FOCUS}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              <label className="grid gap-1">
                <span className="text-sm">Ghi chú (không bắt buộc)</span>
                <input name={`note-${student.enrollmentId}`} maxLength={500} defaultValue={student.note ?? ''} className={`${INPUT} py-2`} />
              </label>
            </fieldset>
          </li>
        ))}
      </ol>

      <label className="grid max-w-md gap-1.5">
        <span className={LABEL}>Người dạy buổi này</span>
        <select name="taughtBy" defaultValue="" className={INPUT}>
          {/* Left empty, the API keeps whoever is recorded (even a teacher no longer in the list); an ended session
              without one gets the main teacher. So saving a correction never changes who taught by accident. */}
          <option value="">{taughtByName ? `Giữ nguyên: ${taughtByName}` : 'Giáo viên chính (mặc định)'}</option>
          {teacherOptions.map((teacher) => (
            <option key={teacher.userId} value={teacher.userId}>
              {teacher.label}
            </option>
          ))}
        </select>
      </label>

      {state && (
        <p role={state.ok ? 'status' : 'alert'} className={state.ok ? SUCCESS_ALERT : ERROR_ALERT}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={SMALL_BUTTON}>
        {pending ? 'Đang lưu…' : 'Lưu điểm danh'}
      </button>
    </form>
  );
}
