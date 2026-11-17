import type { Metadata } from 'next';
import Link from 'next/link';
import { ADMIN_ROLES, requireUser } from '../../../lib/session';
import { Badge } from '../../../ui/badge';
import { CARD, FOCUS } from '../../../ui/styles';
import { STATUS_LABELS } from '../../quan-tri/tai-khoan/users';
import { fetchTeacher } from '../teachers';
import { TeacherForm } from './teacher-form';

export const metadata: Metadata = {
  title: 'Hồ sơ giáo viên | Center9Edu LMS',
};

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(ADMIN_ROLES);
  const { id } = await params;
  const teacher = await fetchTeacher(id);
  const { profile } = teacher;

  return (
    <>
      <Link href="/giao-vien" className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← Giáo viên
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-2xl font-bold">{teacher.fullName}</h1>
        {profile ? <Badge tone="primary">{profile.teacherCode}</Badge> : <Badge>Chưa có hồ sơ</Badge>}
      </div>
      <p className="mt-1 mb-6 text-muted">
        Tên đăng nhập: {teacher.username}
        {teacher.status !== 'ACTIVE' && ` · ${STATUS_LABELS[teacher.status]}`}
      </p>

      <section aria-labelledby="profile-heading" className={CARD}>
        <h2 id="profile-heading" className="m-0 mb-1 text-lg font-semibold">
          Hồ sơ
        </h2>
        <p className="mt-0 mb-4 text-sm text-muted">
          {profile ? 'Để trống ô giới thiệu thì nội dung cũ sẽ bị xoá khi lưu.' : 'Mã giáo viên được tạo tự động khi lưu hồ sơ lần đầu.'}
        </p>
        <TeacherForm userId={teacher.userId} isNew={!profile} initialBio={profile?.bio ?? ''} />
      </section>
    </>
  );
}
