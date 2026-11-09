/** Shown on every screen that uses app/lib/demo-data.ts, so a demo is never mistaken for real data. */
export function DemoBanner({ children }: { children?: string }) {
  return (
    <p role="note" className="m-0 mb-6 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <strong className="font-semibold">Dữ liệu demo.</strong>{' '}
      {children ?? 'Lớp học, buổi học và điểm danh chưa nối với hệ thống; mọi số liệu ở đây là giả.'}
    </p>
  );
}
