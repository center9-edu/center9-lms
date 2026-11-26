import type { Metadata } from 'next';
import Link from 'next/link';
import { CURRICULUM_AUTHOR_ROLES, CURRICULUM_READ_ROLES, requireUser } from '../../../lib/session';
import { Badge } from '../../../ui/badge';
import { CARD, FOCUS } from '../../../ui/styles';
import { fetchCourse } from '../courses';
import { levelLabel, subjectLabel } from '../course-options';
import { CourseForm } from './course-form';
import { CurriculumTree } from './curriculum-tree';

export const metadata: Metadata = {
  title: 'Khoá học | Center9Edu LMS',
};

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await requireUser(CURRICULUM_READ_ROLES);
  const { slug } = await params;
  const course = await fetchCourse(slug);
  const canEdit = !course.archivedAt && CURRICULUM_AUTHOR_ROLES.some((role) => me.roles.includes(role));

  return (
    <>
      <Link href="/chuong-trinh" className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← Chương trình học
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-2xl font-bold">{course.title}</h1>
        <Badge tone="primary">{levelLabel(course.level)}</Badge>
        <span className="text-sm text-muted">{subjectLabel(course.subject)}</span>
        {course.archivedAt && <Badge>Đã lưu trữ</Badge>}
      </div>
      {course.description && <p className="mt-1 mb-0 whitespace-pre-line text-muted">{course.description}</p>}

      <section aria-labelledby="curriculum-heading" className={`${CARD} mt-6`}>
        <h2 id="curriculum-heading" className="m-0 text-lg font-semibold">
          Chương và bài học
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          {canEdit ? 'Mọi lớp của khoá học học theo chương trình này; thay đổi áp dụng ngay cho tất cả các lớp.' : 'Mọi lớp của khoá học học theo chương trình này.'}
        </p>
        <CurriculumTree course={course} canEdit={canEdit} />
      </section>

      {canEdit && (
        <section aria-labelledby="edit-heading" className={`${CARD} mt-6`}>
          <h2 id="edit-heading" className="m-0 mb-4 text-lg font-semibold">
            Sửa khoá học
          </h2>
          <CourseForm id={course.id} initial={{ title: course.title, description: course.description ?? '', subject: course.subject, level: course.level, slug: course.slug }} />
        </section>
      )}
    </>
  );
}
