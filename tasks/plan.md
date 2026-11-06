# Plan: Auth + phân quyền — Center9Edu LMS

> Sau khi plan được duyệt, bước đầu tiên là lưu nội dung này vào `tasks/plan.md` và danh sách task vào `tasks/todo.md`. Thư mục `tasks/` hiện chưa có, nên không ghi đè plan nào.

## Context

DB đã có `users`, `user_roles` và `auth_sessions` (`packages/database/prisma/schema.prisma`), nhưng API chưa có code đăng nhập. CLAUDE.md §11 yêu cầu thiết kế auth phải được duyệt trước, nên plan này chính là bản thiết kế để duyệt. Mọi phase sau (người dùng, lớp, điểm danh) đều cần phần này. Repo chưa có index CodeGraph nên mình đọc file trực tiếp.

**Các quyết định đã chốt với người dùng:**
- Phiên đăng nhập hết hạn sau 7 ngày không hoạt động, tự gia hạn khi dùng, tối đa 30 ngày kể từ lúc đăng nhập.
- Sai mật khẩu 5 lần thì chặn 15 phút theo cặp (username, IP). Bộ đếm giữ trong bộ nhớ, không đổi `users.status`.
- Phạm vi gồm lõi auth và phần admin quản lý tài khoản.
- Hash mật khẩu bằng `node:crypto` `scrypt`, không thêm dependency.

**Giả định cần xác nhận khi review** (là quy tắc phân quyền, chưa ai chốt):
1. `SUPER_ADMIN` và `CENTER_ADMIN` được quản lý tài khoản. Chỉ `SUPER_ADMIN` được gán hoặc gỡ role `SUPER_ADMIN`/`CENTER_ADMIN`, và chỉ `SUPER_ADMIN` được sửa tài khoản của một `SUPER_ADMIN` khác.
2. Mật khẩu dài từ 8 đến 128 ký tự. Giới hạn trên để tránh bị DoS qua scrypt.
3. Tài khoản do admin tạo, không có tự đăng ký. Mật khẩu tạm do hệ thống sinh ngẫu nhiên, chỉ hiện 1 lần, và `mustChangePassword = true`.
4. Ai đang đăng nhập cũng vào được `/luyen-tap` và `/health`; hai route này giữ public.

## Kiến trúc

```text
Browser ──cookie c9_session (httpOnly)──▶ apps/web (Server Component / Server Action)
          ──Authorization: Bearer <token>──▶ apps/api AuthGuard ──▶ auth_sessions (sha256(token))
```

**Token và session**
- Token là `randomBytes(32)` dạng base64url. DB chỉ lưu `sha256(token)` vào `auth_sessions.token_hash`.
- Trình duyệt không bao giờ gọi API trực tiếp. `apps/web` đọc cookie và đính kèm Bearer vào request gửi API, giống cách `luyen-tap/[slug]/actions.ts` đang gọi API hiện nay.

**Guard toàn cục (default-deny)**
- Đăng ký `APP_GUARD` để mọi endpoint mặc định đều cần đăng nhập. Endpoint public phải đánh dấu `@Public()` (health, coding-practice).
- Guard chạy theo thứ tự:
  1. Bỏ qua nếu endpoint là `@Public()`.
  2. Đọc Bearer, tìm session theo hash. Session phải chưa revoke, chưa hết `expires_at`, và `created_at` cách hiện tại chưa quá 30 ngày.
  3. User phải có `status = ACTIVE`.
  4. Nếu `mustChangePassword` thì chỉ cho gọi các endpoint `@AllowPendingPasswordChange()` (me, logout, đổi mật khẩu).
  5. Kiểm tra `@Roles(...)` của endpoint.
  6. Gắn `request.user` để handler dùng.
- Gia hạn trượt: chỉ cập nhật `expires_at` khi còn dưới 6 ngày, nên mỗi session ghi DB tối đa khoảng 1 lần/ngày.

**Chống dò tài khoản**
- Username không tồn tại vẫn chạy scrypt trên một hash giả. Mọi trường hợp sai đều trả cùng một lỗi 401.
- Tài khoản bị `LOCKED`/`INACTIVE` chỉ được báo trạng thái sau khi nhập đúng mật khẩu.

**Thu hồi phiên**: khi đổi mật khẩu, admin reset mật khẩu, khoá tài khoản hoặc đổi role, revoke toàn bộ session của user đó (set `revoked_at`).

**Audit log**: ghi `audit_logs` trong cùng transaction cho các action `auth.login`, `auth.logout`, `auth.password_changed`, `user.created`, `user.roles_changed`, `user.password_reset`, `user.status_changed`. `metadata` chỉ chứa role/status, không có dữ liệu cá nhân. Đăng nhập sai không ghi audit, và log server không ghi username.

**CSRF**: Server Actions của Next đã kiểm tra Origin. Cookie đặt `SameSite=Lax`, `Secure` khi production. API chỉ nhận request từ `apps/web`.

