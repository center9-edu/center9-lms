import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import styles from '../dang-nhap/login.module.css';
import { logout } from '../dang-nhap/actions';
import { getSessionUser } from '../lib/session';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = {
  title: 'Đổi mật khẩu | Center9Edu LMS',
};

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/dang-nhap');
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Đổi mật khẩu</h1>
        <p className={styles.brand}>
          {user.mustChangePassword
            ? `Chào ${user.fullName}, đây là mật khẩu tạm. Vui lòng đặt mật khẩu mới trước khi tiếp tục.`
            : `Tài khoản: ${user.username}`}
        </p>
        <ChangePasswordForm />
        <div className={styles.footer}>
          {user.mustChangePassword ? (
            <form action={logout}>
              <button type="submit" className={styles.linkButton}>
                Đăng xuất
              </button>
            </form>
          ) : (
            <Link href="/">Quay lại</Link>
          )}
        </div>
      </div>
    </main>
  );
}
