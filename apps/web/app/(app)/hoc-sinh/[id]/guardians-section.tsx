'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';
import { Badge } from '../../../ui/badge';
import { DANGER_OUTLINE_BUTTON, ERROR_ALERT, FOCUS, INPUT, LABEL, SMALL_BUTTON, SUCCESS_ALERT } from '../../../ui/styles';
import { createAndLinkGuardian, linkGuardian, unlinkGuardian, updateGuardian } from './actions';
import type { ActionState, GuardianState, GuardianValues } from './actions';

const SUMMARY = `cursor-pointer rounded font-semibold text-primary ${FOCUS}`;
const DIVIDER = 'mt-4 grid gap-3 border-0 border-t border-solid border-border pt-4';

interface Option {
  value: string;
  label: string;
}

export interface LinkedGuardian {
  guardianId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  username: string | null;
  relationship: string;
  relationshipLabel: string;
  isPrimaryContact: boolean;
}

interface Props {
  studentId: string;
  studentName: string;
  guardians: LinkedGuardian[];
  /** Guardians in the system who are not linked to this student yet. */
  available: Option[];
  relationshipOptions: Option[];
}

export function GuardiansSection({ studentId, studentName, guardians, available, relationshipOptions }: Props) {
  return (
    <>
      {guardians.length === 0 ? (
        <p className="m-0 mb-4 text-muted">Chưa có phụ huynh nào.</p>
      ) : (
        <ul className="m-0 mb-4 grid list-none gap-3 p-0">
          {guardians.map((guardian) => (
            <GuardianItem key={guardian.guardianId} studentId={studentId} studentName={studentName} guardian={guardian} relationshipOptions={relationshipOptions} />
          ))}
        </ul>
      )}
      <details>
        <summary className={SUMMARY}>Thêm phụ huynh mới</summary>
        <NewGuardianForm studentId={studentId} relationshipOptions={relationshipOptions} />
      </details>
      {available.length > 0 && (
        <details className="mt-3">
          <summary className={SUMMARY}>Chọn phụ huynh đã có (ví dụ: anh chị em ruột)</summary>
          <ExistingGuardianForm studentId={studentId} available={available} relationshipOptions={relationshipOptions} />
        </details>
      )}
    </>
  );
}

