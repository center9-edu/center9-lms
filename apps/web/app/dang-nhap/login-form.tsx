'use client';

import { useActionState } from 'react';
import { login } from './actions';
import styles from './login.module.css';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className={styles.form}>
      <label htmlFor="username">Tên đăng nhập</label>
      <input
        id="username"
        name="username"
        defaultValue={state?.username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={100}
        required
      />
      <label htmlFor="password">Mật khẩu</label>
      <input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required />
      {state && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
