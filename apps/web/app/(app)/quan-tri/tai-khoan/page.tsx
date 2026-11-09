import type { Metadata } from 'next';
import { requireUser } from '../../../lib/session';
import type { Role } from '../../../lib/session';
import { Badge } from '../../../ui/badge';
import type { BadgeTone } from '../../../ui/badge';
import { CARD } from '../../../ui/styles';
import { CreateUserForm } from './create-user-form';
import { UserActions } from './user-actions';
import { ADMIN_ROLES, fetchUsers, ROLE_LABELS, STATUS_LABELS } from './users';
import type { UserStatus } from './users';

export const metadata: Metadata = {
  title: 'Tài khoản | Center9Edu LMS',
};

const STATUS_TONES: Record<UserStatus, BadgeTone> = { ACTIVE: 'success', INACTIVE: 'muted', LOCKED: 'danger' };
const CELL = 'border-0 border-b border-solid border-border px-3 py-2.5 text-left align-top whitespace-nowrap';

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

export default async function AccountsPage() {
  const me = await requireUser(ADMIN_ROLES);
  const users = await fetchUsers();
  // The API enforces this too; hiding the options only keeps the form honest.
  const grantable = (Object.keys(ROLE_LABELS) as Role[]).filter(
    (role) => me.roles.includes('SUPER_ADMIN') || !ADMIN_ROLES.includes(role),
  );

  const isSuperAdmin = me.roles.includes('SUPER_ADMIN');
  const roleOptions = grantable.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
  const statusOptions = (Object.keys(STATUS_LABELS) as UserStatus[]).map((status) => ({ value: status, label: STATUS_LABELS[status] }));
  // Same rules as the API: never your own account, and admin accounts only for a SUPER_ADMIN.
  const canEdit = (roles: Role[]) => isSuperAdmin || !roles.some((role) => ADMIN_ROLES.includes(role));

  return (
    <>
      <h1 className="m-0 text-2xl font-bold">Tài khoản</h1>
      <p className="mt-1 mb-6 text-muted">Tạo tài khoản và quản lý vai trò, trạng thái, mật khẩu.</p>

      <section aria-labelledby="create-heading" className={`${CARD} mb-6`}>
        <h2 id="create-heading" className="m-0 mb-4 text-lg font-semibold">
          Tạo tài khoản
        </h2>
        <CreateUserForm roleOptions={roleOptions} />
      </section>

      <section aria-labelledby="list-heading" className={CARD}>
        <h2 id="list-heading" className="m-0 mb-4 text-lg font-semibold">
          Danh sách ({users.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['Họ và tên', 'Tên đăng nhập', 'Vai trò', 'Trạng thái', 'Ngày tạo', 'Thao tác'].map((heading) => (
                  <th key={heading} scope="col" className={`${CELL} font-semibold text-muted`}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className={`${CELL} font-medium`}>{user.fullName}</td>
                  <td className={CELL}>{user.username}</td>
                  <td className={CELL}>
                    <span className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role} tone="primary">
                          {ROLE_LABELS[role]}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className={CELL}>
                    <Badge tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</Badge>
                    {user.mustChangePassword && <span className="mt-1 block text-xs text-muted">Chưa đổi mật khẩu tạm</span>}
                  </td>
                  <td className={CELL}>{dateFormat.format(new Date(user.createdAt))}</td>
                  <td className={`${CELL} min-w-40 whitespace-normal`}>
                    {user.id === me.id ? (
                      <span className="text-muted">Tài khoản của bạn</span>
                    ) : canEdit(user.roles) ? (
                      <UserActions user={user} roleOptions={roleOptions} statusOptions={statusOptions} />
                    ) : (
                      <span className="text-muted">Chỉ Quản trị hệ thống</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
