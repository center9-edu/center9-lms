import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CURRICULUM_AUTHOR_ROLES, CURRICULUM_READ_ROLES, requireUser } from '../../../../../lib/session';
import { Badge } from '../../../../../ui/badge';
import { CARD, FOCUS } from '../../../../../ui/styles';
import { LessonFileBlocks } from '../../../../lesson-file-blocks';
import { fetchCourse } from '../../../courses';

export const metadata: Metadata = {
  title: 'Bài học | Center9Edu LMS',
};

/** One lesson and its files, each in its own numbered block: a PDF reads in the page, a Word file downloads. */
export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const me = await requireUser(CURRICULUM_READ_ROLES);
  const { slug, lessonId } = await params;
  // The course already carries its tree with every lesson's files, so no lesson endpoint is needed.
  const course = await fetchCourse(slug);
  const chapterIndex = course.chapters.findIndex((chapter) => chapter.lessons.some(({ id }) => id === lessonId));
  const chapter = course.chapters[chapterIndex];
  const lesson = chapter?.lessons.find(({ id }) => id === lessonId);
  if (!chapter || !lesson) {
    notFound();
  }
  const canEdit = !course.archivedAt && CURRICULUM_AUTHOR_ROLES.some((role) => me.roles.includes(role));

  return (
    <>
      <Link href={`/chuong-trinh/${course.slug}`} className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← {course.title}
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge tone="primary">Chương {chapterIndex + 1}</Badge>
        <span>{chapter.title}</span>
        <span aria-hidden="true">·</span>
        <span>{lesson.partCount} phần</span>
      </div>
      <h1 className="mt-2 mb-6 text-2xl font-bold">{lesson.title}</h1>

      {lesson.files.length === 0 ? (
        <section className={CARD}>
          <p className="m-0 text-muted">Bài này chưa có tài liệu.</p>
          {canEdit && (
            <Link href={`/chuong-trinh/${course.slug}`} className={`mt-2 inline-block rounded text-primary underline ${FOCUS}`}>
              Thêm tài liệu ở trang khoá học
            </Link>
          )}
        </section>
      ) : (
        <LessonFileBlocks files={lesson.files} />
      )}
    </>
  );
}
