'use client';

import { useActionState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { DANGER_OUTLINE_BUTTON, ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON, SMALL_OUTLINE_BUTTON } from '../../../ui/styles';
import { changeTeacher } from '../actions';

interface Props {
  classId: string;
  /** Main teacher first; `roleLabel` is already in Vietnamese. */
  teachers: { userId: string; teacherCode: string; fullName: string; role: 'MAIN_TEACHER' | 'ASSISTANT'; roleLabel: string }[];
  /** Teachers who can still be added; undefined for someone who may only read. */
  candidates?: { userId: string; label: string }[];
}

/** The class's teachers; admins also assign, promote and remove them. */
export function ClassTeachers({ classId, teachers, candidates }: Props) {
  const [state, action, pending] = useActionState(changeTeacher, undefined);

  const form = (fields: Record<string, string>, children: ReactNode, confirm?: string) => (
    <form
      action={action}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={classId} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );

  return (
    <div className="grid gap-4">
      {state && (
        <p role="alert" className={ERROR_ALERT}>
          {state.message}
        </p>
      )}
      {teachers.length === 0 ? (
        <p className="m-0 text-muted">Lớp chưa có giáo viên.</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {teachers.map((teacher) => (
            <li key={teacher.userId} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{teacher.fullName}</span>
              <span className="text-sm text-muted">
                {teacher.teacherCode} · {teacher.roleLabel}
              </span>
              {candidates && (
                <span className="flex flex-wrap gap-2 sm:ml-auto">
                  {teacher.role === 'ASSISTANT' &&
                    form(
                      { teacherId: teacher.userId, role: 'MAIN_TEACHER' },
                      <button type="submit" disabled={pending} className={SMALL_OUTLINE_BUTTON}>
                        Đặt làm giáo viên chính
                      </button>,
                    )}
                  {form(
                    { teacherId: teacher.userId, intent: 'remove' },
                    <button type="submit" disabled={pending} aria-label={`Gỡ ${teacher.fullName} khỏi lớp`} className={DANGER_OUTLINE_BUTTON}>
                      Gỡ khỏi lớp
                    </button>,
                    `Gỡ ${teacher.fullName} khỏi lớp? Giáo viên sẽ không còn thấy lớp này.`,
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {candidates && (
        <form action={action} className="flex flex-wrap items-end gap-3 border-0 border-t border-solid border-border pt-4">
          <input type="hidden" name="id" value={classId} />
          <label className="grid min-w-56 flex-1 gap-1.5">
            <span className={LABEL}>Thêm giáo viên</span>
            <select name="teacherId" required defaultValue="" className={INPUT}>
              <option value="" disabled>
                {candidates.length === 0 ? 'Không còn giáo viên nào để thêm' : 'Chọn giáo viên'}
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.userId} value={candidate.userId}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className={LABEL}>Vai trò</span>
            <select name="role" defaultValue={teachers.some((teacher) => teacher.role === 'MAIN_TEACHER') ? 'ASSISTANT' : 'MAIN_TEACHER'} className={INPUT}>
              <option value="MAIN_TEACHER">Giáo viên chính</option>
              <option value="ASSISTANT">Trợ giảng</option>
            </select>
          </label>
          <button type="submit" disabled={pending || candidates.length === 0} className={SMALL_BUTTON}>
            Phân công
          </button>
        </form>
      )}
    </div>
  );
}
