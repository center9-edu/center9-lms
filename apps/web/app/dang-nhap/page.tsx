import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '../lib/session';
import { AuthCard } from '../ui/auth-card';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Đăng nhập | Center9Edu LMS',
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(user.mustChangePassword ? '/doi-mat-khau' : '/');
  }

  return (
    <AuthCard title="Đăng nhập" subtitle="Dùng tài khoản do trung tâm cấp.">
      <LoginForm />
    </AuthCard>
  );
}
