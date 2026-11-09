import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { logout } from '../dang-nhap/actions';
import { getSessionUser } from '../lib/session';
import { AuthCard } from '../ui/auth-card';
import { FOCUS } from '../ui/styles';
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
    <AuthCard
      title="Đổi mật khẩu"
      subtitle={
        user.mustChangePassword
          ? `Chào ${user.fullName}, đây là mật khẩu tạm. Vui lòng đặt mật khẩu mới trước khi tiếp tục.`
          : `Tài khoản: ${user.username}`
      }
    >
      <ChangePasswordForm />
      <div className="mt-5 text-center">
        {user.mustChangePassword ? (
          <form action={logout}>
            <button
              type="submit"
              className={`cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-primary underline ${FOCUS}`}
            >
              Đăng xuất
            </button>
          </form>
        ) : (
          <Link href="/" className={`rounded text-primary underline ${FOCUS}`}>
            Quay lại
          </Link>
        )}
      </div>
    </AuthCard>
  );
}
