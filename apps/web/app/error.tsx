'use client';

// Catches errors from layouts below the root, e.g. app/(app)/layout.tsx when the API is down.
export default function AppError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto box-border max-w-md px-4 py-16 text-center text-foreground">
      <h1 className="m-0 text-2xl font-bold">Không kết nối được hệ thống</h1>
      <p className="mt-2 mb-6 text-muted">Vui lòng thử lại sau ít phút.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="cursor-pointer rounded-lg border-0 bg-primary px-5 py-2.5 font-[inherit] font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Thử lại
      </button>
    </main>
  );
}
