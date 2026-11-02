# Center9Edu LMS

Learning management system for the Center9Edu technology education center.
The landing page lives in the separate `center9-website` repository.

| Component           | Package             | Technology                             |
| ------------------- | ------------------- | -------------------------------------- |
| `apps/web`          | `@center9/web`      | Next.js 16 (App Router), React 19      |
| `apps/api`          | `@center9/api`      | NestJS 12 (REST, ESM)                  |
| `packages/database` | `@center9/database` | Prisma 7 + PostgreSQL (driver adapter) |
| `infra/docker`      | –                   | PostgreSQL 18 for local development    |

Architecture and conventions: [docs/architecture/README.md](docs/architecture/README.md).

## Requirements

- **Node.js 24 LTS** (`>=24.11`, see `.nvmrc`)
- **pnpm 11.10.0** (pinned in `packageManager`, enabled through Corepack)
- Docker Desktop (or Docker Engine + Compose v2)

```bash
nvm use            # or install Node 24 however you prefer
corepack enable    # use the exact pnpm version declared in package.json
```

## Run locally from scratch

```bash
git clone <repo-url> center9-lms && cd center9-lms

# 1. Environment variables (local only; .env is gitignored)
cp .env.example .env

# 2. Install dependencies – also runs prisma generate and builds @center9/database
pnpm install

# 3. Start PostgreSQL (waits until healthy)
pnpm db:up

# 4. Apply migrations
pnpm db:migrate:deploy

# 5. Run API + web
pnpm dev
```

Check that it works:

- Web: <http://localhost:3000> – shows “API và database sẵn sàng”
- API liveness: `curl localhost:3001/health` → `{"status":"ok"}`
- API readiness (checks the database): `curl localhost:3001/health/ready` → `{"status":"ok","database":"up"}`
  (returns `503` with `{"status":"error","database":"down"}` when the database is unreachable)

Stop the database: `pnpm db:down` (data stays in the `center9-lms_postgres-data` Docker volume).

## Scripts (run from the repository root)

| Command                  | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `pnpm dev`               | Run the API (watch, port 3001) and web (port 3000) in parallel        |
| `pnpm build`             | Build every package in dependency order                               |
| `pnpm lint`              | ESLint for the whole repository (one config at the root)              |
| `pnpm typecheck`         | `tsc --noEmit` for each package                                       |
| `pnpm test`              | Vitest for the API                                                    |
| `pnpm db:up` / `db:down` | Start / stop local PostgreSQL                                         |
| `pnpm db:generate`       | Regenerate Prisma Client and build `@center9/database` after a schema change |
| `pnpm db:migrate:dev`    | Create a new migration from `schema.prisma` changes (local only)      |
| `pnpm db:migrate:deploy` | Apply committed migrations (for CI, staging, production)              |
| `pnpm db:migrate:status` | Show migration status                                                 |

## Changing the database

1. Edit `packages/database/prisma/schema.prisma`.
2. `pnpm db:migrate:dev --name <change_name>` – creates the SQL file in `prisma/migrations/` and applies it to the local database.
3. Review the generated SQL file and commit it together with the schema change.
4. Other environments only run `pnpm db:migrate:deploy`.

Do not use `prisma db push` for any shared environment, and do not manually apply legacy SQL files to a database.
CI checks that migrations apply to a fresh database and that `schema.prisma` has not drifted from the migrations.

## Environment variables

| Variable            | Used by                  | Notes                                                           |
| ------------------- | ------------------------ | --------------------------------------------------------------- |
| `DATABASE_URL`      | Prisma CLI, API          | Required by the API                                             |
| `PORT`              | API                      | Defaults to `3001`                                              |
| `API_URL`           | Web (server-side)        | Defaults to `http://localhost:3001`; **must be set** on deploy  |

Local PostgreSQL settings are fixed in `infra/docker/compose.yaml` (port `5433`), not read from `.env`. The default `DATABASE_URL` in `.env.example` matches them.

Local development reads `.env` from the repository root (the API through `node --env-file-if-exists`, Prisma through `prisma.config.ts`).
On a server, set real environment variables and do not create a `.env` file.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:
install (frozen lockfile) → lint → typecheck → test → build → `prisma migrate deploy` on a fresh PostgreSQL → schema/migration drift check.
