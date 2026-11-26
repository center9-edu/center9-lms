'use client';

import { useActionState, useState } from 'react';
import type { FormEvent } from 'react';
import { matchesSearch } from '../../../lib/search';
import { Badge } from '../../../ui/badge';
import type { BadgeTone } from '../../../ui/badge';
import { DANGER_OUTLINE_BUTTON, ERROR_ALERT, INPUT, LABEL, SMALL_BUTTON, SMALL_OUTLINE_BUTTON } from '../../../ui/styles';
import { changeEnrollment } from '../actions';

interface Row {
  id: string;
  studentCode: string;
  fullName: string;
  statusLabel: string;
  statusTone: BadgeTone;
  /** dd/mm/yyyy. */
  enrolledOn: string;
  /** What the API allows next, with the button label. */
  actions: { status: string; label: string }[];
}

interface Props {
  classId: string;
  rows: Row[];
  /** Students who can still be enrolled; undefined for someone who may only read. */
  candidates?: { userId: string; studentCode: string; fullName: string }[];
}

// Moves that cannot be undone, or take a student off the list, ask first.
const CONFIRM: Record<string, (name: string) => string> = {
  DROPPED: (name) => `${name} nghỉ học? Học sinh đã nghỉ không vào lại lớp này được.`,
  REMOVED: (name) => `Rút ${name} khỏi lớp? Có thể khôi phục sau nếu còn chỗ.`,
  COMPLETED: (name) => `Đánh dấu ${name} đã hoàn thành lớp?`,
};

/** The class's students; admins and sales also enroll them and change their status. */
export function ClassStudents({ classId, rows, candidates }: Props) {
  const [state, action, pending] = useActionState(changeEnrollment, undefined);
  const [query, setQuery] = useState('');
  const matching = candidates?.filter((candidate) => matchesSearch([candidate.studentCode, candidate.fullName], query));

  function confirmChange(name: string) {
    return (event: FormEvent<HTMLFormElement>) => {
      const status = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter).get('status');
      const ask = typeof status === 'string' ? CONFIRM[status] : undefined;
      if (ask && !window.confirm(ask(name))) {
        event.preventDefault();
      }
    };
  }

  return (
    <div className="grid gap-4">
      {state && (
        <p role="alert" className={ERROR_ALERT}>
          {state.message}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="m-0 text-muted">Lớp chưa có học sinh.</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 border-0 border-b border-solid border-border pb-2">
              <span className="font-medium">{row.fullName}</span>
              <span className="text-sm text-muted">
                {row.studentCode} · vào lớp {row.enrolledOn}
              </span>
              <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
              {candidates && row.actions.length > 0 && (
                <form action={action} onSubmit={confirmChange(row.fullName)} className="flex flex-wrap gap-2 sm:ml-auto">
                  <input type="hidden" name="id" value={classId} />
                  <input type="hidden" name="enrollmentId" value={row.id} />
                  {row.actions.map(({ status, label }) => (
                    <button
                      key={status}
                      type="submit"
                      name="status"
                      value={status}
                      disabled={pending}
                      aria-label={`${label}: ${row.fullName}`}
                      className={status === 'DROPPED' || status === 'REMOVED' ? DANGER_OUTLINE_BUTTON : SMALL_OUTLINE_BUTTON}
                    >
                      {label}
                    </button>
                  ))}
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {candidates && matching && (
        <form action={action} className="grid gap-3 border-0 border-t border-solid border-border pt-4">
          <input type="hidden" name="id" value={classId} />
          <input type="hidden" name="intent" value="enroll" />
          <span className={LABEL}>Ghi danh học sinh</span>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-48 flex-1 gap-1.5">
              <span className="text-sm">Tìm theo mã hoặc tên</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="HS0001, Minh…" className={INPUT} />
            </label>
            <label className="grid min-w-56 flex-1 gap-1.5">
              <span className="text-sm">Học sinh ({matching.length})</span>
              <select name="studentId" required defaultValue="" key={query} className={INPUT}>
                <option value="" disabled>
                  {candidates.length === 0 ? 'Không còn học sinh nào để ghi danh' : matching.length === 0 ? 'Không có học sinh khớp' : 'Chọn học sinh'}
                </option>
                {matching.map((candidate) => (
                  <option key={candidate.userId} value={candidate.userId}>
                    {candidate.studentCode} · {candidate.fullName}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={pending || matching.length === 0} className={SMALL_BUTTON}>
              Ghi danh
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
