# Center9Edu LMS

Hệ thống quản lý học tập cho trung tâm đào tạo công nghệ Center9Edu.
Landing page nằm ở repository riêng `center9-website`.

| Thành phần          | Package             | Công nghệ                              |
| ------------------- | ------------------- | -------------------------------------- |
| `apps/web`          | `@center9/web`      | Next.js 16 (App Router), React 19      |
| `apps/api`          | `@center9/api`      | NestJS 12 (REST, ESM)                  |
| `packages/database` | `@center9/database` | Prisma 7 + PostgreSQL (driver adapter) |
| `infra/docker`      | –                   | PostgreSQL 18 cho local                |

Kiến trúc và quy ước: [docs/architecture/README.md](docs/architecture/README.md).

## Yêu cầu

- **Node.js 24 LTS** (`>=24.11`, xem `.nvmrc`)
- **pnpm 11.10.0** (cố định trong `packageManager`, bật bằng Corepack)
- Docker Desktop (hoặc Docker Engine + Compose v2)

```bash
nvm use            # hoặc cài Node 24 theo cách bạn quen
corepack enable    # dùng đúng phiên bản pnpm khai báo trong package.json
```

## Chạy local từ đầu

```bash
git clone <repo-url> center9-lms && cd center9-lms

# 1. Biến môi trường (chỉ dùng cho local, file .env đã được gitignore)
cp .env.example .env

# 2. Cài dependency – tự động chạy prisma generate và build @center9/database
pnpm install

# 3. Khởi động PostgreSQL (chờ đến khi healthy)
pnpm db:up

# 4. Áp dụng migration
pnpm db:migrate:deploy

# 5. Chạy API + web
pnpm dev
```

Kiểm tra:

- Web: <http://localhost:3000> – hiển thị “API và database sẵn sàng”
- API liveness: `curl localhost:3001/health` → `{"status":"ok"}`
- API readiness (có kiểm tra DB): `curl localhost:3001/health/ready` → `{"status":"ok","database":"up"}`
  (trả `503` với `{"status":"error","database":"down"}` khi DB không truy cập được)

Dừng database: `pnpm db:down` (dữ liệu vẫn giữ trong Docker volume `center9-lms_postgres-data`).

## Scripts (chạy ở thư mục gốc)

| Lệnh                     | Mô tả                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| `pnpm dev`               | Chạy API (watch, cổng 3001) và web (cổng 3000) song song              |
| `pnpm build`             | Build tất cả package theo thứ tự phụ thuộc                            |
| `pnpm lint`              | ESLint toàn repo (một config ở gốc)                                   |
| `pnpm typecheck`         | `tsc --noEmit` cho từng package                                       |
| `pnpm test`              | Vitest cho API                                                        |
| `pnpm db:up` / `db:down` | Bật / tắt PostgreSQL local                                            |
| `pnpm db:generate`       | Generate lại Prisma Client và build `@center9/database` sau khi sửa schema |
| `pnpm db:migrate:dev`    | Tạo migration mới từ thay đổi `schema.prisma` (chỉ dùng ở local)      |
| `pnpm db:migrate:deploy` | Áp dụng migration đã commit (dùng cho CI, staging, production)        |
| `pnpm db:migrate:status` | Xem trạng thái migration                                              |

## Quy trình thay đổi database

1. Sửa `packages/database/prisma/schema.prisma`.
2. `pnpm db:migrate:dev --name <ten_thay_doi>` – tạo file SQL trong `prisma/migrations/` và áp dụng vào DB local.
3. Đọc lại file SQL vừa sinh, commit cùng thay đổi schema.
4. Môi trường khác chỉ chạy `pnpm db:migrate:deploy`.

Không dùng `prisma db push` cho bất kỳ môi trường dùng chung nào; không áp dụng tay các file SQL cũ vào database.
CI kiểm tra migration áp dụng được trên database mới và `schema.prisma` không lệch so với migrations.

## Biến môi trường

| Biến                | Dùng bởi                 | Ghi chú                                                         |
| ------------------- | ------------------------ | --------------------------------------------------------------- |
| `POSTGRES_*`        | Docker Compose           | Chỉ cho PostgreSQL local                                        |
| `DATABASE_URL`      | Prisma CLI, API          | Bắt buộc với API                                                |
| `PORT`              | API                      | Mặc định `3001`                                                 |
| `API_URL`           | Web (server-side)        | Mặc định `http://localhost:3001`; **bắt buộc đặt** khi deploy   |

Local dev đọc `.env` ở thư mục gốc (API qua `node --env-file-if-exists`, Prisma qua `prisma.config.ts`).
Trên server, đặt biến môi trường thật và không tạo file `.env`.

## CI

`.github/workflows/ci.yml` chạy trên mỗi pull request và push vào `main`:
install (frozen lockfile) → lint → typecheck → test → build → `prisma migrate deploy` trên PostgreSQL mới → kiểm tra drift schema/migration.
