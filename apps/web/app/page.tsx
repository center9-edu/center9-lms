const API_URL = process.env.API_URL ?? 'http://localhost:3001';

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
  return (
    <main style={{ margin: '2rem' }}>
      <h1>Center9Edu LMS</h1>
      <p>Trạng thái hệ thống: {ready ? 'API và database sẵn sàng' : 'Không kết nối được API hoặc database'}</p>
    </main>
  );
}
