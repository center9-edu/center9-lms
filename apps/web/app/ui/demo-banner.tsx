/** Shown on every screen that uses app/lib/demo-data.ts, so a demo is never mistaken for real data. */
export function DemoBanner({ children }: { children?: string }) {
  return (
    <p role="note" className="m-0 mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-warning-surface px-5 py-3.5 text-sm text-foreground">
      <span className="rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-white">Demo</span>
      <strong className="font-semibold">Dữ liệu demo.</strong>
      <span>{children ?? 'Lớp học, buổi học và điểm danh chưa nối với hệ thống; mọi số liệu ở đây là giả.'}</span>
    </p>
  );
}
