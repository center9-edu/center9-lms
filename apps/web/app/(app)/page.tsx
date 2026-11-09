import Link from 'next/link';
import { API_URL } from '../lib/api';
import { requireUser } from '../lib/session';
import type { Role } from '../lib/session';
import { ADMIN_ROLES } from './quan-tri/tai-khoan/users';

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
  {
    href: '/quan-tri/tai-khoan',
    title: 'Quản lý tài khoản',
    description: 'Tạo tài khoản, gán vai trò, đặt lại mật khẩu.',
    roles: ADMIN_ROLES,
  },
  { href: '/luyen-tap', title: 'Luyện tập Python', description: 'Viết code và xem kết quả ngay trên trình duyệt.' },
  { href: '/doi-mat-khau', title: 'Đổi mật khẩu', description: 'Cập nhật mật khẩu đăng nhập của bạn.' },
];

export default async function HomePage() {
  const me = await requireUser();
  const isAdmin = me.roles.some((role) => ADMIN_ROLES.includes(role));
  const shortcuts = SHORTCUTS.filter((item) => !item.roles || item.roles.some((role) => me.roles.includes(role)));
  const ready = isAdmin && (await isApiReady());

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Xin chào, {me.fullName}</h1>
      <p className="mt-1 mb-6 text-muted">Chọn một mục để bắt đầu.</p>

      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="box-border block h-full rounded-xl border border-solid border-border bg-white p-5 text-foreground no-underline hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="block font-semibold text-primary">{item.title}</span>
              <span className="mt-1 block text-sm text-muted">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <section aria-labelledby="status-heading" className="mt-6 rounded-xl border border-solid border-border bg-white p-5">
          <h2 id="status-heading" className="m-0 text-base font-semibold">
            Trạng thái hệ thống
          </h2>
          <p className={`mt-2 mb-0 font-medium ${ready ? 'text-success' : 'text-danger'}`}>
            {ready ? 'API và database sẵn sàng' : 'Không kết nối được API hoặc database'}
          </p>
        </section>
      )}
    </>
  );
}
