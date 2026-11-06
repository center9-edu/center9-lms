'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';
import styles from '../admin.module.css';
import { resetPassword, updateUser } from './actions';

interface Props {
  user: { id: string; username: string; fullName: string; roles: string[]; status: string };
  roleOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
}

export function UserActions({ user, roleOptions, statusOptions }: Props) {
  const [updateState, update, updating] = useActionState(updateUser, undefined);
  const [resetState, reset, resetting] = useActionState(resetPassword, undefined);

  function confirmReset(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Đặt lại mật khẩu cho ${user.fullName}? Mật khẩu hiện tại sẽ ngừng dùng được và người dùng bị đăng xuất.`)) {
      event.preventDefault();
    }
  }

  return (
    <details className={styles.actions}>
      <summary>Sửa</summary>
      <form action={update} className={styles.form}>
        <input type="hidden" name="id" value={user.id} />
        <input type="hidden" name="currentRoles" value={[...user.roles].sort().join()} />
        <input type="hidden" name="currentStatus" value={user.status} />
        <fieldset className={styles.roles}>
          <legend>Vai trò</legend>
          {roleOptions.map(({ value, label }) => (
            <label key={value}>
              <input type="checkbox" name="roles" value={value} defaultChecked={user.roles.includes(value)} /> {label}
            </label>
          ))}
        </fieldset>
        <div className={styles.field}>
          <label htmlFor={`status-${user.id}`}>Trạng thái</label>
          <select id={`status-${user.id}`} name="status" defaultValue={user.status}>
            {statusOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {updateState && (
          <p role={updateState.ok ? 'status' : 'alert'} className={updateState.ok ? styles.success : styles.error}>
            {updateState.message}
          </p>
        )}
        <button type="submit" disabled={updating}>
          {updating ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </form>

      <form action={reset} onSubmit={confirmReset} className={styles.form}>
        <input type="hidden" name="id" value={user.id} />
        {resetState?.ok && (
          <div role="status" className={styles.success}>
            <p>
              Mật khẩu tạm mới: <code className={styles.password}>{resetState.temporaryPassword}</code>
            </p>
            <p>Hãy gửi cho người dùng ngay: mật khẩu chỉ hiện một lần.</p>
          </div>
        )}
        {resetState && !resetState.ok && (
          <p role="alert" className={styles.error}>
            {resetState.message}
          </p>
        )}
        <button type="submit" disabled={resetting} className={styles.secondary}>
          {resetting ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
        </button>
      </form>
    </details>
  );
}
