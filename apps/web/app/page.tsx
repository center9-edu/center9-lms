import Link from 'next/link';
import { logout } from './dang-nhap/actions';
import { API_URL } from './lib/api';
import { getSessionUser } from './lib/session';

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

export default async function HomePage() {
  const ready = await isApiReady();
  // The status line must render even when the API is down.
  const user = await getSessionUser().catch(() => null);
  return (
    <main style={{ margin: '2rem' }}>
      <h1>Center9Edu LMS</h1>
      {user ? (
        <form action={logout}>
          <p>
            Xin chào, {user.fullName}. <button type="submit">Đăng xuất</button>
          </p>
        </form>
      ) : (
        <p>
          <Link href="/dang-nhap">Đăng nhập</Link>
        </p>
      )}
      <p>Trạng thái hệ thống: {ready ? 'API và database sẵn sàng' : 'Không kết nối được API hoặc database'}</p>
    </main>
  );
}
