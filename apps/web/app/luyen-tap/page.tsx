import { fetchProblems } from './api';
import styles from './practice.module.css';
import { ProblemList } from './problem-list';

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  const problems = await fetchProblems();
  return (
    <main className={styles.listPage}>
      <h1 className={styles.listTitle}>Thử viết code Python ngay trên trình duyệt</h1>
      <p className={styles.listIntro}>
        Không cần cài đặt, không cần đăng nhập. Hãy bắt đầu từ bài đầu tiên, nếu bí đã có gợi ý giúp em!
      </p>
      <ProblemList problems={problems} />
    </main>
  );
}
