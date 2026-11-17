import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser, STUDENT_MANAGER_ROLES } from '../../../lib/session';
import { Badge } from '../../../ui/badge';
import { CARD, FOCUS } from '../../../ui/styles';
import { STATUS_LABELS } from '../../quan-tri/tai-khoan/users';
import { fetchGuardians, fetchStudent, RELATIONSHIP_LABELS } from '../students';
import type { Relationship } from '../students';
import { GuardiansSection } from './guardians-section';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = {
  title: 'Hồ sơ học sinh | Center9Edu LMS',
};

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(STUDENT_MANAGER_ROLES);
  const { id } = await params;
  const [student, allGuardians] = await Promise.all([fetchStudent(id), fetchGuardians()]);
  const { profile } = student;
  const linked = new Set(student.guardians.map((guardian) => guardian.guardianId));
  const available = allGuardians
    .filter((guardian) => !linked.has(guardian.id))
    .map((guardian) => ({ value: guardian.id, label: [guardian.fullName, guardian.phone ?? guardian.email].filter(Boolean).join(' · ') }));
  const relationshipOptions = (Object.keys(RELATIONSHIP_LABELS) as Relationship[]).map((value) => ({ value, label: RELATIONSHIP_LABELS[value] }));

  return (
    <>
      <Link href="/hoc-sinh" className={`rounded text-sm text-primary underline ${FOCUS}`}>
        ← Học sinh
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-2xl font-bold">{student.fullName}</h1>
        {profile ? <Badge tone="primary">{profile.studentCode}</Badge> : <Badge>Chưa có hồ sơ</Badge>}
      </div>
      <p className="mt-1 mb-6 text-muted">
        Tên đăng nhập: {student.username}
        {student.status !== 'ACTIVE' && ` · ${STATUS_LABELS[student.status]}`}
      </p>

      <section aria-labelledby="profile-heading" className={CARD}>
        <h2 id="profile-heading" className="m-0 mb-1 text-lg font-semibold">
          Hồ sơ
        </h2>
        <p className="mt-0 mb-4 text-sm text-muted">
          {profile ? 'Các ô để trống sẽ được xoá khi lưu.' : 'Mã học sinh được tạo tự động khi lưu hồ sơ lần đầu. Các ô đều có thể để trống.'}
        </p>
        <ProfileForm
          userId={student.userId}
          isNew={!profile}
          initial={{ dateOfBirth: profile?.dateOfBirth ?? '', schoolName: profile?.schoolName ?? '', notes: profile?.notes ?? '' }}
        />
      </section>

      <section aria-labelledby="guardians-heading" className={`${CARD} mt-6`}>
        <h2 id="guardians-heading" className="m-0 mb-4 text-lg font-semibold">
          Phụ huynh
        </h2>
        {profile ? (
          <GuardiansSection
            studentId={student.userId}
            studentName={student.fullName}
            guardians={student.guardians.map((guardian) => ({ ...guardian, relationshipLabel: RELATIONSHIP_LABELS[guardian.relationship] ?? guardian.relationship }))}
            available={available}
            relationshipOptions={relationshipOptions}
          />
        ) : (
          <p className="m-0 text-muted">Lưu hồ sơ trước, sau đó mới thêm được phụ huynh.</p>
        )}
      </section>
    </>
  );
}
