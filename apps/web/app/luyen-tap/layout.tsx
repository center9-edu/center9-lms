import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FOCUS } from '../ui/styles';

export const metadata: Metadata = {
  title: 'Luyện tập Python | Center9Edu',
  description: 'Tự tay viết những dòng code Python đầu tiên và xem kết quả ngay, không cần cài đặt hay đăng nhập.',
};

export default function PracticeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white leading-relaxed text-foreground">
      <header className="flex items-center gap-4 border-0 border-b border-solid border-border px-6 py-3">
        <Link href="/luyen-tap" className={`rounded font-bold text-primary no-underline ${FOCUS}`}>
          Center9Edu <span className="ml-2 font-normal text-muted">Luyện tập Python</span>
        </Link>
        <Link href="/" className={`ml-auto rounded text-sm font-semibold text-primary underline ${FOCUS}`}>
          Vào LMS
        </Link>
      </header>
      {children}
    </div>
  );
}
