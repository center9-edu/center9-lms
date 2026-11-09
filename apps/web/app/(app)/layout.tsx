import Link from 'next/link';
import type { ReactNode } from 'react';
import { logout } from '../dang-nhap/actions';
import { requireUser } from '../lib/session';
import { FOCUS } from '../ui/styles';
import type { Role } from '../lib/session';
import { ADMIN_ROLES, ROLE_LABELS } from './quan-tri/tai-khoan/users';
import { NavLink } from './nav-link';

// Without `roles`, every signed-in user sees the item. The pages check roles again; hiding a link is not access control.
const NAV_ITEMS: { href: string; label: string; roles?: Role[] }[] = [
  { href: '/', label: 'Tổng quan' },
  { href: '/quan-tri/tai-khoan', label: 'Tài khoản', roles: ADMIN_ROLES },
  { href: '/luyen-tap', label: 'Luyện tập' },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Pages check again: a layout is not re-rendered on every navigation.
  const me = await requireUser();
  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.some((role) => me.roles.includes(role)));

  return (
    <div className="min-h-screen bg-surface leading-normal text-foreground md:flex">
      <aside className="box-border flex flex-col gap-4 border-0 border-b border-solid border-border bg-white p-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <Link href="/" className="px-3 text-lg font-bold text-primary no-underline">
          Center9Edu <span className="font-normal text-muted">LMS</span>
        </Link>
        <nav aria-label="Điều hướng chính" className="overflow-x-auto">
          <ul className="m-0 flex list-none gap-1 p-0 md:flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 text-sm md:mt-auto md:flex-col md:items-start">
          <div>
            <p className="m-0 font-semibold">{me.fullName}</p>
            <p className="m-0 text-muted">{me.roles.map((role) => ROLE_LABELS[role]).join(', ')}</p>
          </div>
          <Link href="/doi-mat-khau" className={`rounded text-primary underline ${FOCUS}`}>
            Đổi mật khẩu
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-sm text-danger underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <main className="box-border min-w-0 flex-1 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
