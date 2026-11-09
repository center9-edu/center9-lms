'use client';

import { useActionState } from 'react';
import { ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON, SUCCESS_ALERT } from '../../../ui/styles';
import { createUser } from './actions';

export function CreateUserForm({ roleOptions }: { roleOptions: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const failed = state && !state.ok ? state : undefined;

  return (
    <>
      {state?.ok && (
        <div role="status" className={`${SUCCESS_ALERT} mb-4 grid gap-1`}>
          <p className="m-0">
            Đã tạo tài khoản <strong>{state.username}</strong> cho {state.fullName}.
          </p>
          <p className="m-0">
            Mật khẩu tạm:{' '}
            <code className="rounded bg-white px-1.5 py-0.5 text-lg tracking-wider text-foreground">{state.temporaryPassword}</code>
          </p>
          <p className="m-0">Hãy gửi mật khẩu này cho người dùng ngay: nó chỉ hiện một lần, và người dùng phải đổi khi đăng nhập lần đầu.</p>
        </div>
      )}
      {/* key: start empty after a success, keep what was typed after an error. */}
      <form key={state?.ok ? state.username : 'form'} action={action} className="grid max-w-lg gap-4">
        <div className="grid gap-1.5">
          <label htmlFor="fullName" className={LABEL}>
            Họ và tên
          </label>
          <input id="fullName" name="fullName" maxLength={100} defaultValue={failed?.fullName} required className={INPUT} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="username" className={LABEL}>
            Tên đăng nhập
          </label>
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
            className={INPUT}
          />
          <p id="usernameHint" className="m-0 text-sm text-muted">
            3–32 ký tự: chữ thường không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang. Ví dụ: hs.an hoặc gv_lan.
          </p>
        </div>
        <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0">
          <legend className={`${LABEL} mb-2 p-0`}>Vai trò</legend>
          {roleOptions.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="checkbox" name="roles" value={value} defaultChecked={failed?.roles.includes(value)} className="accent-primary" />{' '}
              {label}
            </label>
          ))}
        </fieldset>
        {failed && (
          <p role="alert" className={ERROR_ALERT}>
            {failed.message}
          </p>
        )}
        <button type="submit" disabled={pending} className={SMALL_BUTTON}>
          {pending ? 'Đang tạo…' : 'Tạo tài khoản'}
        </button>
      </form>
    </>
  );
}
