import type { Metadata } from 'next';
import { CLASS_ROLES, CLASS_STATUS_LABELS, CLASS_STATUS_TONES, classesFor, nextSession, seesAllClasses } from '../../lib/demo-data';
import { requireUser } from '../../lib/session';
import { Badge } from '../../ui/badge';
import { DemoBanner } from '../../ui/demo-banner';
import { CARD } from '../../ui/styles';

export const metadata: Metadata = {
  title: 'Lớp học | Center9Edu LMS',
};

const sessionFormat = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export default async function ClassesPage() {
  const me = await requireUser(CLASS_ROLES);
  const classes = classesFor(me);

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Lớp học</h1>
      <p className="mt-1 mb-4 text-muted">
        {seesAllClasses(me) ? 'Tất cả lớp của trung tâm.' : 'Các lớp bạn đang phụ trách.'}
      </p>
      <DemoBanner />

      {classes.length === 0 ? (
        <p className="m-0 text-muted">Bạn chưa được phân công lớp nào.</p>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {classes.map((demoClass) => {
            const next = nextSession(demoClass);
            return (
              <li key={demoClass.code} className={`${CARD} grid content-start gap-3`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="m-0 text-lg font-semibold">{demoClass.name}</h2>
                    <p className="m-0 text-sm text-muted">
                      {demoClass.code} · {demoClass.course}
                    </p>
                  </div>
                  <Badge tone={CLASS_STATUS_TONES[demoClass.status]}>{CLASS_STATUS_LABELS[demoClass.status]}</Badge>
                </div>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">Sĩ số</dt>
                  <dd className="m-0">
                    {demoClass.students.length}/{demoClass.capacity} học sinh
                  </dd>
                  <dt className="text-muted">Giáo viên</dt>
                  <dd className="m-0">{demoClass.teachers.map((teacher) => teacher.fullName).join(', ')}</dd>
                  <dt className="text-muted">Buổi tiếp theo</dt>
                  <dd className="m-0">{next ? `${next.title} · ${sessionFormat.format(next.startsAt)}` : 'Không còn buổi nào'}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
