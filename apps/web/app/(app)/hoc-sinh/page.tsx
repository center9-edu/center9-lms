import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser, STUDENT_MANAGER_ROLES } from '../../lib/session';
import { CARD, FOCUS } from '../../ui/styles';
import { STATUS_LABELS } from '../quan-tri/tai-khoan/users';
import { fetchStudents } from './students';

export const metadata: Metadata = {
  title: 'Học sinh | Center9Edu LMS',
};

const CELL = 'border-0 border-b border-solid border-border px-3 py-2.5 text-left align-top whitespace-nowrap';

export default async function StudentsPage() {
  await requireUser(STUDENT_MANAGER_ROLES);
  const students = await fetchStudents();

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Học sinh</h1>
      <p className="mt-1 mb-6 text-muted">
        Hồ sơ của các tài khoản có vai trò Học sinh. Muốn thêm học sinh mới, hãy nhờ quản trị viên tạo tài khoản trước.
      </p>

      <section aria-labelledby="list-heading" className={CARD}>
        <h2 id="list-heading" className="m-0 mb-4 text-lg font-semibold">
          Danh sách ({students.length})
        </h2>
        {students.length === 0 ? (
          <p className="m-0 text-muted">Chưa có tài khoản học sinh nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Mã học sinh', 'Họ và tên', 'Tên đăng nhập', 'Trường'].map((heading) => (
                    <th key={heading} scope="col" className={`${CELL} font-semibold text-muted`}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.userId}>
                    <td className={CELL}>{student.studentCode ?? <span className="text-muted">Chưa có hồ sơ</span>}</td>
                    <td className={CELL}>
                      <Link href={`/hoc-sinh/${student.userId}`} className={`rounded font-medium text-primary underline ${FOCUS}`}>
                        {student.fullName}
                      </Link>
                      {student.status !== 'ACTIVE' && <span className="ml-2 text-xs text-muted">({STATUS_LABELS[student.status]})</span>}
                    </td>
                    <td className={CELL}>{student.username}</td>
                    <td className={`${CELL} whitespace-normal`}>{student.schoolName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
