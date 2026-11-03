import { notFound } from 'next/navigation';
import type { ProblemDetail, ProblemSummary } from './types';

// Server-only: import this file only from Server Components and Server Actions.
export const API_URL = process.env.API_URL ?? 'http://localhost:3001';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(3_000) });
  if (res.status === 404) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(`API responded with ${res.status}`);
  }
  return (await res.json()) as T;
}

export const fetchProblems = () => getJson<ProblemSummary[]>('/coding-practice/problems');

export const fetchProblem = (slug: string) =>
  getJson<ProblemDetail>(`/coding-practice/problems/${encodeURIComponent(slug)}`);
