# Kiến trúc Center9Edu LMS

Modular monolith trong một pnpm workspace. Một API NestJS, một frontend Next.js, một package database dùng chung.

```text
Trình duyệt ──HTTP──▶ apps/web (Next.js) ──HTTP──▶ apps/api (NestJS) ──Prisma──▶ PostgreSQL
                                                        │
                                                        └── import @center9/database
```

## Ranh giới

- **Chỉ `apps/api` được import `@center9/database`.** `apps/web` lấy dữ liệu qua REST API.
  ESLint chặn `@center9/database` và `@prisma/*` trong `apps/web`.
- **Không trả Prisma model trực tiếp ra API.** Mỗi endpoint tự định nghĩa kiểu response (DTO) và map từ model,
  để thay đổi schema (thêm cột nhạy cảm như `passwordHash`) không vô tình lộ ra client.
- Module nghiệp vụ mới (lớp học, bài tập, …) là NestJS module trong `apps/api/src/<module>/`.
  Chỉ tách thành package riêng khi có từ hai nơi trở lên cần dùng chung.

## Quyết định kỹ thuật

| Quyết định | Lý do |
| --- | --- |
| Node.js 24 LTS, pnpm 11.10.0 | Node 24 là Active LTS; hỗ trợ sẵn `--env-file`, `process.loadEnvFile`. pnpm cố định qua `packageManager` để cả team và CI dùng cùng phiên bản. |
| Không dùng Turborepo | Chỉ có 3 package; `pnpm -r` đã chạy theo thứ tự phụ thuộc. Cân nhắc thêm khi build/CI chậm và cần cache. |
| Toàn bộ ESM (`"type": "module"`) | NestJS 12 và template chính thức của nó là ESM; Prisma 7 generator `prisma-client` sinh ESM. Import nội bộ dùng đuôi `.js`. |
| TypeScript 6.0 | typescript-eslint và NestJS CLI chưa hỗ trợ TypeScript 7. |
| Prisma 7 + `@prisma/adapter-pg` | Prisma 7 bắt buộc driver adapter, cấu hình kết nối nằm ở `prisma.config.ts`. Pool timeout 5s để request/health check không treo khi DB sập. |
| `@center9/database` build ra `dist/` | API chạy `dist` đã compile, không phụ thuộc runtime TS. `postinstall` tự generate + build để `pnpm install` xong là chạy được. |
| Prisma Client không commit | Generate từ `schema.prisma` khi install; tránh diff lớn và lệch phiên bản. |
| Health: `/health` và `/health/ready` | Liveness không chạm DB (để orchestrator không restart API khi DB chập chờn); readiness chạy `SELECT 1`. Response chỉ có trạng thái, lỗi chi tiết chỉ ghi log. |
| Vitest cho API | Mặc định của NestJS 12; nhanh, hỗ trợ ESM sẵn. |
| Một ESLint config ở gốc | Một lệnh `pnpm lint` cho cả repo; rule Next.js chỉ áp dụng cho `apps/web`. |
| PostgreSQL 18, bind `127.0.0.1` | Bản ổn định mới nhất; không lộ cổng DB ra mạng LAN. |

## Migration

- Migration nằm trong `packages/database/prisma/migrations/`, tạo bằng `prisma migrate dev`, áp dụng bằng `prisma migrate deploy`.
- Không dùng `prisma db push` cho môi trường dùng chung.
- Schema SQL cũ (nếu có) không áp dụng trực tiếp; chuyển dần thành model Prisma + migration có review.
