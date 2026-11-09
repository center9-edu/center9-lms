# Center9Edu LMS architecture

A modular monolith in one pnpm workspace: one NestJS API, one Next.js frontend, and one shared database package.

```text
Browser ──HTTP──▶ apps/web (Next.js) ──HTTP──▶ apps/api (NestJS) ──Prisma──▶ PostgreSQL
                                                    │
                                                    └── imports @center9/database
```

## Boundaries

- **Only `apps/api` may import `@center9/database`.** `apps/web` gets its data through the REST API.
  ESLint blocks `@center9/database` and `@prisma/*` in `apps/web`.
- **Never return Prisma models directly from the API.** Each endpoint defines its own response type (DTO) and maps from the model,
  so that a schema change (adding a sensitive column such as `passwordHash`) cannot accidentally leak to clients.
- New business modules (classes, assignments, …) are NestJS modules in `apps/api/src/<module>/`.
  Extract a separate package only when two or more places need to share the code.

## Technical decisions

| Decision | Reason |
| --- | --- |
| Node.js 24 LTS, pnpm 11.10.0 | Node 24 is Active LTS and has built-in `--env-file` and `process.loadEnvFile`. pnpm is pinned through `packageManager` so the whole team and CI use the same version. |
| No Turborepo | There are only 3 packages, and `pnpm -r` already runs in dependency order. Consider adding it when build or CI becomes slow and caching is needed. |
| ESM everywhere (`"type": "module"`) | NestJS 12 and its official template are ESM, and the Prisma 7 `prisma-client` generator emits ESM. Internal imports use the `.js` extension. |
| TypeScript 6.0 | typescript-eslint and the NestJS CLI do not support TypeScript 7 yet. |
| Prisma 7 + `@prisma/adapter-pg` | Prisma 7 requires a driver adapter, and the connection config lives in `prisma.config.ts`. A 5s pool timeout keeps requests and health checks from hanging when the database is down. |
| `@center9/database` builds to `dist/` | The API runs compiled `dist` with no dependency on a TS runtime. `postinstall` generates and builds automatically, so everything runs right after `pnpm install`. |
| Prisma Client is not committed | It is generated from `schema.prisma` on install, which avoids large diffs and version mismatches. |
| Health: `/health` and `/health/ready` | Liveness does not touch the database, so an orchestrator does not restart the API when the database is flaky. Readiness runs `SELECT 1`. Responses contain status only; error details go only to the logs. |
| Vitest for the API | The NestJS 12 default; fast, with built-in ESM support. |
| One ESLint config at the root | One `pnpm lint` command for the whole repository; Next.js rules apply only to `apps/web`. |
| PostgreSQL 18, bound to `127.0.0.1` | The latest stable release; the database port is not exposed to the LAN. |
| Server-side sessions for login | A random token, with only its SHA-256 hash stored in `auth_sessions`, so sessions can be revoked immediately. See [Authentication and authorization](#authentication-and-authorization). |
| Roles are an enum, permissions live in code | `SUPER_ADMIN`, `CENTER_ADMIN`, `SALES`, `TEACHER`, `STUDENT`, `PARENT`. There are no `roles`/`permissions` tables because permissions do not need to change at runtime yet. An assistant is a `TEACHER` with `class_teachers.role_in_class = ASSISTANT`. |
| Lessons are divided into parts | `lessons.part_count` sets the number of parts in the curriculum. `class_session_lessons` links sessions and lessons many-to-many, and each row records a `part_number`. |
| One enrollment row per student and class | `DROPPED` means the student really left and cannot return to the class. `REMOVED` means taken off the class (for example by mistake); restoring reuses the same row, so attendance is kept. |
| Judge0 runs student code | Self-hosted on a dedicated VM, reachable only from `apps/api`. Local development uses an unsandboxed fake, and the real instance has not been verified yet; see [`infra/judge0/README.md`](../../infra/judge0/README.md). |
| Public `/luyen-tap` demo lives in the LMS | An exception to "marketing lives in `center9-website`": the landing page links here so the demo can grow into the LMS. It stays public (`@Public()`) so the landing page can link to it without an account, and it is limited by IP and by concurrent runs in memory, which is only correct for one API instance. |
| Practice problems live in code | `apps/api/src/coding-practice/problems.ts`, with no tables or stored results, so the demo keeps no student data. Add the planned code grading tables when teachers need to author problems or results must be saved. |
| Tailwind CSS v4 for `apps/web` | Replaced three CSS Modules that each copied the same brand colors. The colors are `@theme` tokens in `apps/web/app/globals.css` (`bg-primary`, `text-muted`, …). Repeated class strings live in `app/ui/styles.ts` and small components in `app/ui/`, only once two or more places use them; there is no component library. |
| Signed-in pages share the `(app)` route group | `app/(app)/layout.tsx` checks the session and renders the shell with a role-filtered menu; URLs do not change. Each page still calls `requireUser(roles)`, because hiding a menu item is not access control. Login, password change and the public `/luyen-tap` stay outside the shell. |
| Mock screens for classes and attendance | The demo needs class screens before their API exists. All fake data lives in `apps/web/app/lib/demo-data.ts` (types mirror the Prisma enums, no `apiFetch`), every screen using it shows `DemoBanner` or a "Demo" badge, and nothing is saved. When the classes API lands, delete the file and replace each compile error with an API call. |

## Authentication and authorization

```text
Browser ──cookie c9_session (httpOnly)──▶ apps/web ──Authorization: Bearer <token>──▶ apps/api AuthGuard ──▶ auth_sessions
```

| Decision | Reason |
| --- | --- |
| The browser only talks to `apps/web` | `apps/web` keeps the session token in an httpOnly, `SameSite=Lax` cookie (`Secure` in production) and forwards it as a Bearer token. Client components never see it; Server Actions reject foreign origins. |
| Default deny | A global `AuthGuard` (`APP_GUARD`) requires a session on every endpoint unless it is marked `@Public()`. `@Roles(...)` restricts by role. `auth.module.spec.ts` fails if the guard is unwired. |
| Session lifetime | Ends after 7 idle days, extended at most once a day while used, and never more than 30 days after login. Roles and account status are read on every request, so changes apply at once. |
| Passwords hashed with `node:crypto` scrypt | No new dependency. N=2^15, r=8, p=3 (an OWASP option, ~32 MiB, ~180 ms). Parameters are stored in each hash, so they can be raised later. |
| Accounts are created by admins | No sign-up. New accounts and password resets get a temporary password shown once; until it is changed, only `/auth/me`, `/auth/logout` and `/auth/password` (`@AllowPendingPasswordChange()`) work. The first `SUPER_ADMIN` comes from the `create-super-admin` script. |
| Login throttling in memory | 5 failed logins per username and IP, and 50 per IP, block for 15 minutes; checked before scrypt runs. Like the `/luyen-tap` limits, this is only correct for one API instance. |
| No user enumeration | Unknown usernames are checked against a dummy hash and get the same 401 as a wrong password. A locked account is only reported after the right password. |

Rules for account administration (`/users`, `apps/api/src/users/`):

- `SUPER_ADMIN` and `CENTER_ADMIN` manage accounts. Only a `SUPER_ADMIN` grants `SUPER_ADMIN`/`CENTER_ADMIN` or changes an account that holds one.
- Nobody changes their own account through `/users`; they use `/auth/password`.
- At least one active `SUPER_ADMIN` must remain. Changes run in serializable transactions so two admins cannot demote each other at once; the loser gets `409`.
- Password resets and locks revoke the user's sessions. Every change is written to `audit_logs` with role and status values only.

## Coding practice flow

```text
center9-website ──link──▶ apps/web /luyen-tap ──server action──▶ apps/api ──HTTP──▶ Judge0
```

- **Rate limiting:** `apps/web` forwards the client IP as `X-Client-Ip`. The API must therefore be reachable only from `apps/web`, and the proxy in front of `apps/web` must overwrite `X-Forwarded-For`, or clients could forge their IP.
- **Privacy:** submitted code can contain personal information. The API does not log or store it, and deletes each submission from Judge0 after grading.
- **Hidden tests:** responses contain only their verdict, never their input or output.

## Migrations

- See [`database.md`](database.md) for the table structure and hand-written constraints.
- Migrations live in `packages/database/prisma/migrations/`, are created with `prisma migrate dev`, and are applied with `prisma migrate deploy`.
- Do not use `prisma db push` for shared environments.
- Legacy SQL schemas (if any) are not applied directly; port them gradually into Prisma models and reviewed migrations.
- Prisma cannot express `CHECK` constraints and partial unique indexes, so they are written by hand in the migration file, at the end under `Hand-written`. Prisma ignores these constraints when comparing schemas, so CI does not notice if one is missing.

## Rules the API must enforce

The database does not guarantee the following rules:

- **Enrollment status changes:** `REMOVED` to `ACTIVE` is allowed and must clear `left_at`. `DROPPED` to `ACTIVE` is only for admin corrections, with a reason. Every change is recorded in `audit_logs`.
- **Session and lesson links:** the lesson must belong to the class's course version, and `part_number <= part_count`.
- **Progress:** a lesson is complete when every part is linked to a `COMPLETED` session; compute this with a query, not a stored column.
- **Capacity:** count only `ACTIVE`, and check inside a transaction that locks the class row.
- **Published versions:** do not allow edits, including `part_count`, so class progress stays correct.
- **DTOs:** never return `password_hash` or `token_hash`; do not return `student_profiles.notes` to students or parents.
- **`audit_logs.metadata`:** must not contain personal data.
