'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';
import { DANGER_OUTLINE_BUTTON, ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON, SUCCESS_ALERT } from '../../../ui/styles';
import { archiveCourse, updateCourse } from '../actions';
import type { CourseValues } from '../actions';
import { COURSE_LEVELS, COURSE_SUBJECTS } from '../course-options';

interface Props {
  id: string;
  initial: CourseValues;
}

export function CourseForm({ id, initial }: Props) {
  const [state, action, pending] = useActionState(updateCourse, undefined);
  const [archiveState, archive, archiving] = useActionState(archiveCourse, undefined);
  const values = state?.values ?? initial;

  function confirmArchive(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Lưu trữ khoá học "${initial.title}"? Chương trình học sẽ không sửa được nữa; các lớp đã dùng khoá học vẫn giữ nguyên.`)) {
      event.preventDefault();
    }
  }

  return (
    <>
      <form action={action} className="grid max-w-lg gap-4">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="currentSlug" value={initial.slug} />
        <div className="grid gap-1.5">
          <label htmlFor="title" className={LABEL}>
            Tên khoá học
          </label>
          <input id="title" name="title" required maxLength={150} defaultValue={values.title} className={INPUT} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="subject" className={LABEL}>
            Nhóm
          </label>
          <select id="subject" name="subject" required defaultValue={values.subject} className={INPUT}>
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
          <select id="level" name="level" required defaultValue={values.level} className={INPUT}>
            {COURSE_LEVELS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="description" className={LABEL}>
            Mô tả
          </label>
          <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={values.description} className={INPUT} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="slug" className={LABEL}>
            Đường dẫn
          </label>
          <input
            id="slug"
            name="slug"
            required
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="slugHint"
            defaultValue={values.slug}
            className={INPUT}
          />
          <p id="slugHint" className="m-0 text-sm text-muted">
            Chữ thường không dấu, số và dấu gạch ngang. Ví dụ: lap-trinh-python. Đổi đường dẫn thì link cũ không mở được nữa.
          </p>
        </div>
        {state && (
          <p role={state.ok ? 'status' : 'alert'} className={state.ok ? SUCCESS_ALERT : ERROR_ALERT}>
            {state.message}
          </p>
        )}
        <button type="submit" disabled={pending} className={SMALL_BUTTON}>
          {pending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </form>

      <form action={archive} onSubmit={confirmArchive} className="mt-6 grid gap-3 border-0 border-t border-solid border-border pt-4">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="currentSlug" value={initial.slug} />
        {archiveState && (
          <p role="alert" className={ERROR_ALERT}>
            {archiveState.message}
          </p>
        )}
        <button type="submit" disabled={archiving} className={DANGER_OUTLINE_BUTTON}>
          {archiving ? 'Đang lưu trữ…' : 'Lưu trữ khoá học'}
        </button>
      </form>
    </>
  );
}
