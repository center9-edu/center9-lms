import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ATTENDANCE_LABELS,
  CLASS_ROLES,
  CLASS_STATUS_LABELS,
  CLASS_STATUS_TONES,
  classesFor,
  SESSION_STATUS_LABELS,
  SESSION_STATUS_TONES,
  TEACHER_ROLE_LABELS,
  vnDate,
} from '../../../lib/demo-data';
import type { AttendanceStatus } from '../../../lib/demo-data';
import { requireUser } from '../../../lib/session';
import { Badge } from '../../../ui/badge';
import { DemoBanner } from '../../../ui/demo-banner';
import { CARD, FOCUS } from '../../../ui/styles';
import { ClassSessions } from './class-sessions';
import type { SessionRow } from './class-sessions';

export const metadata: Metadata = {
  title: 'Lớp học | Center9Edu LMS',
};

// Formatted here, not in the client component: server and browser ICU versions can format dates differently.
const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const ATTENDANCE_OPTIONS = (Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[]).map((value) => ({
  value,
  label: ATTENDANCE_LABELS[value],
}));

export default async function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireUser(CLASS_ROLES);
  const { code } = await params;
  // A teacher opening another teacher's class gets the same 404 as an unknown code.
  const now = new Date();
  const demoClass = classesFor(me, now).find((candidate) => candidate.code === code);
  if (!demoClass) {
    notFound();
  }

  const endOfToday = new Date(`${vnDate(now)}T23:59:59.999+07:00`);
  const sessions: SessionRow[] = demoClass.sessions.map((session) => ({
    id: session.id,
    title: session.title,
    when: dateFormat.format(session.startsAt),
    location: session.location,
    cancelled: session.status === 'CANCELLED',
    statusLabel: SESSION_STATUS_LABELS[session.status],
    statusTone: SESSION_STATUS_TONES[session.status],
    upcoming: session.startsAt > endOfToday,
    attendance: session.attendance,
  }));
  // Open the session a teacher is most likely to mark: today's, else the last one held.
  const initialSession = sessions.findLast((session) => !session.upcoming && !session.cancelled) ?? sessions[0];

  return (
    <>
      <Link href="/lop-hoc" className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← Lớp học
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-2xl font-bold">{demoClass.name}</h1>
        <Badge tone={CLASS_STATUS_TONES[demoClass.status]}>{CLASS_STATUS_LABELS[demoClass.status]}</Badge>
      </div>
      <p className="mt-1 mb-4 text-muted">
        {demoClass.code} · {demoClass.course}
      </p>
      <DemoBanner>Điểm danh chỉ lưu tạm trên trang này và mất khi tải lại trang.</DemoBanner>

      <section aria-label="Thông tin lớp" className={`${CARD} mb-6`}>
        <dl className="m-0 grid gap-x-8 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted">Giáo viên</dt>
            {demoClass.teachers.map((teacher) => (
              <dd key={teacher.username} className="m-0">
                {teacher.fullName} <span className="text-sm text-muted">({TEACHER_ROLE_LABELS[teacher.roleInClass]})</span>
              </dd>
            ))}
          </div>
          <div>
            <dt className="text-sm text-muted">Sĩ số</dt>
            <dd className="m-0">
              {demoClass.students.length}/{demoClass.capacity} học sinh
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Học sinh</dt>
            <dd className="m-0">{demoClass.students.map((student) => student.fullName).join(', ')}</dd>
          </div>
        </dl>
      </section>

      <ClassSessions sessions={sessions} students={demoClass.students} statuses={ATTENDANCE_OPTIONS} initialSessionId={initialSession?.id} />
    </>
  );
}
