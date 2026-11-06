import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '../lib/session';
import { LoginForm } from './login-form';
import styles from './login.module.css';

export const metadata: Metadata = {
  title: 'Đăng nhập | Center9Edu LMS',
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(user.mustChangePassword ? '/doi-mat-khau' : '/');
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Đăng nhập</h1>
        <p className={styles.brand}>Center9Edu LMS</p>
        <LoginForm />
      </div>
    </main>
  );
}
