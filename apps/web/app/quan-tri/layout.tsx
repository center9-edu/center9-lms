import Link from 'next/link';
import type { ReactNode } from 'react';
import { logout } from '../dang-nhap/actions';
import { requireUser } from '../lib/session';
import styles from './admin.module.css';
import { ADMIN_ROLES } from './tai-khoan/users';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Pages check again: a layout is not re-rendered on every navigation.
  const me = await requireUser(ADMIN_ROLES);

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}>
          Center9Edu <span className={styles.brandSuffix}>Quản trị</span>
        </Link>
        <nav aria-label="Quản trị" className={styles.nav}>
          <Link href="/quan-tri/tai-khoan">Tài khoản</Link>
        </nav>
        <form action={logout} className={styles.account}>
          <span>{me.fullName}</span>
          <button type="submit">Đăng xuất</button>
        </form>
      </header>
      {children}
    </div>
  );
}
