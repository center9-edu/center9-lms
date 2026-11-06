import Link from 'next/link';
import styles from './practice.module.css';

export default function PracticeNotFound() {
  return (
    <main className={styles.listPage}>
      <h1 className={styles.listTitle}>Không tìm thấy bài tập này</h1>
      <Link href="/luyen-tap" className={styles.primaryButton}>
        Xem danh sách bài tập
      </Link>
    </main>
  );
}
