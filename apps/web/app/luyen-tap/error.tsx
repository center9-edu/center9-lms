'use client';

import styles from './practice.module.css';

export default function PracticeError({ retry }: { retry: () => void }) {
  return (
    <main className={styles.listPage}>
      <h1 className={styles.listTitle}>Hệ thống đang bận một chút</h1>
      <p className={styles.listIntro}>Em thử tải lại sau ít phút nhé.</p>
      <button type="button" className={styles.primaryButton} onClick={() => retry()}>
        Thử lại
      </button>
    </main>
  );
}
