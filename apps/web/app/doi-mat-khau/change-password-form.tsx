'use client';

import { useActionState } from 'react';
import styles from '../dang-nhap/login.module.css';
import { changePassword } from './actions';

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);

  return (
    <form action={action} className={styles.form}>
      <label htmlFor="currentPassword">Mật khẩu hiện tại</label>
      <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required />
      <label htmlFor="newPassword">Mật khẩu mới</label>
      <input
        id="newPassword"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        aria-describedby="newPasswordHint"
        required
      />
      <p id="newPasswordHint" className={styles.hint}>
        Từ 8 đến 128 ký tự.
      </p>
      <label htmlFor="confirmPassword">Nhập lại mật khẩu mới</label>
      <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" maxLength={128} required />
      {state && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang lưu…' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
}
