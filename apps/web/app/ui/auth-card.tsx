import type { ReactNode } from 'react';

/** Centered card for the screens outside the app shell (login, password change). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="box-border grid min-h-screen place-items-center bg-surface p-6 leading-normal text-foreground">
      <div className="box-border w-full max-w-sm rounded-xl border border-solid border-border bg-white p-8 shadow-sm">
        <p className="m-0 mb-4 text-lg font-bold text-primary">
          Center9Edu <span className="font-normal text-muted">LMS</span>
        </p>
        <h1 className="m-0 text-2xl font-bold">{title}</h1>
        <p className="mt-1 mb-6 text-muted">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}
