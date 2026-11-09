import Link from 'next/link';
import { API_URL } from '../lib/api';
import { attendanceOf, CLASS_ROLES, classesOf, classesTaughtBy, DEMO_CHILDREN, demoClasses, nextSession, upcomingSessions } from '../lib/demo-data';
import { ADMIN_ROLES, requireUser } from '../lib/session';
import type { Role } from '../lib/session';
import { FOCUS } from '../ui/styles';
import { AttendanceRate, ClassStatusCounts, UpcomingList, Widget } from './dashboard-widgets';
import { fetchUsers } from './quan-tri/tai-khoan/users';

export const dynamic = 'force-dynamic';

async function isApiReady(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const SHORTCUTS: { href: string; title: string; description: string; roles?: Role[] }[] = [
  { href: '/lop-hoc', title: 'Lớp học', description: 'Danh sách lớp, buổi học và điểm danh (demo).', roles: CLASS_ROLES },
  {
    href: '/quan-tri/tai-khoan',
    title: 'Quản lý tài khoản',
    description: 'Tạo tài khoản, gán vai trò, đặt lại mật khẩu.',
    roles: ADMIN_ROLES,
  },
  { href: '/luyen-tap', title: 'Luyện tập Python', description: 'Viết code và xem kết quả ngay trên trình duyệt.' },
  { href: '/doi-mat-khau', title: 'Đổi mật khẩu', description: 'Cập nhật mật khẩu đăng nhập của bạn.' },
];

const dateFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

const SMALL_LINK = `justify-self-start rounded text-sm text-primary underline ${FOCUS}`;

export default async function HomePage() {
  const me = await requireUser();
  const has = (role: Role) => me.roles.includes(role);
  const isAdmin = me.roles.some((role) => ADMIN_ROLES.includes(role));
  const shortcuts = SHORTCUTS.filter((item) => !item.roles || item.roles.some((role) => me.roles.includes(role)));
  const [ready, users] = isAdmin ? await Promise.all([isApiReady(), fetchUsers()]) : [false, []];
  const children = has('PARENT') ? (DEMO_CHILDREN[me.username] ?? []) : [];
  const allClasses = demoClasses();

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Xin chào, {me.fullName}</h1>
      <p className="mt-1 mb-6 text-muted">Đây là tổng quan của bạn hôm nay.</p>

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isAdmin && (
          <>
            <Widget title="Trạng thái hệ thống">
              <p className={`m-0 font-medium ${ready ? 'text-success' : 'text-danger'}`}>
                {ready ? 'API và database sẵn sàng' : 'Không kết nối được API hoặc database'}
              </p>
            </Widget>
            <Widget title="Tài khoản">
              <p className="m-0">
                <span className="text-3xl font-bold">{users.length}</span> <span className="text-sm text-muted">tài khoản</span>
              </p>
              <Link href="/quan-tri/tai-khoan" className={SMALL_LINK}>
                Quản lý tài khoản
              </Link>
            </Widget>
            <Widget title="Lớp học" demo>
              <ClassStatusCounts classes={allClasses} />
              <Link href="/lop-hoc" className={SMALL_LINK}>
                Xem tất cả lớp
              </Link>
            </Widget>
          </>
        )}

        {has('SALES') && (
          <Widget title="Lớp sắp khai giảng" demo>
            <ul className="m-0 grid list-none gap-2 p-0">
              {allClasses.filter((demoClass) => demoClass.status === 'OPEN').map((demoClass) => {
                const first = nextSession(demoClass);
                return (
                  <li key={demoClass.code}>
                    <Link href={`/lop-hoc/${demoClass.code}`} className={`rounded font-medium text-foreground underline ${FOCUS}`}>
                      {demoClass.name}
                    </Link>
                    <p className="m-0 text-sm text-muted">
                      Còn {demoClass.capacity - demoClass.students.length}/{demoClass.capacity} chỗ
                      {first && ` · khai giảng ${dateFormat.format(first.startsAt)}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Widget>
        )}

        {has('TEACHER') && (
          <Widget title="Lịch dạy sắp tới" demo>
            <UpcomingList items={upcomingSessions(classesTaughtBy(me.username), 4)} linkToClass empty="Không có buổi dạy nào sắp tới." />
          </Widget>
        )}

        {has('STUDENT') && (
          <>
            <Widget title="Lịch học sắp tới" demo>
              <UpcomingList items={upcomingSessions(classesOf(me.username), 4)} linkToClass={false} empty="Không có buổi học nào sắp tới." />
            </Widget>
            <Widget title="Chuyên cần" demo>
              <AttendanceRate {...attendanceOf(me.username)} />
            </Widget>
          </>
        )}

        {children.map((child) => (
          <Widget key={child.username} title={`Con: ${child.fullName}`} demo>
            <AttendanceRate {...attendanceOf(child.username)} who="Chuyên cần" />
            <h3 className="m-0 mt-2 text-sm font-semibold">Lịch học sắp tới</h3>
            <UpcomingList items={upcomingSessions(classesOf(child.username), 3)} linkToClass={false} empty="Không có buổi học nào sắp tới." />
          </Widget>
        ))}
      </div>

      <h2 className="m-0 mb-3 text-lg font-semibold">Lối tắt</h2>
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`box-border block h-full rounded-xl border border-solid border-border bg-white p-5 text-foreground no-underline hover:border-primary ${FOCUS}`}
            >
              <span className="block font-semibold text-primary">{item.title}</span>
              <span className="mt-1 block text-sm text-muted">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
