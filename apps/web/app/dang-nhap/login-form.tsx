'use client';

import { useActionState } from 'react';
import { ERROR_ALERT, INPUT, LABEL, PRIMARY_BUTTON } from '../ui/styles';
import { login } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="grid gap-2">
      <label htmlFor="username" className={LABEL}>
        Tên đăng nhập
      </label>
      <input
        id="username"
        name="username"
        defaultValue={state?.username}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={100}
        required
        className={`${INPUT} mb-2`}
      />
      <label htmlFor="password" className={LABEL}>
        Mật khẩu
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
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
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
