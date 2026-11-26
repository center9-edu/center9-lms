'use client';

import { useActionState } from 'react';
import { ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON } from '../../ui/styles';
import { createCourse } from './actions';
import { COURSE_LEVELS, COURSE_SUBJECTS } from './course-options';

export function CreateCourseForm() {
  const [state, action, pending] = useActionState(createCourse, undefined);

  return (
    <form action={action} className="grid max-w-lg gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="title" className={LABEL}>
          Tên khoá học
        </label>
        <input id="title" name="title" required maxLength={150} defaultValue={state?.values.title} className={INPUT} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="subject" className={LABEL}>
          Nhóm
        </label>
        <select id="subject" name="subject" required defaultValue={state?.values.subject ?? ''} className={INPUT}>
          <option value="" disabled>
            Chọn nhóm
          </option>
          {COURSE_SUBJECTS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="level" className={LABEL}>
          Trình độ
        </label>
        <select id="level" name="level" required defaultValue={state?.values.level ?? ''} className={INPUT}>
          <option value="" disabled>
            Chọn trình độ
          </option>
          {COURSE_LEVELS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="description" className={LABEL}>
          Mô tả (không bắt buộc)
        </label>
        <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={state?.values.description} className={INPUT} />
      </div>
      {state && !state.ok && (
        <p role="alert" className={ERROR_ALERT}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={SMALL_BUTTON}>
        {pending ? 'Đang tạo…' : 'Tạo khoá học'}
      </button>
    </form>
  );
}
