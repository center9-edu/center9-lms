import Link from 'next/link';
import { PRIMARY_BUTTON } from '../ui/styles';

export default function PracticeNotFound() {
  return (
    <main className="mx-auto box-border w-full max-w-3xl px-6 py-10">
      <h1 className="m-0 mb-6 text-[1.75rem] leading-snug font-bold">Không tìm thấy bài tập này</h1>
      <Link href="/luyen-tap" className={PRIMARY_BUTTON}>
        Xem danh sách bài tập
      </Link>
    </main>
  );
}
