'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { WEEKDAYS } from '../../../lib/vietnam-time';
import { Badge } from '../../../ui/badge';
import type { BadgeTone } from '../../../ui/badge';
import { DANGER_OUTLINE_BUTTON, ERROR_ALERT, FOCUS, INPUT, LABEL, SMALL_BUTTON, SMALL_OUTLINE_BUTTON } from '../../../ui/styles';
import { changeSchedule } from '../actions';

/** A session as shown; times are formatted on the server, so server and browser cannot disagree. */
export interface SessionRow {
  id: string;
  /** "Buổi 3", or "Đã huỷ". */
  label: string;
  /** "Thứ 3, 01/12/2026 · 18:00–19:30". */
  when: string;
  lesson: { href: string; text: string } | null;
  /** The attendance page; null for a cancelled session. */
  attendanceHref: string | null;
  statusLabel: string;
  statusTone: BadgeTone;
  /** Only a session that has not ended (still scheduled) can be moved or given off. */
  scheduled: boolean;
  /** Vietnam day and times, to fill the edit form. */
  date: string;
  startTime: string;
  endTime: string;
}

interface Props {
  classId: string;
  sessions: SessionRow[];
  totalParts: number;
  missingSessions: number;
  /** Admins: make the schedule, move and add sessions. */
  canEdit: boolean;
  /** Admins and the class's own teachers: give a session off. */
  canDayOff: boolean;
}

const TIME_INPUT = `${INPUT} w-auto`;

function TimeFields({ date, startTime, endTime, dateName = 'date' }: { date?: string; startTime?: string; endTime?: string; dateName?: string }) {
  return (
    <>
      <label className="grid gap-1">
        <span className="text-sm">{dateName === 'startDate' ? 'Ngày bắt đầu' : 'Ngày'}</span>
        <input type="date" name={dateName} required defaultValue={date} className={TIME_INPUT} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm">Từ</span>
        <input type="time" name="startTime" required defaultValue={startTime} className={TIME_INPUT} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm">Đến</span>
        <input type="time" name="endTime" required defaultValue={endTime} className={TIME_INPUT} />
      </label>
    </>
  );
}

/** The class's sessions with the lesson part each one teaches; admins make the schedule and change sessions. */
export function ClassSchedule({ classId, sessions, totalParts, missingSessions, canEdit, canDayOff }: Props) {
  const [state, action, pending] = useActionState(changeSchedule, undefined);

  const form = (intent: string, fields: Record<string, string>, children: ReactNode, className: string, confirm?: string) => (
    <form
      action={action}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        if (confirm && !window.confirm(confirm)) {
          event.preventDefault();
        }
      }}
      className={className}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={classId} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );

  return (
    <div className="grid gap-4">
      {state && (
        <p role="alert" className={ERROR_ALERT}>
          {state.message}
        </p>
      )}

      {sessions.length === 0 && <p className="m-0 text-muted">Lớp chưa có lịch học.</p>}

      {sessions.length === 0 &&
        canEdit &&
        (totalParts === 0 ? (
          <p className="m-0 text-muted">Khoá học chưa có bài nào. Thêm bài ở trang chương trình học trước khi tạo lịch.</p>
        ) : (
          form(
            'createSchedule',
            {},
            <>
              <p className="m-0 text-sm text-muted">Hệ thống tạo {totalParts} buổi, mỗi phần của bài là một buổi, theo thứ tự chương trình.</p>
              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className={`${LABEL} mb-2 p-0`}>Học vào các thứ</legend>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map(({ value, label }) => (
                    <label key={value} className="flex items-center gap-1.5">
                      <input type="checkbox" name="weekdays" value={value} className={FOCUS} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-end gap-3">
                <TimeFields dateName="startDate" />
                <button type="submit" disabled={pending} className={SMALL_BUTTON}>
                  Tạo lịch học
                </button>
              </div>
            </>,
            'grid gap-3',
          )
        ))}

      {missingSessions > 0 && sessions.length > 0 && (
        <p role="status" className="m-0 rounded-xl bg-warning-surface px-4 py-3 text-warning">
          Còn {missingSessions} phần của chương trình chưa có buổi dạy (chương trình có {totalParts} phần).
          {canEdit ? ' Thêm buổi ở cuối danh sách.' : ''}
        </p>
      )}

      {sessions.length > 0 && (
        <ol className="m-0 grid list-none gap-2 p-0">
          {sessions.map((session) => (
            <li key={session.id} className="grid gap-2 border-0 border-b border-solid border-border pb-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-16 font-semibold">{session.label}</span>
                <span className="text-sm">{session.when}</span>
                <Badge tone={session.statusTone}>{session.statusLabel}</Badge>
                {session.attendanceHref && (
                  <Link href={session.attendanceHref} aria-label={`Điểm danh ${session.label}, ${session.when}`} className={`rounded text-sm font-semibold text-primary underline ${FOCUS}`}>
                    Điểm danh
                  </Link>
                )}
                <span className="text-sm text-muted sm:ml-auto">
                  {session.lesson ? (
                    <Link href={session.lesson.href} className={`rounded text-primary underline ${FOCUS}`}>
                      {session.lesson.text}
                    </Link>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              {(canEdit || canDayOff) && session.scheduled && (
                <div className="flex flex-wrap items-start gap-2">
                  {canEdit && (
                    <details className="flex-1">
                      <summary className={`cursor-pointer text-sm text-primary ${FOCUS}`}>Đổi ngày giờ</summary>
                      {form(
                        'updateSession',
                        { sessionId: session.id },
                        <>
                          <TimeFields date={session.date} startTime={session.startTime} endTime={session.endTime} />
                          <button type="submit" disabled={pending} className={SMALL_OUTLINE_BUTTON}>
                            Lưu
                          </button>
                          <p className="m-0 w-full text-sm text-muted">Điểm danh đã ghi của buổi này (nếu có) sẽ bị xoá.</p>
                        </>,
                        'mt-2 flex flex-wrap items-end gap-3',
                      )}
                    </details>
                  )}
                  {canDayOff &&
                    form(
                      'dayOff',
                      { sessionId: session.id },
                      <button type="submit" disabled={pending} aria-label={`Báo nghỉ ${session.label}, ${session.when}`} className={DANGER_OUTLINE_BUTTON}>
                        Báo nghỉ
                      </button>,
                      'sm:ml-auto',
                      `Báo nghỉ ${session.label} (${session.when})? Buổi này sẽ huỷ, điểm danh đã ghi của buổi (nếu có) bị xoá, bài dời sang buổi sau và lịch tự thêm một buổi vào cuối. Không khôi phục được.`,
                    )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit &&
        sessions.length > 0 &&
        form(
          'addSession',
          {},
          <>
            <span className={`${LABEL} basis-full`}>Thêm buổi</span>
            <TimeFields />
            <button type="submit" disabled={pending} className={SMALL_BUTTON}>
              Thêm buổi
            </button>
          </>,
          'flex flex-wrap items-end gap-3 border-0 border-t border-solid border-border pt-4',
        )}
    </div>
  );
}
