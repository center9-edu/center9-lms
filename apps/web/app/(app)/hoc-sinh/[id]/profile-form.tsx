'use client';

import { useActionState } from 'react';
import { ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON, SUCCESS_ALERT } from '../../../ui/styles';
import { saveStudentProfile } from './actions';
import type { ProfileValues } from './actions';

export function ProfileForm({ userId, initial, isNew }: { userId: string; initial: ProfileValues; isNew: boolean }) {
  const [state, action, pending] = useActionState(saveStudentProfile, undefined);
  // React resets the form after an action; the defaults below are what it resets to.
  const values = state?.values ?? initial;

  return (
    <form action={action} className="grid max-w-lg gap-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-1.5">
        <label htmlFor="dateOfBirth" className={LABEL}>
          Ngày sinh
        </label>
        <input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={values.dateOfBirth} className={INPUT} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="schoolName" className={LABEL}>
          Trường đang học
        </label>
        <input id="schoolName" name="schoolName" maxLength={200} defaultValue={values.schoolName} className={INPUT} />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="notes" className={LABEL}>
          Ghi chú nội bộ
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          aria-describedby="notesHint"
          defaultValue={values.notes}
          className={INPUT}
        />
        <p id="notesHint" className="m-0 text-sm text-muted">
          Chỉ nhân viên trung tâm xem được. Học sinh và phụ huynh không thấy ghi chú này.
        </p>
      </div>
      {state && (
        <p role={state.ok ? 'status' : 'alert'} className={state.ok ? SUCCESS_ALERT : ERROR_ALERT}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={SMALL_BUTTON}>
        {pending ? 'Đang lưu…' : isNew ? 'Tạo hồ sơ' : 'Lưu hồ sơ'}
      </button>
    </form>
  );
}
