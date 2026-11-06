'use client';

import Link from 'next/link';
import styles from './practice.module.css';
import { useCompletedSlugs } from './progress';
import type { ProblemSummary } from './types';

export function ProblemList({ problems }: { problems: ProblemSummary[] }) {
  const completed = useCompletedSlugs();
  return (
    <ol className={styles.problemList}>
      {problems.map((problem, index) => (
        <li key={problem.slug}>
          <Link href={`/luyen-tap/${problem.slug}`} className={styles.problemCard}>
            <span className={styles.problemNumber} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.problemText}>
              <span className={styles.problemTitle}>{problem.title}</span>
              <span className={styles.problemSummary}>{problem.summary}</span>
            </span>
            <span className={styles.level}>{problem.level}</span>
            {completed.includes(problem.slug) && <span className={styles.doneBadge}>✓ Đã xong</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}
