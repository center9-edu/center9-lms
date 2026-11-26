import Link from 'next/link';
import { lessonOpenDay } from '../../lib/lesson-schedule';
import { formatSessionTime } from '../../lib/vietnam-time';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icons';
import { CARD, FOCUS } from '../../ui/styles';
import { ATTENDANCE_OPTIONS, CLASS_STATUS_LABELS, CLASS_STATUS_TONES, formatDateRange, TEACHER_ROLE_LABELS } from './classes';
import type { LearnerClass, LearnerClassDetail } from './learner';

const teacherLine = (item: LearnerClass) =>
  item.teachers.length === 0 ? 'Chưa phân công' : item.teachers.map((teacher) => `${teacher.fullName} (${TEACHER_ROLE_LABELS[teacher.role]})`).join(', ');

/** A student's (or a parent's children's) classes. */
export function LearnerClassList({ classes, isParent }: { classes: LearnerClass[]; isParent: boolean }) {
  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Lớp học</h1>
      <p className="mt-1 mb-6 text-muted">{isParent ? 'Các lớp con bạn đang học.' : 'Các lớp bạn đang học.'}</p>
      {classes.length === 0 ? (
        <p className="m-0 text-muted">{isParent ? 'Con bạn chưa có lớp nào.' : 'Bạn chưa có lớp nào.'}</p>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {classes.map((item) => (
            <li key={item.code}>
              <Link href={`/lop-hoc/${item.code}`} className={`${CARD} grid h-full content-start gap-3 text-foreground no-underline hover:border-primary ${FOCUS}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="m-0 text-lg font-semibold text-primary">{item.name}</h2>
                    <p className="m-0 text-sm text-muted">{item.courseTitle}</p>
                  </div>
                  <Badge tone={CLASS_STATUS_TONES[item.status]}>{CLASS_STATUS_LABELS[item.status]}</Badge>
                </div>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {isParent && (
                    <>
                      <dt className="text-muted">Học sinh</dt>
                      <dd className="m-0">{item.students.join(', ')}</dd>
                    </>
                  )}
                  <dt className="text-muted">Giáo viên</dt>
                  <dd className="m-0">{teacherLine(item)}</dd>
                  <dt className="text-muted">Thời gian</dt>
                  <dd className="m-0">{formatDateRange(item)}</dd>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The sessions of one class, in time order: an open lesson links to its page, a later one shows when it opens. */
export function LearnerClassView({ item, isParent }: { item: LearnerClassDetail; isParent: boolean }) {
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
        {item.courseTitle}
        {isParent && ` · Học sinh: ${item.students.join(', ')}`} · Giáo viên: {teacherLine(item)}
      </p>

      {item.attendance.some(({ marked }) => marked > 0) && (
        <section aria-labelledby="attendance-heading" className={`${CARD} mb-6`}>
          <h2 id="attendance-heading" className="m-0 mb-3 text-lg font-semibold">
            Chuyên cần
          </h2>
          <ul className="m-0 grid list-none gap-1 p-0">
            {item.attendance.map(({ student, attended, marked }) => (
              <li key={student}>
                {isParent && <span className="font-medium">{student}: </span>}
                có mặt {attended}/{marked} buổi đã điểm danh
                {marked > 0 && <span className="text-muted"> ({Math.round((attended / marked) * 100)}%, tính cả đi muộn)</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="sessions-heading" className={CARD}>
        <h2 id="sessions-heading" className="m-0 mb-1 text-lg font-semibold">
          Buổi học
        </h2>
        <p className="mt-0 mb-4 text-sm text-muted">Bài giảng của mỗi bài mở từ ngày học buổi đầu tiên của bài đó.</p>
        {item.sessions.length === 0 ? (
          <p className="m-0 text-muted">Lớp chưa có lịch học.</p>
        ) : (
          <ol className="m-0 grid list-none gap-2 p-0">
            {item.sessions.map((session, index) => {
              const lesson = session.lesson;
              const opensOn = lesson && !lesson.unlocked ? lessonOpenDay(item.sessions, lesson.id) : null;
              return (
                <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-0 border-b border-solid border-border pb-2">
                  <span className="min-w-16 font-semibold">{session.number === null ? 'Đã huỷ' : `Buổi ${session.number}`}</span>
                  <span className={`text-sm ${session.number === null ? 'text-muted line-through' : ''}`}>{formatSessionTime(session.startsAt, session.endsAt)}</span>
                  {session.attendance.map(({ student, status }) => {
                    const mark = ATTENDANCE_OPTIONS.find(({ value }) => value === status);
                    return (
                      mark && (
                        <Badge key={student} tone={mark.tone}>
                          {isParent ? `${student}: ${mark.label}` : mark.label}
                        </Badge>
                      )
                    );
                  })}
                  {lesson && (
                    <span className="flex flex-wrap items-center gap-2 text-sm sm:ml-auto">
                      <span>
                        {lesson.title} · phần {lesson.partNumber}/{lesson.partCount}
                      </span>
                      {lesson.unlocked ? (
                        <Link
                          href={`/lop-hoc/${item.code}/bai/${lesson.id}`}
                          aria-label={`Xem bài ${lesson.title}`}
                          className={`rounded font-semibold text-primary underline ${FOCUS}`}
                        >
                          Xem bài
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <Icon name="lock" className="size-4" />
                          {opensOn ? `Mở ngày ${opensOn}` : 'Chưa mở'}
                        </span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
