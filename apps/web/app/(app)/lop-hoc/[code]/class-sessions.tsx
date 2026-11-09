'use client';

import { useState } from 'react';
// Types only: importing values from demo-data would ship the fake data to the browser.
import type { AttendanceStatus, DemoPerson } from '../../../lib/demo-data';
import { Badge } from '../../../ui/badge';
import type { BadgeTone } from '../../../ui/badge';
import { FOCUS, OUTLINE_BUTTON } from '../../../ui/styles';

/** Everything is formatted on the server, so server and browser render the same text. */
export interface SessionRow {
  id: string;
  title: string;
  when: string;
  location: string;
  statusLabel: string;
  statusTone: BadgeTone;
  cancelled: boolean;
  upcoming: boolean;
  attendance: Record<string, AttendanceStatus>;
}

const ATTENDANCE_TONES: Record<AttendanceStatus, string> = {
  PRESENT: 'peer-checked:border-success peer-checked:bg-success-surface peer-checked:text-success',
  LATE: 'peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:text-amber-900',
  EXCUSED: 'peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary',
  ABSENT: 'peer-checked:border-danger peer-checked:bg-danger-surface peer-checked:text-danger',
};

interface Props {
  sessions: SessionRow[];
  students: DemoPerson[];
  statuses: { value: AttendanceStatus; label: string }[];
  initialSessionId?: string;
}

/** DEMO: attendance lives in React state only and resets on reload. */
export function ClassSessions({ sessions, students, statuses, initialSessionId }: Props) {
  const [selectedId, setSelectedId] = useState(initialSessionId ?? sessions[0]?.id);
  const [marks, setMarks] = useState(() => Object.fromEntries(sessions.map((session) => [session.id, session.attendance])));
  const selected = sessions.find((session) => session.id === selectedId);
  const sheet = selected ? marks[selected.id] : {};

  const mark = (sessionId: string, changes: Record<string, AttendanceStatus>) =>
    setMarks((current) => ({ ...current, [sessionId]: { ...current[sessionId], ...changes } }));

  const presentCount = (sessionId: string) =>
    students.filter((student) => ['PRESENT', 'LATE'].includes(marks[sessionId][student.username])).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className="m-0 mb-3 text-lg font-semibold">
          Buổi học ({sessions.length})
        </h2>
        <ol className="m-0 grid list-none gap-2 p-0">
          {sessions.map((session, index) => {
            const marked = Object.keys(marks[session.id]).length > 0;
            return (
              <li key={session.id}>
                <button
                  type="button"
                  aria-pressed={session.id === selectedId}
                  onClick={() => setSelectedId(session.id)}
                  className={`box-border w-full cursor-pointer rounded-lg border border-solid bg-white p-3 text-left font-[inherit] text-foreground hover:border-primary ${FOCUS} ${
                    session.id === selectedId ? 'border-primary ring-1 ring-primary' : 'border-border'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold">
                      Buổi {index + 1}: {session.title}
                    </span>
                    <Badge tone={session.statusTone}>{session.statusLabel}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {session.when} · {session.location}
                    {marked && ` · có mặt ${presentCount(session.id)}/${students.length}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="attendance-heading" className="box-border rounded-xl border border-solid border-border bg-white p-5">
        <h2 id="attendance-heading" className="m-0 text-lg font-semibold">
          Điểm danh
        </h2>
        {!selected ? (
          <p className="m-0 mt-2 text-muted">Lớp chưa có buổi học.</p>
        ) : (
          <>
            <p className="m-0 mt-1 mb-4 text-sm text-muted">
              {selected.title} · {selected.when}
            </p>
            {selected.cancelled ? (
              <p className="m-0 text-muted">Buổi học này đã huỷ.</p>
            ) : selected.upcoming ? (
              <p className="m-0 text-muted">Buổi học chưa diễn ra. Có thể điểm danh từ ngày học.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button
                    type="button"
                    className={`${OUTLINE_BUTTON} px-4 py-2 text-sm`}
                    onClick={() => mark(selected.id, Object.fromEntries(students.map((student) => [student.username, 'PRESENT'])))}
                  >
                    Có mặt tất cả
                  </button>
                  <p className="m-0 text-sm" aria-live="polite">
                    {statuses.map(({ value, label }) => `${label}: ${students.filter((s) => sheet[s.username] === value).length}`).join(' · ')}
                    {' · '}Chưa điểm danh: {students.filter((s) => !sheet[s.username]).length}
                  </p>
                </div>
                <ul className="m-0 grid list-none gap-3 p-0">
                  {students.map((student) => (
                    <li key={student.username}>
                      <fieldset className="m-0 border-0 border-b border-solid border-border p-0 pb-3">
                        <legend className="mb-1.5 p-0 font-medium">{student.fullName}</legend>
                        <div className="flex flex-wrap gap-2">
                          {statuses.map(({ value, label }) => (
                            <label key={value} className="cursor-pointer">
                              <input
                                type="radio"
                                name={`${selected.id}-${student.username}`}
                                value={value}
                                checked={sheet[student.username] === value}
                                onChange={() => mark(selected.id, { [student.username]: value })}
                                className="peer sr-only"
                              />
                              <span
                                className={`inline-block rounded-full border border-solid border-border px-3 py-1 text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${ATTENDANCE_TONES[value]}`}
                              >
                                {label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
