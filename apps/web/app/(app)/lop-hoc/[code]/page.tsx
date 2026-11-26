import type { Metadata } from 'next';
import Link from 'next/link';
import { ADMIN_ROLES, CLASS_ROLES, isStaff, LEARNER_ROLES, requireUser, STUDENT_MANAGER_ROLES } from '../../../lib/session';
import { formatSessionTime, vietnamDateTime } from '../../../lib/vietnam-time';
import { Badge } from '../../../ui/badge';
import { CARD, FOCUS } from '../../../ui/styles';
import { fetchTeachers } from '../../giao-vien/teachers';
import { fetchStudents } from '../../hoc-sinh/students';
import { ClassForm, StatusButtons } from '../class-form';
import {
  CLASS_STATUS_LABELS,
  CLASS_STATUS_TONES,
  ENROLLMENT_ACTION_LABELS,
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_TONES,
  fetchClass,
  fetchEnrollments,
  formatCapacity,
  formatDateRange,
  formatDay,
  SESSION_STATUS_LABELS,
  SESSION_STATUS_TONES,
  STATUS_ACTION_LABELS,
  TEACHER_ROLE_LABELS,
} from '../classes';
import { fetchLearnerClass } from '../learner';
import { LearnerClassView } from '../learner-views';
import { ClassSchedule } from './class-schedule';
import { ClassStudents } from './class-students';
import { ClassTeachers } from './class-teachers';

export const metadata: Metadata = {
  title: 'Lớp học | Center9Edu LMS',
};

