import type { Metadata } from 'next';
import Link from 'next/link';
import { ADMIN_ROLES, CLASS_ROLES, isStaff, LEARNER_ROLES, requireUser } from '../../lib/session';
import { Badge } from '../../ui/badge';
import { CARD, FOCUS } from '../../ui/styles';
import { fetchCourses } from '../chuong-trinh/courses';
import { ClassForm } from './class-form';
import { CLASS_STATUS_LABELS, CLASS_STATUS_TONES, fetchClasses, formatCapacity, formatDateRange } from './classes';
import { fetchLearnerClasses } from './learner';
import { LearnerClassList } from './learner-views';

export const metadata: Metadata = {
  title: 'Lớp học | Center9Edu LMS',
};

export default async function ClassesPage() {
  const me = await requireUser([...CLASS_ROLES, ...LEARNER_ROLES]);
  if (!isStaff(me)) {
    return <LearnerClassList classes={await fetchLearnerClasses()} isParent={!me.roles.includes('STUDENT')} />;
  }
  const isAdmin = ADMIN_ROLES.some((role) => me.roles.includes(role));
  const [classes, courses] = await Promise.all([fetchClasses(), isAdmin ? fetchCourses() : []]);
  // The API already narrows the list: a user who is only a teacher gets the classes they teach.
  const teacherOnly = me.roles.every((role) => role === 'TEACHER');

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Lớp học</h1>
      <p className="mt-1 mb-6 text-muted">{teacherOnly ? 'Các lớp bạn đang phụ trách.' : 'Tất cả lớp của trung tâm.'}</p>

      {classes.length === 0 ? (
        <p className="m-0 mb-6 text-muted">{teacherOnly ? 'Bạn chưa được phân công lớp nào.' : isAdmin ? 'Chưa có lớp nào. Tạo lớp đầu tiên ở dưới.' : 'Chưa có lớp nào.'}</p>
      ) : (
        <ul className="m-0 mb-8 grid list-none gap-4 p-0 md:grid-cols-2">
          {classes.map((item) => (
            <li key={item.id}>
              <Link href={`/lop-hoc/${item.code}`} className={`${CARD} grid h-full content-start gap-3 text-foreground no-underline hover:border-primary ${FOCUS}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="m-0 text-lg font-semibold text-primary">{item.name}</h2>
                    <p className="m-0 text-sm text-muted">
                      {item.code} · {item.course.title}
                    </p>
                  </div>
                  <Badge tone={CLASS_STATUS_TONES[item.status]}>{CLASS_STATUS_LABELS[item.status]}</Badge>
                </div>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">Sĩ số</dt>
                  <dd className="m-0">{formatCapacity(item)}</dd>
                  <dt className="text-muted">Giáo viên</dt>
                  <dd className="m-0">{item.teachers.length === 0 ? 'Chưa phân công' : item.teachers.map((teacher) => teacher.fullName).join(', ')}</dd>
                  <dt className="text-muted">Thời gian</dt>
                  <dd className="m-0">{formatDateRange(item)}</dd>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <section aria-labelledby="create-heading" className={CARD}>
          <h2 id="create-heading" className="m-0 mb-4 text-lg font-semibold">
            Tạo lớp
          </h2>
          <ClassForm mode="create" courses={courses.filter((course) => !course.archived).map(({ id, title }) => ({ id, title }))} />
        </section>
      )}
    </>
  );
}
