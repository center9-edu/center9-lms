'use client';

import { useActionState } from 'react';
import styles from '../admin.module.css';
import { createUser } from './actions';

export function CreateUserForm({ roleOptions }: { roleOptions: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const failed = state && !state.ok ? state : undefined;

  return (
    <>
      {state?.ok && (
        <div role="status" className={styles.success}>
          <p>
            Đã tạo tài khoản <strong>{state.username}</strong> cho {state.fullName}.
          </p>
          <p>
            Mật khẩu tạm: <code className={styles.password}>{state.temporaryPassword}</code>
          </p>
          <p>Hãy gửi mật khẩu này cho người dùng ngay: nó chỉ hiện một lần, và người dùng phải đổi khi đăng nhập lần đầu.</p>
        </div>
      )}
      {/* key: start empty after a success, keep what was typed after an error. */}
      <form key={state?.ok ? state.username : 'form'} action={action} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="fullName">Họ và tên</label>
          <input id="fullName" name="fullName" maxLength={100} defaultValue={failed?.fullName} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="username">Tên đăng nhập</label>
          <input
            id="username"
            name="username"
            pattern="[a-z0-9._\-]{3,32}"
            maxLength={32}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="usernameHint"
            defaultValue={failed?.username}
            required
          />
          <p id="usernameHint" className={styles.hint}>
            3–32 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang. Ví dụ: hs.an hoặc gv_lan.
          </p>
        </div>
        <fieldset className={styles.roles}>
          <legend>Vai trò</legend>
          {roleOptions.map(({ value, label }) => (
            <label key={value}>
              <input type="checkbox" name="roles" value={value} defaultChecked={failed?.roles.includes(value)} /> {label}
            </label>
          ))}
        </fieldset>
        {failed && (
          <p role="alert" className={styles.error}>
            {failed.message}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? 'Đang tạo…' : 'Tạo tài khoản'}
        </button>
      </form>
    </>
  );
}
