import type { Metadata } from 'next';
import Link from 'next/link';
import { ADMIN_ROLES, requireUser } from '../../lib/session';
import { CARD, FOCUS } from '../../ui/styles';
import { STATUS_LABELS } from '../quan-tri/tai-khoan/users';
import { fetchTeachers } from './teachers';

export const metadata: Metadata = {
  title: 'Giáo viên | Center9Edu LMS',
};

const CELL = 'border-0 border-b border-solid border-border px-3 py-2.5 text-left align-top whitespace-nowrap';

export default async function TeachersPage() {
  await requireUser(ADMIN_ROLES);
  const teachers = await fetchTeachers();

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Giáo viên</h1>
      <p className="mt-1 mb-6 text-muted">Hồ sơ của các tài khoản có vai trò Giáo viên. Tạo tài khoản giáo viên ở trang Tài khoản.</p>

      <section aria-labelledby="list-heading" className={CARD}>
        <h2 id="list-heading" className="m-0 mb-4 text-lg font-semibold">
          Danh sách ({teachers.length})
        </h2>
        {teachers.length === 0 ? (
          <p className="m-0 text-muted">Chưa có tài khoản giáo viên nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Mã giáo viên', 'Họ và tên', 'Tên đăng nhập'].map((heading) => (
                    <th key={heading} scope="col" className={`${CELL} font-semibold text-muted`}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.userId}>
                    <td className={CELL}>{teacher.teacherCode ?? <span className="text-muted">Chưa có hồ sơ</span>}</td>
                    <td className={CELL}>
                      <Link href={`/giao-vien/${teacher.userId}`} className={`rounded font-medium text-primary underline ${FOCUS}`}>
                        {teacher.fullName}
                      </Link>
                      {teacher.status !== 'ACTIVE' && <span className="ml-2 text-xs text-muted">({STATUS_LABELS[teacher.status]})</span>}
                    </td>
                    <td className={CELL}>{teacher.username}</td>
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
