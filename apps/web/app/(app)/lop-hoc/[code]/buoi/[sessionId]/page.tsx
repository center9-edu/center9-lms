import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CLASS_ROLES, requireUser } from '../../../../../lib/session';
import { formatSessionTime, vietnamDateTime } from '../../../../../lib/vietnam-time';
import { Badge } from '../../../../../ui/badge';
import { CARD, FOCUS } from '../../../../../ui/styles';
import { ATTENDANCE_OPTIONS, fetchAttendance, formatDay, SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from '../../../classes';
import { AttendanceForm } from './attendance-form';

export const metadata: Metadata = {
  title: 'Điểm danh | Center9Edu LMS',
};

/**
 * One session's attendance. The class's teachers mark it from 15 minutes before the start and can correct it
 * later; other staff read it. The API decides who may edit (`editable`).
 */
export default async function AttendancePage({ params }: { params: Promise<{ code: string; sessionId: string }> }) {
  await requireUser(CLASS_ROLES);
  const { code, sessionId } = await params;
  const sheet = await fetchAttendance(sessionId);
  // The session must belong to the class in the URL.
  if (sheet.classCode !== code) {
    notFound();
  }
  const opens = vietnamDateTime(sheet.opensAt);
  const notice =
    sheet.status === 'CANCELLED'
      ? 'Buổi này đã nghỉ, không điểm danh.'
      : new Date() < new Date(sheet.opensAt)
        ? `Điểm danh mở lúc ${opens.time} ngày ${formatDay(opens.date)} (15 phút trước giờ học).`
        : 'Bạn đang xem điểm danh. Chỉ giáo viên của lớp được điểm danh.';
  const labelOf = (status: string | null) => ATTENDANCE_OPTIONS.find(({ value }) => value === status);

  return (
    <>
      <Link href={`/lop-hoc/${code}`} className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← Lớp {code}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-2xl font-bold">Điểm danh</h1>
        <Badge tone={SESSION_STATUS_TONES[sheet.status]}>{SESSION_STATUS_LABELS[sheet.status]}</Badge>
      </div>
      <p className="mt-1 mb-6 text-muted">
        {formatSessionTime(sheet.startsAt, sheet.endsAt)}
        {sheet.taughtBy && ` · Người dạy: ${sheet.taughtBy.fullName}`}
      </p>

      <section aria-label="Danh sách điểm danh" className={CARD}>
        {sheet.students.length === 0 ? (
          <p className="m-0 text-muted">Lớp chưa có học sinh.</p>
        ) : sheet.editable ? (
          <AttendanceForm
            sessionId={sheet.sessionId}
            students={sheet.students.map(({ enrollmentId, studentCode, fullName, enrollmentStatus, status, note }) => ({
              enrollmentId,
              studentCode,
              fullName,
              left: enrollmentStatus !== 'ACTIVE',
              status,
              note,
            }))}
            options={ATTENDANCE_OPTIONS.map(({ value, label }) => ({ value, label }))}
            teacherOptions={sheet.teacherOptions.map(({ userId, teacherCode, fullName }) => ({ userId, label: `${fullName} (${teacherCode})` }))}
            taughtByName={sheet.taughtBy?.fullName ?? null}
          />
        ) : (
          <>
            <p className="mt-0 mb-4 text-sm text-muted">{notice}</p>
            <ul className="m-0 grid list-none gap-2 p-0">
              {sheet.students.map((student) => {
                const mark = labelOf(student.status);
                return (
                  <li key={student.enrollmentId} className="flex flex-wrap items-center gap-2 border-0 border-b border-solid border-border pb-2">
                    <span className="font-medium">{student.fullName}</span>
                    <span className="text-sm text-muted">{student.studentCode}</span>
                    {mark ? <Badge tone={mark.tone}>{mark.label}</Badge> : <Badge>Chưa điểm danh</Badge>}
                    {student.note && <span className="text-sm text-muted">· {student.note}</span>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
