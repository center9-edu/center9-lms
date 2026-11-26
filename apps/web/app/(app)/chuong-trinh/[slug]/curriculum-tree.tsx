'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { DANGER_OUTLINE_BUTTON, ERROR_ALERT, FOCUS, INPUT, LABEL, SMALL_BUTTON } from '../../../ui/styles';
import type { CourseDetail } from '../courses';
import { changeCurriculum } from './actions';
import { LessonFileList, UploadLessonFile } from './lesson-files';

interface Props {
  course: CourseDetail;
  canEdit: boolean;
}

const ICON_BUTTON = `cursor-pointer rounded-lg border border-solid border-border bg-white px-3 py-2 font-[inherit] text-sm disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;
const ROW_INPUT = `${INPUT} min-w-40 flex-1 py-2`;
const PART_INPUT = `${INPUT} w-20 py-2`;
const LINK = `rounded text-primary underline ${FOCUS}`;

/** `ids` with the item at `index` moved one place up (-1) or down (1), as the API's order body. */
function moved(ids: string[], index: number, delta: -1 | 1): string {
  const next = [...ids];
  next.splice(index + delta, 0, ...next.splice(index, 1));
  return next.join(',');
}

function confirmFirst(message: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  };
}

export function CurriculumTree({ course, canEdit }: Props) {
  const [state, action, pending] = useActionState(changeCurriculum, undefined);
  const chapterIds = course.chapters.map(({ id }) => id);
  const lessonHref = (lessonId: string) => `/chuong-trinh/${course.slug}/bai/${lessonId}`;

  const message = state && (
    <p role="alert" className={ERROR_ALERT}>
      {state.message}
    </p>
  );

  if (!canEdit) {
    return (
      <div className="grid gap-4">
        {course.chapters.length === 0 ? (
          <p className="m-0 text-muted">Khoá học này chưa có chương nào.</p>
        ) : (
          <ol className="m-0 grid gap-4 pl-5">
            {course.chapters.map((chapter) => (
              <li key={chapter.id}>
                <span className="font-semibold">{chapter.title}</span>
                {chapter.lessons.length === 0 ? (
                  <p className="m-0 text-sm text-muted">Chưa có bài học.</p>
                ) : (
                  <ol className="mt-1 grid gap-1 pl-5">
                    {chapter.lessons.map((lesson) => (
                      <li key={lesson.id} className="grid gap-1">
                        <span>
                          <Link href={lessonHref(lesson.id)} className={LINK}>
                            {lesson.title}
                          </Link>{' '}
                          <span className="text-sm text-muted">({lesson.partCount} phần)</span>
                        </span>
                        <LessonFileList files={lesson.files} />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  // Every form posts to the same action; `intent` names the change and the hidden fields carry the ids.
  const form = (intent: string, fields: Record<string, string>, children: ReactNode, confirm?: string, className = 'flex items-center gap-2') => (
    <form action={action} onSubmit={confirm ? confirmFirst(confirm) : undefined} className={className}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="courseId" value={course.id} />
      <input type="hidden" name="slug" value={course.slug} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );

  const moveButtons = (intent: string, fields: Record<string, string>, ids: string[], index: number, name: string) => (
    <>
      {form(
        intent,
        { ...fields, ids: index > 0 ? moved(ids, index, -1) : '' },
        <button type="submit" disabled={pending || index === 0} aria-label={`Chuyển "${name}" lên`} className={ICON_BUTTON}>
          ↑
        </button>,
      )}
      {form(
        intent,
        { ...fields, ids: index < ids.length - 1 ? moved(ids, index, 1) : '' },
        <button type="submit" disabled={pending || index === ids.length - 1} aria-label={`Chuyển "${name}" xuống`} className={ICON_BUTTON}>
          ↓
        </button>,
      )}
    </>
  );

  return (
    <div className="grid gap-6">
      {message}

      {course.chapters.length === 0 && <p className="m-0 text-muted">Chưa có chương nào. Thêm chương đầu tiên ở dưới.</p>}

      <ol className="m-0 grid list-none gap-6 p-0">
        {course.chapters.map((chapter, chapterIndex) => {
          const lessonIds = chapter.lessons.map(({ id }) => id);
          return (
            <li key={chapter.id} className="grid gap-3 rounded-lg border border-solid border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Chương {chapterIndex + 1}</span>
                {form(
                  'renameChapter',
                  { chapterId: chapter.id },
                  <>
                    <input
                      // A new key after a save shows the stored value, not what was typed.
                      key={chapter.title}
                      name="title"
                      required
                      maxLength={150}
                      defaultValue={chapter.title}
                      aria-label={`Tên chương ${chapterIndex + 1}`}
                      className={ROW_INPUT}
                    />
                    <button type="submit" disabled={pending} className={SMALL_BUTTON}>
                      Lưu
                    </button>
                  </>,
                  undefined,
                  'flex min-w-60 flex-1 items-center gap-2',
                )}
                {moveButtons('orderChapters', {}, chapterIds, chapterIndex, chapter.title)}
                {form(
                  'deleteChapter',
                  { chapterId: chapter.id },
                  <button type="submit" disabled={pending} className={DANGER_OUTLINE_BUTTON}>
                    Xoá chương
                  </button>,
                  `Xoá chương "${chapter.title}"? Chỉ xoá được chương chưa có bài học.`,
                )}
              </div>

              <ol className="m-0 grid list-none gap-2 p-0 sm:pl-6">
                {chapter.lessons.map((lesson, lessonIndex) => (
                  <li key={lesson.id} className="grid gap-2 border-0 border-b border-solid border-border pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {form(
                        'updateLesson',
                        { lessonId: lesson.id },
                        <>
                          <input
                            key={lesson.title}
                            name="title"
                            required
                            maxLength={150}
                            defaultValue={lesson.title}
                            aria-label={`Tên bài ${lessonIndex + 1} của chương ${chapterIndex + 1}`}
                            className={ROW_INPUT}
                          />
                          <input
                            key={lesson.partCount}
                            name="partCount"
                            type="number"
                            required
                            min={1}
                            max={50}
                            defaultValue={lesson.partCount}
                            aria-label={`Số phần của bài "${lesson.title}"`}
                            className={PART_INPUT}
                          />
                          <span className="text-sm text-muted">phần</span>
                          <button type="submit" disabled={pending} className={SMALL_BUTTON}>
                            Lưu
                          </button>
                        </>,
                        undefined,
                        'flex min-w-60 flex-1 flex-wrap items-center gap-2',
                      )}
                      <Link href={lessonHref(lesson.id)} aria-label={`Xem bài "${lesson.title}"`} className={`text-sm ${LINK}`}>
                        Xem bài
                      </Link>
                      {moveButtons('orderLessons', { chapterId: chapter.id }, lessonIds, lessonIndex, lesson.title)}
                      {form(
                        'deleteLesson',
                        { lessonId: lesson.id },
                        <button type="submit" disabled={pending} className={DANGER_OUTLINE_BUTTON}>
                          Xoá bài
                        </button>,
                        `Xoá bài "${lesson.title}"? Mọi lớp của khoá học sẽ không còn bài này.`,
                      )}
                    </div>
                    <LessonFileList
                      files={lesson.files}
                      deleteButton={(file) =>
                        form(
                          'deleteFile',
                          { fileId: file.id },
                          <button type="submit" disabled={pending} aria-label={`Xoá file "${file.fileName}"`} className={DANGER_OUTLINE_BUTTON}>
                            Xoá file
                          </button>,
                          `Xoá file "${file.fileName}"?`,
                        )
                      }
                    />
                    {lesson.files.length < 10 && <UploadLessonFile lessonId={lesson.id} lessonTitle={lesson.title} />}
                  </li>
                ))}
              </ol>

              {form(
                'addLesson',
                { chapterId: chapter.id },
                <>
                  <label className="grid min-w-48 flex-1 gap-1">
                    <span className="text-sm">Bài mới</span>
                    <input name="title" required maxLength={150} className={`${INPUT} py-2`} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm">Số phần</span>
                    <input name="partCount" type="number" required min={1} max={50} defaultValue={1} className={PART_INPUT} />
                  </label>
                  <button type="submit" disabled={pending} className={SMALL_BUTTON}>
                    Thêm bài
                  </button>
                </>,
                undefined,
                'flex flex-wrap items-end gap-2 sm:pl-6',
              )}
            </li>
          );
        })}
      </ol>

      {form(
        'addChapter',
        {},
        <>
          <label className="grid min-w-48 flex-1 gap-1.5">
            <span className={LABEL}>Chương mới</span>
            <input name="title" required maxLength={150} className={INPUT} />
          </label>
          <button type="submit" disabled={pending} className={SMALL_BUTTON}>
            Thêm chương
          </button>
        </>,
        undefined,
        'flex max-w-lg flex-wrap items-end gap-2',
      )}
    </div>
  );
}
