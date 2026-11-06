import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './practice.module.css';

export const metadata: Metadata = {
  title: 'Luyện tập Python | Center9Edu',
  description: 'Tự tay viết những dòng code Python đầu tiên và xem kết quả ngay, không cần cài đặt hay đăng nhập.',
};

export default function PracticeLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <Link href="/luyen-tap" className={styles.brand}>
          Center9Edu <span className={styles.brandSuffix}>Luyện tập Python</span>
        </Link>
      </header>
      {children}
    </div>
  );
}
