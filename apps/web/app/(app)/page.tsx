import Link from 'next/link';
import { API_URL } from '../lib/api';
import { attendanceOf, classesOf, classesTaughtBy, DEMO_CHILDREN, demoClasses, nextSession, upcomingSessions, vnDate } from '../lib/demo-data';
import type { DemoClass } from '../lib/demo-data';
import { greeting } from '../lib/greeting';
import { ADMIN_ROLES, CLASS_ROLES, requireUser } from '../lib/session';
import type { Role } from '../lib/session';
import { DemoBanner } from '../ui/demo-banner';
import { Icon } from '../ui/icons';
import type { IconName } from '../ui/icons';
import { StatChips } from '../ui/stat-chip';
import type { Stat } from '../ui/stat-chip';
import { FOCUS, OUTLINE_BUTTON } from '../ui/styles';
import { AttendanceRate, ClassStatusCounts, SessionRows, TodayTimeline, Widget } from './dashboard-widgets';
import { MiniCalendar } from './mini-calendar';
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

const SHORTCUTS: { href: string; title: string; description: string; icon: IconName; roles?: Role[] }[] = [
  { href: '/lop-hoc', title: 'Lớp học', description: 'Danh sách lớp, khoá học và trạng thái lớp.', icon: 'school', roles: CLASS_ROLES },
  { href: '/quan-tri/tai-khoan', title: 'Quản lý tài khoản', description: 'Tạo tài khoản, gán vai trò, đặt lại mật khẩu.', icon: 'shield', roles: ADMIN_ROLES },
  { href: '/luyen-tap', title: 'Luyện tập Python', description: 'Viết code và xem kết quả ngay trên trình duyệt.', icon: 'code' },
  { href: '/doi-mat-khau', title: 'Đổi mật khẩu', description: 'Cập nhật mật khẩu đăng nhập của bạn.', icon: 'key' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const longDate = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
const shortDate = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

export default async function HomePage() {
  const me = await requireUser();
  const now = new Date();
  const has = (role: Role) => me.roles.includes(role);
  const isAdmin = me.roles.some((role) => ADMIN_ROLES.includes(role));
  const shortcuts = SHORTCUTS.filter((item) => !item.roles || item.roles.some((role) => me.roles.includes(role)));
  const [ready, users] = isAdmin ? await Promise.all([isApiReady(), fetchUsers()]) : [false, []];
  const children = has('PARENT') ? (DEMO_CHILDREN[me.username] ?? []) : [];
  const allClasses = demoClasses(now);
  const openClasses = allClasses.filter((demoClass) => demoClass.status === 'OPEN');
  const taught = has('TEACHER') ? classesTaughtBy(me.username, now) : [];
  const studying = has('STUDENT') ? classesOf(me.username, now) : [];
  const attendance = attendanceOf(me.username, now);
  // Whose timetable the calendar shows: classes taught, attended, or attended by one's children.
  const scheduled = [...taught, ...studying, ...children.flatMap((child) => classesOf(child.username, now))];
  const today = vnDate(now);
  const todaySessions = upcomingSessions(scheduled, Infinity, now).filter(({ session }) => vnDate(session.startsAt) === today);
  const inNextWeek = (classes: DemoClass[]) =>
    upcomingSessions(classes, Infinity, now).filter(({ session }) => session.startsAt.getTime() < now.getTime() + 7 * DAY_MS).length;

  // Only figures the app already has: accounts and health from the API, the rest from demo-data (marked Demo).
  const stats: Stat[] = [];
  if (isAdmin) {
    stats.push(
      { icon: 'users', value: users.length, label: 'Tài khoản' },
      { icon: 'school', value: allClasses.filter((demoClass) => demoClass.status === 'IN_PROGRESS').length, label: 'Lớp đang học', tone: 'accent', demo: true },
      { icon: 'activity', value: ready ? 'Sẵn sàng' : 'Mất kết nối', label: 'API và database', tone: ready ? 'success' : 'danger' },
    );
  }
  if (has('TEACHER')) {
    stats.push(
      { icon: 'presentation', value: taught.length, label: 'Lớp đang dạy', demo: true },
      { icon: 'calendar', value: inNextWeek(taught), label: 'Buổi dạy 7 ngày tới', tone: 'accent', demo: true },
    );
  }
  if (has('SALES')) {
    stats.push({ icon: 'school', value: openClasses.length, label: 'Lớp mở đăng ký', tone: 'accent', demo: true });
  }
  if (has('STUDENT')) {
    stats.push(
      { icon: 'check-circle', value: attendance.total ? `${Math.round((attendance.attended / attendance.total) * 100)}%` : '—', label: 'Chuyên cần', tone: 'success', demo: true },
      { icon: 'calendar', value: inNextWeek(studying), label: 'Buổi học 7 ngày tới', tone: 'accent', demo: true },
    );
  }
  if (has('PARENT')) {
    stats.push({ icon: 'graduation', value: children.length, label: 'Con đang theo học', demo: true });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="m-0 text-sm font-medium text-muted first-letter:uppercase">{longDate.format(now)}</p>
          <h1 className="m-0 mt-1 text-2xl font-bold md:text-3xl">
            {greeting(me.fullName, now)} <span aria-hidden>👋</span>
          </h1>
          <p className="m-0 mt-1 text-muted">Đây là tổng quan của bạn hôm nay.</p>
        </div>
        {stats.length > 0 && <StatChips stats={stats} label="Số liệu nhanh" />}
      </div>

      <DemoBanner>Các mục có nhãn Demo (lớp học, lịch học, chuyên cần) dùng dữ liệu giả, chưa nối với hệ thống.</DemoBanner>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-6">
          {isAdmin && (
            <Widget title="Lớp học" icon="school" demo action={{ href: '/lop-hoc', label: 'Xem tất cả' }}>
              <ClassStatusCounts classes={allClasses} />
            </Widget>
          )}

          {has('SALES') && (
            <Widget title="Lớp sắp khai giảng" icon="school" demo action={{ href: '/lop-hoc', label: 'Xem tất cả' }}>
              <ul className="m-0 grid list-none gap-3 p-0">
                {openClasses.map((demoClass) => {
                  const first = nextSession(demoClass);
                  return (
                    <li key={demoClass.code} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-solid border-border p-3 sm:p-4">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="m-0 font-semibold">{demoClass.name}</p>
                        <p className="m-0 text-sm text-muted">{demoClass.course}</p>
                      </div>
                      <dl className="m-0 grid grid-cols-2 gap-x-6 text-sm">
                        <div>
                          <dt className="text-muted">Còn chỗ</dt>
                          <dd className="m-0 font-medium">
                            {demoClass.capacity - demoClass.students.length}/{demoClass.capacity}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Khai giảng</dt>
                          <dd className="m-0 font-medium">{first ? shortDate.format(first.startsAt) : '—'}</dd>
                        </div>
                      </dl>
                      <Link href="/lop-hoc" className={`${OUTLINE_BUTTON} px-4 py-2 text-sm`}>
                        Xem lớp
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Widget>
          )}

          {has('TEACHER') && (
            <Widget title="Lịch dạy sắp tới" icon="calendar" demo action={{ href: '/lop-hoc', label: 'Lớp của tôi' }}>
              <SessionRows items={upcomingSessions(taught, 4, now)} linkToClass empty="Không có buổi dạy nào sắp tới." />
            </Widget>
          )}

          {has('STUDENT') && (
            <Widget title="Lịch học sắp tới" icon="calendar" demo>
              <SessionRows items={upcomingSessions(studying, 4, now)} linkToClass={false} empty="Không có buổi học nào sắp tới." />
            </Widget>
          )}

          {children.map((child) => (
            <Widget key={child.username} title={`Con: ${child.fullName}`} icon="graduation" demo>
              <AttendanceRate {...attendanceOf(child.username, now)} who="Chuyên cần" />
              <h3 className="m-0 text-sm font-semibold">Lịch học sắp tới</h3>
              <SessionRows items={upcomingSessions(classesOf(child.username, now), 3, now)} linkToClass={false} empty="Không có buổi học nào sắp tới." />
            </Widget>
          ))}
        </div>

        <div className="grid min-w-0 gap-6">
          {scheduled.length > 0 && (
            <Widget title="Lịch" icon="calendar" demo>
              <MiniCalendar now={now} marked={scheduled.flatMap((demoClass) => demoClass.sessions.map((session) => session.startsAt))} markedLabel="Có buổi học" />
              <h3 className="m-0 border-0 border-t border-solid border-border pt-4 text-sm font-semibold">Hôm nay</h3>
              <TodayTimeline items={todaySessions} />
            </Widget>
          )}

          {has('STUDENT') && (
            <Widget title="Chuyên cần" icon="check-circle" demo>
              <AttendanceRate {...attendance} />
            </Widget>
          )}

          <Widget title="Lối tắt" icon="arrow-right">
            <ul className="m-0 grid list-none gap-1 p-0">
              {shortcuts.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={`-mx-2 flex items-center gap-3 rounded-xl p-2 text-foreground no-underline hover:bg-surface ${FOCUS}`}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary">
                      <Icon name={item.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.title}</span>
                      <span className="block text-sm text-muted">{item.description}</span>
                    </span>
                    <Icon name="chevron-right" className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </Widget>
        </div>
      </div>
    </>
  );
}
