# Todo: Auth + phân quyền

Chi tiết và acceptance criteria: [plan.md](plan.md).

- [x] T1. PrismaModule + `auth/password.ts` (scrypt) + script `create-super-admin`
- [ ] T2. API `/auth/login`, `/auth/logout`, `/auth/me` + global AuthGuard default-deny + `@Public()` cho health/coding-practice
- [ ] T3. Web `/dang-nhap`, đăng xuất, `lib/api.ts`, `lib/session.ts` (DAL)
- [ ] T4. Đổi mật khẩu (bắt buộc khi `mustChangePassword`) — API + `/doi-mat-khau`
- [ ] T5. Chặn tạm 15 phút sau 5 lần sai (username + IP)
- [ ] **Checkpoint A:** lint/typecheck/test/build xanh, review bảo mật, user duyệt
- [ ] T6. Users API list/create + `/quan-tri/tai-khoan`
- [ ] T7. Reset mật khẩu, sửa roles, khoá/mở tài khoản + revoke session + audit
- [ ] T8. Cập nhật `docs/architecture/README.md`, `CLAUDE.md` §11, `README.md`
- [ ] **Checkpoint B:** toàn bộ check xanh, hỏi commit/PR trên branch mới `feat/auth-sessions`

## Cần xác nhận
- [ ] Giả định 1–4 trong plan.md (quyền quản lý tài khoản, độ dài mật khẩu, admin tạo tài khoản, `/luyen-tap` giữ public)
