'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';
import { DANGER_OUTLINE_BUTTON, ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON, SUCCESS_ALERT } from '../../ui/styles';
import { changeClassStatus, createClass, updateClass } from './actions';
import type { ClassValues } from './actions';

type Props =
  | { mode: 'create'; courses: { id: string; title: string }[] }
  | { mode: 'edit'; id: string; initial: Omit<ClassValues, 'courseId'> };

const EMPTY: ClassValues = { courseId: '', name: '', startDate: '', endDate: '', capacity: '' };

/** Create a class (choosing its course) or edit one; the course is fixed once the class exists. */
export function ClassForm(props: Props) {
  const [state, action, pending] = useActionState(props.mode === 'create' ? createClass : updateClass, undefined);
  const values = state?.values ?? (props.mode === 'edit' ? { ...props.initial, courseId: '' } : EMPTY);

  return (
    <form action={action} className="grid max-w-lg gap-4">
      {props.mode === 'edit' && <input type="hidden" name="id" value={props.id} />}
      {props.mode === 'create' && (
        <div className="grid gap-1.5">
          <label htmlFor="courseId" className={LABEL}>
            Khoá học
          </label>
          <select id="courseId" name="courseId" required defaultValue={values.courseId} className={INPUT}>
            <option value="" disabled>
              Chọn khoá học
            </option>
            {props.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-1.5">
        <label htmlFor="name" className={LABEL}>
          Tên lớp
        </label>
        <input id="name" name="name" required maxLength={150} defaultValue={values.name} placeholder="Ví dụ: Python Cơ bản – Tối T3/T5" className={INPUT} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="startDate" className={LABEL}>
            Ngày bắt đầu (không bắt buộc)
          </label>
          <input id="startDate" name="startDate" type="date" defaultValue={values.startDate} className={INPUT} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="endDate" className={LABEL}>
            Ngày kết thúc (không bắt buộc)
          </label>
          <input id="endDate" name="endDate" type="date" defaultValue={values.endDate} className={INPUT} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="capacity" className={LABEL}>
          Sĩ số tối đa (để trống nếu không giới hạn)
        </label>
        <input id="capacity" name="capacity" type="number" min={1} max={500} defaultValue={values.capacity} className={`${INPUT} max-w-40`} />
      </div>
      {state && (
        <p role={state.ok ? 'status' : 'alert'} className={state.ok ? SUCCESS_ALERT : ERROR_ALERT}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={SMALL_BUTTON}>
        {pending ? 'Đang lưu…' : props.mode === 'create' ? 'Tạo lớp' : 'Lưu thay đổi'}
      </button>
    </form>
  );
}

/** One button per status the API allows next; cancelling asks first, since nothing leaves CANCELLED. */
export function StatusButtons({ id, classLabel, options }: { id: string; classLabel: string; options: { status: string; label: string }[] }) {
  const [state, action, pending] = useActionState(changeClassStatus, undefined);

  function confirmCancel(event: FormEvent<HTMLFormElement>) {
    const status = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter).get('status');
    const message =
      status === 'CANCELLED'
        ? `Huỷ lớp "${classLabel}"? Lớp đã huỷ không mở lại được.`
        : status === 'COMPLETED'
          ? `Kết thúc lớp "${classLabel}"? Lớp đã kết thúc không sửa được nữa.`
          : undefined;
    if (message && !window.confirm(message)) {
      event.preventDefault();
    }
  }

  if (options.length === 0) {
    return null;
  }
  return (
    <form action={action} onSubmit={confirmCancel} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap gap-2">
        {options.map(({ status, label }) => (
          <button key={status} type="submit" name="status" value={status} disabled={pending} className={status === 'CANCELLED' ? DANGER_OUTLINE_BUTTON : SMALL_BUTTON}>
            {label}
          </button>
        ))}
      </div>
      {state && (
        <p role="alert" className={ERROR_ALERT}>
          {state.message}
        </p>
      )}
    </form>
  );
}
