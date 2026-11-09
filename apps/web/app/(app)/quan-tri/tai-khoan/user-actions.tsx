'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';
import { ERROR_ALERT, FOCUS, INPUT, LABEL, SMALL_BUTTON, SUCCESS_ALERT } from '../../../ui/styles';
import { resetPassword, updateUser } from './actions';

const DANGER_OUTLINE_BUTTON = `cursor-pointer justify-self-start rounded-lg border border-solid border-danger bg-white px-4 py-2 font-[inherit] text-sm font-semibold text-danger hover:bg-danger-surface disabled:cursor-progress disabled:opacity-70 ${FOCUS}`;

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
    <details className="open:min-w-72">
      <summary className={`cursor-pointer rounded font-semibold text-primary ${FOCUS}`}>Sửa</summary>
      <form action={update} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={user.id} />
        <input type="hidden" name="currentRoles" value={[...user.roles].sort().join()} />
        <input type="hidden" name="currentStatus" value={user.status} />
        <fieldset className="m-0 grid gap-1.5 border-0 p-0">
          <legend className={`${LABEL} mb-1.5 p-0`}>Vai trò</legend>
          {roleOptions.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="checkbox" name="roles" value={value} defaultChecked={user.roles.includes(value)} className="accent-primary" />{' '}
              {label}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-1.5">
          <label htmlFor={`status-${user.id}`} className={LABEL}>
            Trạng thái
          </label>
          <select id={`status-${user.id}`} name="status" defaultValue={user.status} className={`${INPUT} py-2`}>
            {statusOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {updateState && (
          <p role={updateState.ok ? 'status' : 'alert'} className={updateState.ok ? SUCCESS_ALERT : ERROR_ALERT}>
            {updateState.message}
          </p>
        )}
        <button type="submit" disabled={updating} className={SMALL_BUTTON}>
          {updating ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </form>

      <form action={reset} onSubmit={confirmReset} className="mt-4 grid gap-3 border-0 border-t border-solid border-border pt-4">
        <input type="hidden" name="id" value={user.id} />
        {resetState?.ok && (
          <div role="status" className={`${SUCCESS_ALERT} grid gap-1`}>
            <p className="m-0">
              Mật khẩu tạm mới:{' '}
              <code className="rounded bg-white px-1.5 py-0.5 text-lg tracking-wider text-foreground">{resetState.temporaryPassword}</code>
            </p>
            <p className="m-0">Hãy gửi cho người dùng ngay: mật khẩu chỉ hiện một lần.</p>
          </div>
        )}
        {resetState && !resetState.ok && (
          <p role="alert" className={ERROR_ALERT}>
            {resetState.message}
          </p>
        )}
        <button type="submit" disabled={resetting} className={DANGER_OUTLINE_BUTTON}>
          {resetting ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
        </button>
      </form>
    </details>
  );
}