export default async function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireUser([...CLASS_ROLES, ...LEARNER_ROLES]);
  const { code } = await params;
  if (!isStaff(me)) {
    // The learner API answers 404 for any class that is not theirs.
    return <LearnerClassView item={await fetchLearnerClass(code)} isParent={!me.roles.includes('STUDENT')} />;
  }
  // A teacher opening another teacher's class gets the API's 404, the same as an unknown code.
  const item = await fetchClass(code);
  const isAdmin = ADMIN_ROLES.some((role) => me.roles.includes(role));
  const editable = isAdmin && item.status !== 'COMPLETED' && item.status !== 'CANCELLED';
  // Only active teachers with a profile can be assigned (the API checks it too).
  const candidates = editable
    ? (await fetchTeachers())
        .filter((teacher) => teacher.teacherCode && teacher.status === 'ACTIVE' && !item.teachers.some(({ userId }) => userId === teacher.userId))
        .map((teacher) => ({ userId: teacher.userId, label: `${teacher.fullName} (${teacher.teacherCode})` }))
    : undefined;
  const open = item.status !== 'COMPLETED' && item.status !== 'CANCELLED';
  const managesStudents = open && STUDENT_MANAGER_ROLES.some((role) => me.roles.includes(role));
  const enrollments = await fetchEnrollments(item.id);
  // Anyone already on the list (a removed student comes back with "Khôi phục") is left out.
  const studentCandidates = managesStudents
    ? (await fetchStudents()).flatMap(({ userId, studentCode, fullName, status }) =>
        studentCode && status === 'ACTIVE' && !enrollments.some((enrollment) => enrollment.studentId === userId) ? [{ userId, studentCode, fullName }] : [],
      )
    : undefined;

  return (
    <>
      <Link href="/lop-hoc" className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← Lớp học
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-2xl font-bold">{item.name}</h1>
        <Badge tone={CLASS_STATUS_TONES[item.status]}>{CLASS_STATUS_LABELS[item.status]}</Badge>
      </div>
      <p className="mt-1 mb-6 text-muted">
        {item.code} ·{' '}
        <Link href={`/chuong-trinh/${item.course.slug}`} className={`rounded text-primary underline ${FOCUS}`}>
          {item.course.title}
        </Link>
      </p>

      <section aria-label="Thông tin lớp" className={`${CARD} mb-6`}>
        <dl className="m-0 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Sĩ số</dt>
            <dd className="m-0">{formatCapacity(item)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Thời gian</dt>
            <dd className="m-0">{formatDateRange(item)}</dd>
          </div>
        </dl>
        {isAdmin && item.nextStatuses.length > 0 && (
          <div className="mt-4 border-0 border-t border-solid border-border pt-4">
            <StatusButtons
              id={item.id}
              classLabel={item.name}
              options={item.nextStatuses.map((status) => ({ status, label: STATUS_ACTION_LABELS[status] }))}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="teachers-heading" className={`${CARD} mb-6`}>
        <h2 id="teachers-heading" className="m-0 mb-4 text-lg font-semibold">
          Giáo viên
        </h2>
        <ClassTeachers
          classId={item.id}
          teachers={item.teachers.map((teacher) => ({ ...teacher, roleLabel: TEACHER_ROLE_LABELS[teacher.role] }))}
          candidates={candidates}
        />
      </section>

      <section aria-labelledby="schedule-heading" className={`${CARD} mb-6`}>
        <h2 id="schedule-heading" className="m-0 mb-4 text-lg font-semibold">
          Lịch học{' '}
          {item.sessions.length > 0 && <span className="text-base font-normal text-muted">{item.sessions.filter((session) => session.number !== null).length} buổi</span>}
        </h2>
        <ClassSchedule
          classId={item.id}
          canEdit={editable}
          canDayOff={open && (isAdmin || item.teachers.some((teacher) => teacher.userId === me.id))}
          totalParts={item.totalParts}
          missingSessions={item.missingSessions}
          sessions={item.sessions.map((session) => {
            const start = vietnamDateTime(session.startsAt);
            return {
              id: session.id,
              label: session.number === null ? 'Đã huỷ' : `Buổi ${session.number}`,
              when: formatSessionTime(session.startsAt, session.endsAt),
              lesson: session.lesson && {
                href: `/chuong-trinh/${item.course.slug}/bai/${session.lesson.id}`,
                text: `${session.lesson.title} · phần ${session.lesson.partNumber}/${session.lesson.partCount}`,
              },
              attendanceHref: session.status === 'CANCELLED' ? null : `/lop-hoc/${item.code}/buoi/${session.id}`,
              statusLabel: SESSION_STATUS_LABELS[session.status],
              statusTone: SESSION_STATUS_TONES[session.status],
              scheduled: session.status === 'SCHEDULED',
              date: start.date,
              startTime: start.time,
              endTime: vietnamDateTime(session.endsAt).time,
            };
          })}
        />
      </section>

      <section aria-labelledby="students-heading" className={`${CARD} mb-6`}>
        <h2 id="students-heading" className="m-0 mb-4 text-lg font-semibold">
          Học sinh <span className="text-base font-normal text-muted">{formatCapacity(item)}</span>
        </h2>
        <ClassStudents
          classId={item.id}
          rows={enrollments.map((enrollment) => ({
            id: enrollment.id,
            studentCode: enrollment.studentCode,
            fullName: enrollment.fullName,
            statusLabel: ENROLLMENT_STATUS_LABELS[enrollment.status],
            statusTone: ENROLLMENT_STATUS_TONES[enrollment.status],
            // The calendar day in Vietnam, where every class takes place.
            enrolledOn: formatDay(new Date(enrollment.enrolledAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })),
            actions: enrollment.nextStatuses.map((status) => ({ status, label: ENROLLMENT_ACTION_LABELS[status] })),
          }))}
          candidates={studentCandidates}
        />
      </section>

      {editable && (
        <section aria-labelledby="edit-heading" className={CARD}>
          <h2 id="edit-heading" className="m-0 mb-4 text-lg font-semibold">
            Sửa lớp
          </h2>
          <ClassForm
            mode="edit"
            id={item.id}
            initial={{ name: item.name, startDate: item.startDate ?? '', endDate: item.endDate ?? '', capacity: item.capacity === null ? '' : String(item.capacity) }}
          />
        </section>
      )}
    </>
  );
}
