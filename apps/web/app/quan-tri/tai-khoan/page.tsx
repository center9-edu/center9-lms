import type { Metadata } from 'next';
import styles from '../admin.module.css';
import { requireUser } from '../../lib/session';
import type { Role } from '../../lib/session';
import { CreateUserForm } from './create-user-form';
import { ADMIN_ROLES, fetchUsers, ROLE_LABELS, STATUS_LABELS } from './users';

export const metadata: Metadata = {
  title: 'Tài khoản | Center9Edu LMS',
};

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

export default async function AccountsPage() {
  const me = await requireUser(ADMIN_ROLES);
  const users = await fetchUsers();
  // The API enforces this too; hiding the options only keeps the form honest.
  const grantable = (Object.keys(ROLE_LABELS) as Role[]).filter(
    (role) => me.roles.includes('SUPER_ADMIN') || !ADMIN_ROLES.includes(role),
  );

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Tài khoản</h1>

      <section aria-labelledby="create-heading" className={styles.card}>
        <h2 id="create-heading">Tạo tài khoản</h2>
        <CreateUserForm roleOptions={grantable.map((role) => ({ value: role, label: ROLE_LABELS[role] }))} />
      </section>

      <section aria-labelledby="list-heading" className={styles.card}>
        <h2 id="list-heading">Danh sách ({users.length})</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Họ và tên</th>
                <th scope="col">Tên đăng nhập</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName}</td>
                  <td>{user.username}</td>
                  <td>{user.roles.map((role) => ROLE_LABELS[role]).join(', ')}</td>
                  <td>
                    {STATUS_LABELS[user.status]}
                    {user.mustChangePassword && <span className={styles.note}> · chưa đổi mật khẩu tạm</span>}
                  </td>
                  <td>{dateFormat.format(new Date(user.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
