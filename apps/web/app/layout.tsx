import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// Designed for Vietnamese diacritics. next/font hosts the files with the app: no request to Google at runtime.
const beVietnam = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Center9Edu LMS',
  description: 'Hệ thống quản lý học tập Center9Edu',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body className="m-0 font-sans antialiased">{children}</body>
    </html>
  );
}
