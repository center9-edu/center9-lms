import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Center9Edu LMS',
  description: 'Hệ thống quản lý học tập Center9Edu',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="m-0 font-sans">{children}</body>
    </html>
  );
}
