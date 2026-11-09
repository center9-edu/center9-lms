'use client';

import { useActionState } from 'react';
import { ERROR_ALERT, INPUT, LABEL, PRIMARY_BUTTON } from '../ui/styles';
import { changePassword } from './actions';

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className="grid gap-2">
      <label htmlFor="currentPassword" className={LABEL}>
        Mật khẩu hiện tại
      </label>
      <input
        id="currentPassword"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        maxLength={128}
        required
        className={`${INPUT} mb-2`}
      />
      <label htmlFor="newPassword" className={LABEL}>
        Mật khẩu mới
      </label>
      <input
        id="newPassword"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        aria-describedby="newPasswordHint"
        required
        className={INPUT}
      />
      <p id="newPasswordHint" className="m-0 mb-2 text-sm text-muted">
        Từ 8 đến 128 ký tự.
      </p>
      <label htmlFor="confirmPassword" className={LABEL}>
        Nhập lại mật khẩu mới
      </label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        maxLength={128}
        required
        className={`${INPUT} mb-2`}
      />
      {state && (
        <p role="alert" className={ERROR_ALERT}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} mt-2`}>
        {pending ? 'Đang lưu…' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
}
