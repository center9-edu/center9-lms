'use client';

import { useActionState } from 'react';
import { ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON, SUCCESS_ALERT } from '../../../ui/styles';
import { saveTeacherProfile } from './actions';

export function TeacherForm({ userId, initialBio, isNew }: { userId: string; initialBio: string; isNew: boolean }) {
  const [state, action, pending] = useActionState(saveTeacherProfile, undefined);

  return (
    <form action={action} className="grid max-w-lg gap-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-1.5">
        <label htmlFor="bio" className={LABEL}>
          Giới thiệu
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={5}
          maxLength={2000}
          aria-describedby="bioHint"
          defaultValue={state?.bio ?? initialBio}
          className={INPUT}
        />
        <p id="bioHint" className="m-0 text-sm text-muted">
          Ví dụ: chuyên môn, kinh nghiệm giảng dạy. Có thể để trống.
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