function GuardianItem({ studentId, studentName, guardian, relationshipOptions }: { studentId: string; studentName: string; guardian: LinkedGuardian; relationshipOptions: Option[] }) {
  const [linkState, saveLink, savingLink] = useActionState(linkGuardian, undefined);
  const [infoState, saveInfo, savingInfo] = useActionState(updateGuardian, undefined);
  const [unlinkState, unlink, unlinking] = useActionState(unlinkGuardian, undefined);
  const id = guardian.guardianId;
  const info = infoState?.values ?? {
    fullName: guardian.fullName,
    phone: guardian.phone ?? '',
    email: guardian.email ?? '',
    username: guardian.username ?? '',
  };

  function confirmUnlink(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Gỡ ${guardian.fullName} khỏi ${studentName}? Thông tin phụ huynh vẫn được giữ lại.`)) {
      event.preventDefault();
    }
  }

  return (
    <li className="rounded-lg border border-solid border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{guardian.fullName}</span>
        <span className="text-muted">({guardian.relationshipLabel})</span>
        {guardian.isPrimaryContact && <Badge tone="primary">Liên hệ chính</Badge>}
        {guardian.username && <Badge>Tài khoản: {guardian.username}</Badge>}
      </div>
      <p className="m-0 mt-1 text-sm text-muted">{[guardian.phone, guardian.email].filter(Boolean).join(' · ')}</p>

      <details className="mt-2">
        <summary className={SUMMARY}>Sửa</summary>
        <form action={saveLink} className="mt-3 grid max-w-lg gap-3">
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="guardianId" value={id} />
          <LinkFields idPrefix={id} options={relationshipOptions} relationship={guardian.relationship} isPrimaryContact={guardian.isPrimaryContact} />
          <Message state={linkState} />
          <button type="submit" disabled={savingLink} className={SMALL_BUTTON}>
            {savingLink ? 'Đang lưu…' : 'Lưu quan hệ'}
          </button>
        </form>

        <form action={saveInfo} className={`${DIVIDER} max-w-lg`}>
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="guardianId" value={id} />
          <p className="m-0 text-sm text-muted">Thông tin này dùng chung cho mọi học sinh của phụ huynh.</p>
          <GuardianFields idPrefix={id} values={info} />
          <Message state={infoState} />
          <button type="submit" disabled={savingInfo} className={SMALL_BUTTON}>
            {savingInfo ? 'Đang lưu…' : 'Lưu thông tin phụ huynh'}
          </button>
        </form>

        <form action={unlink} onSubmit={confirmUnlink} className={DIVIDER}>
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="guardianId" value={id} />
          <Message state={unlinkState} />
          <button type="submit" disabled={unlinking} className={DANGER_OUTLINE_BUTTON}>
            {unlinking ? 'Đang gỡ…' : 'Gỡ khỏi học sinh'}
          </button>
        </form>
      </details>
    </li>
  );
}

function NewGuardianForm({ studentId, relationshipOptions }: { studentId: string; relationshipOptions: Option[] }) {
  const [state, action, pending] = useActionState(createAndLinkGuardian, undefined);
  const values = state?.values;

  return (
    <form action={action} className="mt-3 grid max-w-lg gap-3">
      <input type="hidden" name="studentId" value={studentId} />
      <GuardianFields idPrefix="new" values={values ?? { fullName: '', phone: '', email: '', username: '' }} />
      <LinkFields idPrefix="new" options={relationshipOptions} relationship={values?.relationship ?? ''} isPrimaryContact={values?.isPrimaryContact ?? false} />
      <Message state={state} />
      <button type="submit" disabled={pending} className={SMALL_BUTTON}>
        {pending ? 'Đang thêm…' : 'Thêm phụ huynh'}
      </button>
    </form>
  );
}

function ExistingGuardianForm({ studentId, available, relationshipOptions }: { studentId: string; available: Option[]; relationshipOptions: Option[] }) {
  const [state, action, pending] = useActionState(linkGuardian, undefined);

  return (
    <form action={action} className="mt-3 grid max-w-lg gap-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-1.5">
        <label htmlFor="existing-guardian" className={LABEL}>
          Phụ huynh
        </label>
        <select id="existing-guardian" name="guardianId" required defaultValue="" className={`${INPUT} py-2`}>
          <option value="" disabled>
            Chọn phụ huynh
          </option>
          {available.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <LinkFields idPrefix="existing" options={relationshipOptions} relationship="" isPrimaryContact={false} />
      <Message state={state} />
      <button type="submit" disabled={pending} className={SMALL_BUTTON}>
        {pending ? 'Đang gắn…' : 'Gắn với học sinh'}
      </button>
    </form>
  );
}

function GuardianFields({ idPrefix, values }: { idPrefix: string; values: GuardianValues }) {
  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-fullName`} className={LABEL}>
          Họ và tên
        </label>
        <input id={`${idPrefix}-fullName`} name="fullName" required maxLength={100} defaultValue={values.fullName} className={INPUT} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={`${idPrefix}-phone`} className={LABEL}>
            Số điện thoại
          </label>
          <input id={`${idPrefix}-phone`} name="phone" type="tel" maxLength={20} autoComplete="off" defaultValue={values.phone} className={INPUT} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${idPrefix}-email`} className={LABEL}>
            Email
          </label>
          <input id={`${idPrefix}-email`} name="email" type="email" maxLength={254} autoComplete="off" defaultValue={values.email} className={INPUT} />
        </div>
      </div>
      <p className="m-0 text-sm text-muted">Cần ít nhất số điện thoại hoặc email.</p>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-username`} className={LABEL}>
          Tên đăng nhập của phụ huynh (nếu có)
        </label>
        <input
          id={`${idPrefix}-username`}
          name="username"
          maxLength={32}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${idPrefix}-usernameHint`}
          defaultValue={values.username}
          className={INPUT}
        />
        <p id={`${idPrefix}-usernameHint`} className="m-0 text-sm text-muted">
          Để phụ huynh đăng nhập xem thông tin của con. Tài khoản do quản trị viên tạo, với vai trò Phụ huynh.
        </p>
      </div>
    </>
  );
}

function LinkFields({ idPrefix, options, relationship, isPrimaryContact }: { idPrefix: string; options: Option[]; relationship: string; isPrimaryContact: boolean }) {
  return (
    <>
      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-relationship`} className={LABEL}>
          Quan hệ với học sinh
        </label>
        <select id={`${idPrefix}-relationship`} name="relationship" required defaultValue={relationship} className={`${INPUT} py-2`}>
          <option value="" disabled>
            Chọn quan hệ
          </option>
          {options.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" name="isPrimaryContact" defaultChecked={isPrimaryContact} className="accent-primary" /> Người liên hệ chính
      </label>
    </>
  );
}

function Message({ state }: { state: ActionState | GuardianState }) {
  if (!state) {
    return null;
  }
  return (
    <p role={state.ok ? 'status' : 'alert'} className={state.ok ? SUCCESS_ALERT : ERROR_ALERT}>
      {state.message}
    </p>
  );
}
