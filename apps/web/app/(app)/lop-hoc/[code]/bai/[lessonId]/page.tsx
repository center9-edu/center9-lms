import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CLASS_ROLES, isStaff, LEARNER_ROLES, requireUser } from '../../../../../lib/session';
import { CARD, FOCUS } from '../../../../../ui/styles';
import { PDF_TYPE } from '../../../../chuong-trinh/file-types';
import { LessonFileBlocks } from '../../../../lesson-file-blocks';
import { fetchClass } from '../../../classes';
import { fetchLearnerClass } from '../../../learner';

export const metadata: Metadata = {
  title: 'Bài học | Center9Edu LMS',
};

/**
 * A lesson's lecture (PDFs) for a student or parent, once the lesson is open in their class. A locked or unknown
 * lesson is the same 404; the API checks again when a file is opened.
 */
export default async function LearnerLessonPage({ params }: { params: Promise<{ code: string; lessonId: string }> }) {
  const me = await requireUser([...CLASS_ROLES, ...LEARNER_ROLES]);
  const { code, lessonId } = await params;
  if (isStaff(me)) {
    // Staff read every lesson on the curriculum page, Word files included.
    redirect(`/chuong-trinh/${(await fetchClass(code)).course.slug}/bai/${encodeURIComponent(lessonId)}`);
  }
  const item = await fetchLearnerClass(code);
  const lesson = item.openLessons.find(({ id }) => id === lessonId);
  if (!lesson) {
    notFound();
  }
  const parts = item.sessions.flatMap((session) => (session.lesson?.id === lessonId && session.number !== null ? [session.number] : []));

  return (
    <>
      <Link href={`/lop-hoc/${item.code}`} className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← {item.name}
      </Link>
      <p className="mt-3 mb-0 text-sm text-muted">
        {item.courseTitle}
        {parts.length > 0 && ` · Buổi ${parts.join(', ')}`}
      </p>
      <h1 className="mt-1 mb-6 text-2xl font-bold">{lesson.title}</h1>
      {lesson.files.length === 0 ? (
        <section className={CARD}>
          <p className="m-0 text-muted">Bài này chưa có bài giảng. Giáo viên sẽ bổ sung sau.</p>
        </section>
      ) : (
        <LessonFileBlocks files={lesson.files.map((file) => ({ ...file, mimeType: PDF_TYPE }))} />
      )}
    </>
  );
}
