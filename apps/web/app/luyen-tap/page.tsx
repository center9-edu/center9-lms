import { fetchProblems } from './api';
import { ProblemList } from './problem-list';

export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  return (
    <main className="mx-auto box-border w-full max-w-3xl px-6 py-10">
      <h1 className="m-0 mb-2 text-[1.75rem] leading-snug font-bold">Thử viết code Python ngay trên trình duyệt</h1>
      <p className="m-0 mb-8 text-muted">
        Không cần cài đặt, không cần đăng nhập. Hãy bắt đầu từ bài đầu tiên, nếu bí đã có gợi ý giúp em!
      </p>
      <ProblemList problems={await fetchProblems()} />
    </main>
  );
}