**Bỏ qua có chủ đích**
- `proxy.ts` của Next: chưa cần. Kiểm tra quyền trong layout/page qua DAL là đủ, và docs Next (`01-app/02-guides/authentication.md`) cũng khuyên đặt kiểm tra thật ở DAL. Thêm khi số route cần bảo vệ nhiều lên.
- Bảng `permissions`: không làm, đúng như quyết định đã ghi trong `docs/architecture/README.md`.

## File sẽ tạo/sửa

**API (`apps/api/src/`)**
- `prisma.module.ts` (mới): `@Global()`, export `PrismaService`. `app.module.ts` import module này thay vì tự khai báo provider.
- `auth/password.ts`:
  - `hashPassword` lưu theo dạng `scrypt$N$r$p$salt$hash`.
  - `verifyPassword` so sánh bằng `timingSafeEqual`.
  - `generateTemporaryPassword`.
- `auth/auth.decorators.ts`: `Public`, `Roles`, `AllowPendingPasswordChange`, `CurrentUser`.
- `auth/auth.guard.ts`: guard đã mô tả ở trên, có kèm phần gia hạn trượt.
- `auth/auth.service.ts`:
  - Đăng nhập, đăng xuất, đổi mật khẩu.
  - `login`, `logout`, `changePassword`, `findSessionUser`.
  - `revokeAllSessions(userId)` và `hashPassword` được export cho `UsersService` dùng.
  - Bộ đếm sai mật khẩu viết theo cùng kiểu `Map` với `CodingPracticeService.runsByIp`, kèm comment `ponytail:` ghi rõ giới hạn chỉ đúng với 1 instance.
- `auth/auth.controller.ts`: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/password`.
- `auth/auth.dto.ts`:
  - `SessionUserDto { id, username, fullName, roles, mustChangePassword }`.
  - Hàm parse body theo kiểu `parseRunRequest` trong `coding-practice.controller.ts`.
- `auth/auth.module.ts`: đăng ký `APP_GUARD`, export `AuthService`.
- `users/users.{module,controller,service,dto}.ts`:
  - `GET /users`, `POST /users`, `PUT /users/:id/roles`, `POST /users/:id/password-reset`, `PATCH /users/:id/status`.
  - Bảo vệ bằng `@Roles('SUPER_ADMIN','CENTER_ADMIN')`.
  - Logic leo thang quyền (giả định 1) đặt trong service.
- `scripts/create-super-admin.ts`:
  - `node dist/scripts/create-super-admin.js <username> "<Họ tên>"`, in mật khẩu tạm ra đúng 1 lần.
  - Từ chối chạy nếu đã có `SUPER_ADMIN`.
  - Thêm script `create-super-admin` vào `apps/api/package.json`.
- `health/health.controller.ts`, `coding-practice/coding-practice.controller.ts`: thêm `@Public()`.
- Spec Vitest đặt cạnh file nguồn, viết theo mẫu `coding-practice.service.spec.ts`: `password.spec.ts`, `auth.service.spec.ts`, `auth.guard.spec.ts`, `users.service.spec.ts`. Sửa `health.controller.spec.ts` nếu bị ảnh hưởng.

**Web (`apps/web/app/`)**
- `lib/api.ts` (mới):
  - `API_URL`, và `apiFetch(path, init)` tự đính kèm Bearer lấy từ cookie.
  - `luyen-tap/api.ts` chuyển sang import `API_URL` từ file này. Đây là thay đổi 1 dòng.
- `lib/session.ts`:
  - `getSessionUser = cache(...)` gọi `GET /auth/me`.
  - `requireUser(roles?)`: chưa đăng nhập thì redirect `/dang-nhap`; sai role thì `notFound()`; còn `mustChangePassword` thì redirect `/doi-mat-khau`.
  - Đặt và xoá cookie `c9_session`.
- `dang-nhap/page.tsx`, `dang-nhap/actions.ts`, `dang-nhap/login-form.tsx`:
  - Form `"use client"` dùng `useActionState`.
  - Action gửi kèm `X-Client-Ip` giống `runCode`.
- `doi-mat-khau/page.tsx` và action.
- Nút đăng xuất: một `<form action={logout}>` nhỏ.
- `quan-tri/layout.tsx` gọi `requireUser(['SUPER_ADMIN','CENTER_ADMIN'])`.
- `quan-tri/tai-khoan/page.tsx` + `actions.ts` + form client: danh sách, tạo tài khoản, reset mật khẩu (hiện mật khẩu tạm), khoá/mở, sửa role.
- Toàn bộ chữ trên UI bằng tiếng Việt.

**Docs**
- `docs/architecture/README.md`: cập nhật dòng "Server-side sessions", thêm các quyết định scrypt, BFF cookie, default-deny guard và giới hạn của throttle in-memory.
- `CLAUDE.md` §11: bỏ câu "Authentication and authorization are not implemented yet".
- `README.md`: thêm bước tạo SUPER_ADMIN đầu tiên.

## Đồ thị phụ thuộc

```text
T1 PrismaModule + password ─┬─▶ T2 API login/me/logout + guard ─▶ T3 Web login/logout
                            │                                   └─▶ T4 Đổi mật khẩu bắt buộc
                            └─▶ (script bootstrap trong T1)       T5 Throttle (sau T2)
