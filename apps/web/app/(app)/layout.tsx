import Link from 'next/link';
import type { ReactNode } from 'react';
import { logout } from '../dang-nhap/actions';
import { ADMIN_ROLES, CLASS_ROLES, CURRICULUM_READ_ROLES, LEARNER_ROLES, requireUser, ROLE_LABELS, STUDENT_MANAGER_ROLES } from '../lib/session';
import type { Role, SessionUser } from '../lib/session';
import { Avatar } from '../ui/avatar';
import { Icon } from '../ui/icons';
import type { IconName } from '../ui/icons';
import { FOCUS } from '../ui/styles';
import { NavLink } from './nav-link';

// Without `roles`, every signed-in user sees the item. The pages check roles again; hiding a link is not access control.
const NAV_ITEMS: { href: string; label: string; icon: IconName; roles?: Role[] }[] = [
  { href: '/', label: 'Tổng quan', icon: 'home' },
  { href: '/lop-hoc', label: 'Lớp học', icon: 'school', roles: [...CLASS_ROLES, ...LEARNER_ROLES] },
  { href: '/chuong-trinh', label: 'Chương trình', icon: 'book', roles: CURRICULUM_READ_ROLES },
  { href: '/hoc-sinh', label: 'Học sinh', icon: 'graduation', roles: STUDENT_MANAGER_ROLES },
  { href: '/giao-vien', label: 'Giáo viên', icon: 'presentation', roles: ADMIN_ROLES },
  { href: '/quan-tri/tai-khoan', label: 'Tài khoản', icon: 'shield', roles: ADMIN_ROLES },
  { href: '/luyen-tap', label: 'Luyện tập', icon: 'code' },
];

const ACCOUNT_LINK = `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted no-underline hover:bg-white hover:text-foreground ${FOCUS}`;

/** Name, roles, password change and logout: in the sidebar on desktop, behind the avatar on phones. */
function Account({ me }: { me: SessionUser }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <Avatar name={me.fullName} />
        <div className="min-w-0">
          <p className="m-0 truncate font-semibold">{me.fullName}</p>
          <p className="m-0 truncate text-sm text-muted">{me.roles.map((role) => ROLE_LABELS[role]).join(', ')}</p>
        </div>
      </div>
      <div className="grid gap-0.5">
        <Link href="/doi-mat-khau" className={ACCOUNT_LINK}>
          <Icon name="key" className="size-4" />
          Đổi mật khẩu
        </Link>
        <form action={logout}>
          <button type="submit" className={`${ACCOUNT_LINK} w-full cursor-pointer border-0 bg-transparent font-[inherit] text-danger hover:text-danger`}>
            <Icon name="log-out" className="size-4" />
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Pages check again: a layout is not re-rendered on every navigation.
  const me = await requireUser();
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => me.roles.includes(role)));

  return (
    <div className="min-h-screen bg-surface leading-normal text-foreground md:flex">
      <aside className="box-border flex flex-col gap-4 border-0 border-b border-solid border-border bg-white p-4 md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:gap-8 md:border-r md:border-b-0 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className={`flex items-center gap-2.5 rounded-lg no-underline ${FOCUS}`}>
            <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-white">
              C9
            </span>
            <span className="text-lg font-bold text-foreground">
              Center9<span className="text-primary">Edu</span>
            </span>
          </Link>
          {/* Phones: the account panel opens from the avatar; <details> needs no JavaScript and works with the keyboard. */}
          <details className="relative md:hidden">
            <summary className={`cursor-pointer list-none rounded-full [&::-webkit-details-marker]:hidden ${FOCUS}`} aria-label="Tài khoản của tôi">
              <Avatar name={me.fullName} />
            </summary>
            <div className="absolute right-0 z-10 mt-2 box-border w-64 rounded-2xl border border-solid border-border bg-white p-4 shadow-card">
              <Account me={me} />
            </div>
          </details>
        </div>

        <nav aria-label="Điều hướng chính" className="-mx-1 overflow-x-auto px-1 md:mx-0 md:overflow-visible md:px-0">
          <p className="m-0 mb-2 hidden px-3 text-xs font-semibold tracking-wider text-muted uppercase md:block">Menu</p>
          <ul className="m-0 flex list-none gap-1 p-0 md:flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} icon={item.icon}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto hidden rounded-2xl bg-surface p-3 md:block">
          <Account me={me} />
        </div>
      </aside>
      <main className="box-border min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
