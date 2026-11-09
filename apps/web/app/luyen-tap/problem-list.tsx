'use client';

import Link from 'next/link';
import { Badge } from '../ui/badge';
import { FOCUS } from '../ui/styles';
import { useCompletedSlugs } from './progress';
import type { ProblemSummary } from './types';

export function ProblemList({ problems }: { problems: ProblemSummary[] }) {
  const completed = useCompletedSlugs();
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {problems.map((problem, index) => (
        <li key={problem.slug}>
          <Link
            href={`/luyen-tap/${problem.slug}`}
            className={`flex flex-wrap items-center gap-3 rounded-xl border border-solid border-border p-4 text-inherit no-underline hover:border-primary ${FOCUS}`}
          >
            <span className="grid size-9 flex-none place-items-center rounded-full bg-surface font-bold text-primary" aria-hidden="true">
              {index + 1}
            </span>
            <span className="flex flex-[1_1_14rem] flex-col">
              <span className="font-semibold">{problem.title}</span>
              <span className="text-[0.9375rem] text-muted">{problem.summary}</span>
            </span>
            <Badge>{problem.level}</Badge>
            {completed.includes(problem.slug) && <span className="text-sm font-semibold text-success">✓ Đã xong</span>}
          </Link>
        </li>
      ))}
    </ol>
  );
}