T2 ─▶ T6 Users API list/create + UI ─▶ T7 reset/roles/status + UI ─▶ T8 Docs
```

## Tasks

**T1. Nền tảng: PrismaModule, hàm băm mật khẩu và script tạo SUPER_ADMIN**
- AC:
  - `pnpm --filter @center9/api create-super-admin admin "Quản trị"` tạo user có role `SUPER_ADMIN` và `must_change_password = true`, rồi in mật khẩu tạm.
  - Chạy lần 2 thì báo lỗi.
  - `verifyPassword` trả đúng/sai chính xác, và hash cũ vẫn verify được sau khi đổi tham số.
- Verify: `pnpm test` (password.spec), chạy script trên DB local, `psql` xem dòng vừa tạo.

**T2. API login/logout/me và guard default-deny**
- AC:
  - `POST /auth/login` đúng thì trả `{ token, user }`; sai thì trả 401 với cùng message trong mọi trường hợp.
  - `GET /auth/me` không có token thì 401; có token thì trả `SessionUserDto`, không có `passwordHash`.
  - `/health` và `/coding-practice/*` vẫn public.
  - Endpoint mới không có `@Public` thì mặc định trả 401.
  - Gọi logout xong thì token cũ bị 401.
  - Session quá 30 ngày thì 401.
- Verify: `auth.service.spec` và `auth.guard.spec` (hết hạn, revoked, LOCKED, sai role), cùng `curl` thủ công.

**T3. Web: đăng nhập, đăng xuất, DAL**
- AC:
  - `/dang-nhap` đăng nhập được và set cookie httpOnly. Sai thông tin thì hiện thông báo tiếng Việt.
  - Đăng xuất xoá cookie và revoke session.
  - `requireUser` redirect đúng.
  - Không có token nào lộ ra client component.
- Verify: `pnpm lint typecheck build`, chạy thử trên trình duyệt.

**T4. Đổi mật khẩu (kể cả lần đổi bắt buộc)**
- AC:
  - Khi `mustChangePassword`, API chặn mọi endpoint trừ me, logout và đổi mật khẩu, còn web redirect về `/doi-mat-khau`.
  - Đổi mật khẩu phải nhập đúng mật khẩu cũ. Đổi xong thì revoke các session khác.
- Verify: test trong spec và chạy thử luồng trên trình duyệt.

**T5. Chặn tạm khi sai mật khẩu nhiều lần**
- AC:
  - Sai 5 lần trong 15 phút theo (username, IP) thì trả 429. Web hiện "Thử lại sau 15 phút".
  - Đăng nhập đúng thì reset bộ đếm.
  - Map có giới hạn kích thước giống `MAX_TRACKED_IPS`.
- Verify: test dùng fake timers.

**Checkpoint A**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` đều xanh.
- Review bảo mật bằng `/agent-skills:review` hoặc security-auditor.
- Người dùng duyệt trước khi sang phần admin.

**T6. Users API: list/create và trang `/quan-tri/tai-khoan`**
- AC:
  - Admin tạo được tài khoản với username viết thường, họ tên và roles. Tạo xong hiện mật khẩu tạm 1 lần.
  - Vai trò khác `SUPER_ADMIN`/`CENTER_ADMIN` truy cập thì nhận 403 hoặc 404.
  - `CENTER_ADMIN` không tạo được user có role `SUPER_ADMIN`/`CENTER_ADMIN`.
  - Có audit `user.created`.
- Verify: `users.service.spec` và chạy thử trên trình duyệt.

**T7. Reset mật khẩu, sửa roles, khoá/mở tài khoản**
- AC:
  - Mỗi thao tác đều revoke session của user bị tác động và ghi audit.
  - Không ai tự khoá hoặc tự gỡ quyền admin của chính mình.
  - Không được để hệ thống còn 0 `SUPER_ADMIN` đang `ACTIVE`.
- Verify: spec cho các rule trên và chạy thử trên trình duyệt.

**T8. Docs**
- AC: 3 file docs nêu ở trên được cập nhật, không còn câu nào nói auth chưa có.

**Checkpoint B**
- Toàn bộ check xanh và `pnpm db:migrate:status` sạch. Plan này không đổi schema, nên không có migration.
- Hỏi người dùng có muốn commit và mở PR không. Đang ở branch `feat/coding-practice`, nên đề xuất tạo branch mới `feat/auth-sessions`.

## Rủi ro và follow-up
- Bộ đếm throttle in-memory chỉ đúng khi chạy 1 instance API. Đây là giới hạn đã có sẵn với `/luyen-tap`.
- Chưa có quyền theo tài nguyên (giáo viên chỉ thấy lớp của mình). Phần này sẽ làm ở Phase 4 trong service của từng module.
- Phụ huynh có thể không có tài khoản (`guardians.user_id` nullable). Luồng tạo tài khoản cho phụ huynh để sang Phase 2.
- Dọn session hết hạn: chưa làm, vì số dòng ít. Thêm job dọn khi bảng lớn.
