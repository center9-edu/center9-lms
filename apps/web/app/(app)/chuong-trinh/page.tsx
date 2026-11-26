import type { Metadata } from 'next';
import Link from 'next/link';
import { colorIndex } from '../../lib/names';
import { matchesSearch } from '../../lib/search';
import { CURRICULUM_AUTHOR_ROLES, CURRICULUM_READ_ROLES, requireUser } from '../../lib/session';
import { Badge } from '../../ui/badge';
import { Icon } from '../../ui/icons';
import { CARD, FOCUS, INPUT, SMALL_BUTTON } from '../../ui/styles';
import type { CourseSummary } from './courses';
import { fetchCourses } from './courses';
import { CreateCourseForm } from './create-course-form';
import { COURSE_LEVELS, COURSE_SUBJECTS, levelLabel, subjectLabel } from './course-options';

export const metadata: Metadata = {
  title: 'Chương trình học | Center9Edu LMS',
};

// A cover per course without uploading pictures: a gradient picked from the slug, so it never changes.
const COVERS = [
  'from-primary to-[#6d28d9]',
  'from-[#0f766e] to-success',
  'from-warning to-danger',
  'from-[#6d28d9] to-danger',
  'from-success to-primary',
];

/** The query value if it is one of `options`, else '' (no filter): a hand-edited URL cannot break the page. */
const pick = (options: readonly { value: string }[], value: string | string[] | undefined) =>
  typeof value === 'string' && options.some((option) => option.value === value) ? value : '';

function CourseCard({ course }: { course: CourseSummary }) {
  return (
    <li>
      <Link
        href={`/chuong-trinh/${course.slug}`}
        className={`group block h-full overflow-hidden rounded-2xl border border-solid border-border bg-white text-foreground no-underline shadow-card transition-shadow hover:shadow-md ${FOCUS}`}
      >
        <div aria-hidden="true" className={`grid h-28 place-items-center bg-linear-to-br text-white ${COVERS[colorIndex(course.slug, COVERS.length)]}`}>
          <Icon name="book" className="size-10 opacity-90" />
        </div>
        <div className="grid gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{levelLabel(course.level)}</Badge>
            <span className="text-sm text-muted">{subjectLabel(course.subject)}</span>
            {course.archived && <Badge>Đã lưu trữ</Badge>}
          </div>
          <h3 className="m-0 text-base font-bold group-hover:text-primary">{course.title}</h3>
          {course.description && <p className="m-0 line-clamp-2 text-sm text-muted">{course.description}</p>}
        </div>
      </Link>
    </li>
  );
}

/** Course cards grouped by subject ("Nhóm"); search and filters are a GET form, so the URL keeps them and no JS is needed. */
export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser(CURRICULUM_READ_ROLES);
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const subject = pick(COURSE_SUBJECTS, params.nhom);
  const level = pick(COURSE_LEVELS, params['trinh-do']);
  // ponytail: filtered here; the API lists up to 1,000 courses, plenty for one center.
  const courses = (await fetchCourses()).filter(
    (course) =>
      (!subject || course.subject === subject) &&
      (!level || course.level === level) &&
      matchesSearch([course.title, course.description, subjectLabel(course.subject)], query),
  );
  const groups = COURSE_SUBJECTS.map(({ value, label }) => ({ value, label, courses: courses.filter((course) => course.subject === value) })).filter(
    (group) => group.courses.length > 0,
  );
  const canAuthor = CURRICULUM_AUTHOR_ROLES.some((role) => me.roles.includes(role));
  const filtered = query !== '' || subject !== '' || level !== '';

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Chương trình học</h1>
      <p className="mt-1 mb-6 text-muted">Các khoá học cùng chương và bài học; mọi lớp của một khoá học học chung một chương trình.</p>

      <form method="get" role="search" aria-label="Tìm khoá học" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="grid min-w-60 flex-1 gap-1.5">
          <span className="text-sm font-semibold">Tìm khoá học</span>
          <input type="search" name="q" defaultValue={query} placeholder="Tên hoặc mô tả, gõ có dấu hay không dấu đều được" className={INPUT} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Nhóm</span>
          <select name="nhom" defaultValue={subject} className={INPUT}>
            <option value="">Tất cả</option>
            {COURSE_SUBJECTS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Trình độ</span>
          <select name="trinh-do" defaultValue={level} className={INPUT}>
            <option value="">Tất cả</option>
            {COURSE_LEVELS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={SMALL_BUTTON}>
          Lọc
        </button>
        {filtered && (
          <Link href="/chuong-trinh" className={`self-center rounded text-sm text-primary underline ${FOCUS}`}>
            Xoá bộ lọc
          </Link>
        )}
      </form>

      {groups.length === 0 ? (
        <section className={CARD}>
          <p className="m-0 text-muted">{filtered ? 'Không có khoá học nào khớp bộ lọc.' : 'Chưa có khoá học nào.'}</p>
          {filtered && (
            <Link href="/chuong-trinh" className={`mt-2 inline-block rounded text-primary underline ${FOCUS}`}>
              Xoá bộ lọc
            </Link>
          )}
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.value} aria-labelledby={`subject-${group.value}`} className="mb-8">
            <h2 id={`subject-${group.value}`} className="m-0 mb-3 text-lg font-bold">
              {group.label} <span className="text-base font-normal text-muted">{group.courses.length}</span>
            </h2>
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {group.courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </ul>
          </section>
        ))
      )}

      {canAuthor && (
        <section aria-labelledby="create-heading" className={CARD}>
          <h2 id="create-heading" className="m-0 mb-4 text-lg font-semibold">
            Tạo khoá học
          </h2>
          <CreateCourseForm />
        </section>
      )}
    </>
  );
}
