# CLAUDE.md — Center9Edu LMS

## 1. Project Overview

**Project:** Center9Edu LMS
**Repository:** `center9-lms`
**Purpose:** Learning management system for Center9Edu, a technology education center for children and teenagers in Vietnam. Classes are mostly held offline; the LMS supports them.

This repository contains only the LMS and its related components. The public marketing website lives in the separate `center9-website` repository.

The team is 2–4 developers. Prefer a simple modular monolith that is easy to understand and maintain.

## 2. Tech Stack

- **Runtime:** Node.js 24 LTS (see `.nvmrc`, `engines`)
- **Package Manager:** pnpm 11 workspace, pinned via `packageManager` (use Corepack)
- **Language:** TypeScript 6.0 (strict mode), ESM everywhere (`"type": "module"`)
- **Frontend:** Next.js (App Router), React — `apps/web`
- **Backend:** NestJS REST API — `apps/api`
- **Database:** PostgreSQL + Prisma ORM (driver adapter `@prisma/adapter-pg`) — `packages/database`
- **Testing:** Vitest (API)
- **Linting:** ESLint flat config at the repository root
- **Local infrastructure:** Docker Compose for PostgreSQL — `infra/docker`
- **CI:** GitHub Actions — `.github/workflows/ci.yml`

Always follow the versions and configurations defined in the repository.

Do not introduce new frameworks, state management libraries, queues, caches, or major dependencies (for example Redis, BullMQ, Judge0, Turborepo, an auth library) without explaining the need and obtaining approval.

## 3. Project Architecture

```text
apps/
├── web/                  # @center9/web — Next.js LMS frontend
└── api/                  # @center9/api — NestJS REST API
packages/
└── database/             # @center9/database — Prisma schema, migrations, Prisma Client
infra/
└── docker/               # PostgreSQL for local development
docs/
└── architecture/         # Architecture notes and technical decisions
.github/
└── workflows/            # CI
```

Request flow: browser → `apps/web` → HTTP → `apps/api` → Prisma → PostgreSQL.

See [`docs/architecture/README.md`](docs/architecture/README.md) for the rationale behind the main technical decisions. Update it when a decision changes.

Create folders, packages, and modules only when the first real file needs them. Do not create empty directories or placeholder abstractions for the future.

### Directory Responsibilities

**`apps/api`**
- Business features are NestJS modules in `apps/api/src/<feature>/` (for example `classes/`, `assignments/`).
- A feature module owns its controller, service, DTOs, and tests.
- Controllers handle HTTP concerns only; business logic lives in services.
- `PrismaService` (`src/prisma.service.ts`) is the only way the API talks to the database. Extract it into a `@Global()` `PrismaModule` when the first feature module needs it.

**`apps/web`**
- Next.js routes, layouts, and UI.
- Fetches data from the API over HTTP. Never accesses the database.
- Keep `page.tsx` and `layout.tsx` focused on composition.

**`packages/database`**
- `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, and `src/index.ts`.
- `src/index.ts` is the package's only public entry point.
- The generated client (`src/generated/`) and `dist/` are build output. Never edit or commit them.

**New packages**
- Add a package under `packages/` only when code is genuinely shared by two or more apps. Name it `@center9/<name>`.

## 4. Coding Conventions

### TypeScript

- Use TypeScript strict mode.
- Prefer explicit, meaningful types.
- Avoid `any`; use `unknown` when appropriate.
- Prefer type inference when the intent is clear.
- Avoid unnecessary type assertions.
- ESM with `nodenext` resolution in `apps/api` and `packages/database`: relative imports **must** include the `.js` extension (`import { X } from './x.js'`).

### Naming

- Directories: `kebab-case`
- Files: `kebab-case.ts` / `kebab-case.tsx`
- NestJS files use the role suffix: `classes.module.ts`, `classes.controller.ts`, `classes.service.ts`, `create-class.dto.ts`, `classes.service.spec.ts`
- React components and classes: `PascalCase`
- Variables and functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE` for true constants
- Types and interfaces: `PascalCase`
- Prisma models: `PascalCase` singular; tables and columns mapped to `snake_case` with `@@map` / `@map`

### NestJS

- Use constructor injection.
- Throw NestJS HTTP exceptions (`NotFoundException`, `BadRequestException`, …) for expected errors.
- Validate request bodies, params, and query strings at the controller boundary.
- **Never return Prisma models directly from an endpoint.** Define a response type/DTO and map explicitly, so new columns (for example `passwordHash`) cannot leak to clients.
- Error responses must not include stack traces, SQL, connection strings, or internal hostnames. Log details server-side instead.

### React and Next.js

- Use React Server Components by default.
- Add `"use client"` only when client-side functionality is required, and keep client boundaries small.
- Avoid unnecessary `useEffect`, `useMemo`, and `useCallback`.
- Do not introduce global state management for local component state.
- Use `next/link` for internal navigation and `next/image` for appropriate image assets.
- Prefer semantic HTML and accessible components.
- Server-only values (for example `API_URL`) must not be exposed to client components.
- Next.js in this repo is newer than most training data. Check `apps/web/node_modules/next/dist/docs/` before using an unfamiliar API (see `apps/web/AGENTS.md`).

### Database and Prisma

- Change the schema only in `packages/database/prisma/schema.prisma`.
- Create migrations with `pnpm db:migrate:dev --name <change_name>`, review the generated SQL, and commit it together with the schema change.
- Apply migrations outside local development only with `pnpm db:migrate:deploy`.
- Never use `prisma db push` as a migration workflow for shared environments.
- Never edit a migration that has already been merged; add a new migration instead.
- Do not apply legacy SQL schemas or ad-hoc SQL to any database. Port them into Prisma models and reviewed migrations.
- Keep migrations small and focused, and make sure they apply to a fresh database.
- After changing the schema, run `pnpm db:generate` so the API sees the new types.
- Use the Prisma query API. Use raw SQL only when necessary, and always through tagged templates (`$queryRaw\`...\``), never string concatenation.

## 5. Import Boundaries

Follow these rules:

- Only `apps/api` may depend on `@center9/database`. ESLint blocks `@center9/database` and `@prisma/*` imports in `apps/web`.
- `apps/web` must not import code from `apps/api`, and the reverse is also forbidden. Apps communicate only over HTTP.
- Import workspace packages by name (`@center9/database`), never by relative path into another package.
- Use only a package's public entry point; do not deep-import its internal files.
- Inside `apps/api`, a feature module must not import another feature's internal files; use the exported service of that module.
  Exception: `apps/api/src/auth/auth.decorators.ts` (`@Public`, `@Roles`, `@AllowPendingPasswordChange`, `@CurrentSession`) is the auth module's public API; every module may import it.
- Avoid circular dependencies.

## 6. Commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies; also generates and builds `@center9/database` |
| `pnpm db:up` / `pnpm db:down` | Start / stop local PostgreSQL |
| `pnpm dev` | Run API (port 3001) and web (port 3000) |
| `pnpm lint` | ESLint for the whole repository |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Run tests |
| `pnpm build` | Build every package in dependency order |
| `pnpm db:generate` | Regenerate the Prisma Client after a schema change |
| `pnpm db:migrate:dev --name <name>` | Create and apply a migration locally |
| `pnpm db:migrate:deploy` | Apply committed migrations |
| `pnpm db:migrate:status` | Show migration status |
| `pnpm db:seed` | Create fake test accounts in an empty local database (refuses a non-local `DATABASE_URL` or existing accounts) |

Run a script in one package with `pnpm --filter @center9/<name> <script>`.

## 7. Content and Language

- User-facing UI text should primarily be in Vietnamese.
- Code, identifiers, comments, and technical documentation should be in English.
- Keep UI text understandable for students, parents, and teachers.
- Do not invent business rules, grading policies, schedules, or fees. Ask when they are not specified.

## 8. Dependency Management

- Always use `pnpm`. Add a dependency to the package that uses it (`pnpm --filter @center9/<name> add <dep>`), not to the root, unless it is root tooling.
- Check existing dependencies before installing new ones.
- Prefer built-in Node.js, NestJS, Next.js, and React capabilities.
- Do not introduce a library for trivial functionality.
- Do not upgrade major dependency versions unless requested.
- Keep `prisma`, `@prisma/client`, and `@prisma/adapter-pg` on the same exact version.
- Dependency build scripts are blocked by default; allow one only in `allowBuilds` in `pnpm-workspace.yaml`, and only when it is required.
- Keep `pnpm-lock.yaml` synchronized with `package.json`.

## 9. Development Workflow

Before implementing a task:

1. Understand the requirement and expected behavior.
2. Inspect the relevant existing files.
3. Follow established patterns and conventions.
4. Identify the smallest reasonable change.
5. Ask for clarification when requirements are materially ambiguous.

During implementation:

1. Keep changes focused on the requested task.
2. Reuse existing utilities, services, and components.
3. Avoid unrelated refactoring.
4. Maintain type safety, security, and accessibility.
5. Do not create unnecessary abstractions.
6. Add or update tests for non-trivial logic, and update documentation when appropriate.

After implementation:

1. Review the changes.
2. Run the relevant checks (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`).
3. For schema changes, confirm the migration applies (`pnpm db:migrate:dev` or `pnpm db:migrate:deploy` on a fresh database).
4. Fix errors introduced by the change.
5. Report what was changed.
6. Mention any checks that could not be run (for example, when Docker or the database is unavailable).
7. Identify remaining risks or follow-up work.

Never claim that tests passed unless they were actually executed.

## 10. Git Conventions

Use Conventional Commits:

- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code restructuring without behavior changes
- `chore:` Maintenance
- `docs:` Documentation
- `test:` Tests
- `style:` Formatting or non-functional styling changes

An optional scope may name the affected package: `feat(api): ...`, `fix(web): ...`, `feat(database): ...`.

Examples:

- `feat(api): add classes module`
- `feat(database): add classes table`
- `fix(web): handle API timeout on dashboard`
- `chore: configure CI workflow`

Keep commits focused and descriptive. A schema change and its migration belong in the same commit.

Do not commit, push, force-push, create pull requests, or modify remote branches unless explicitly requested.

AI assistants never commit on their own, even when a skill or workflow (for example `/build`) includes a commit step. Leave changes uncommitted for human review, and commit only when the user asks for it in their current message.

Planning artifacts (`tasks/`, for example `tasks/plan.md` and `tasks/todo.md`) are local working files: they are gitignored and must not be committed.

### Protected Branches

`main`, `staging`, and `dev` are protected. Changes reach them only through pull requests.

When asked to commit or push, an AI assistant must first check the current branch (`git branch --show-current`). If it is a protected branch:

1. Stop. Do not commit or push.
2. Warn the user that direct commits to `main`, `staging`, and `dev` are not allowed.
3. Propose a branch name (see Branch Naming) and create it with `git switch -c <branch>` only after the user confirms. Uncommitted changes carry over to the new branch.
4. Commit on the new branch, then open a pull request when requested.

Never force-push, rebase, or reset a protected branch.

Exception: the initial commit of an empty repository, only with explicit user confirmation.

### Branch Naming

> Proposed convention — not yet finalized by the team. Follow it until it is replaced.

Format: `<type>/<short-description>`

- `<type>` matches the Conventional Commit types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`. Use `hotfix` for urgent production fixes.
- `<short-description>`: lowercase `kebab-case`, ASCII only (no Vietnamese diacritics), 2–5 words.
- Optional ticket ID first: `<type>/<ticket-id>-<short-description>`.

Examples:

- `feat/classes-module`
- `fix/health-check-timeout`
- `chore/ci-workflow`
- `feat/c9-42-attendance-api`
- `hotfix/migration-deploy`

Pull request target branch: to be decided (e.g. `dev`, promoted to `staging` and then `main`). Ask the user when unclear.

## 11. Security

The LMS stores personal data of children and teenagers. Treat it with care.

- Never expose secrets or private credentials.
- Never commit `.env` files. Only `.env.example` with placeholder values is committed.
- Validate untrusted input at the API boundary; do not trust client-side validation alone.
- Never log passwords, tokens, or personal information (names, emails, phone numbers, dates of birth).
- Do not expose server-only environment variables to client components.
- Health endpoints return status only — no versions, hostnames, or error details.
- Keep the local database bound to `127.0.0.1`.
- Every API endpoint requires a session unless it is marked `@Public()`; restrict by role with `@Roles(...)`. Do not add another authentication mechanism, and do not mark an endpoint `@Public()` without approval. See the authentication section of [`docs/architecture/README.md`](docs/architecture/README.md).
- In `apps/web`, protect pages with `requireUser()` from `app/lib/session.ts` and call the API through `apiFetch()`, which forwards the session. The session token stays in an httpOnly cookie and never reaches client components.
- Do not bypass security checks to make a feature work.

## 12. AI Assistant Rules

When working in this repository:

- Inspect existing code before proposing changes.
- Follow project conventions over generic preferences.
- Prefer simple, readable, maintainable solutions.
- Explain significant architectural decisions.
- Do not overengineer.
- Do not create speculative features, modules, or packages.
- Do not modify unrelated files.
- Do not silently change public APIs, response shapes, or established behavior.
- Do not remove existing functionality without explicit approval.
- Do not create empty directories or placeholder files without a clear purpose.
- Do not add dependencies without justification.
- Do not assume requirements that have not been confirmed.
- Never run destructive database commands (`prisma migrate reset`, dropping tables, `docker compose down -v`) without explicit confirmation.

For complex tasks, provide a short implementation plan before editing code.

For small, well-defined tasks, implement directly.

## 13. Definition of Done

A task is considered complete when:

- The requested behavior is implemented.
- Code follows repository conventions and import boundaries.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass, when runnable.
- Schema changes include a reviewed migration that applies to a fresh database.
- API responses use explicit DTOs, not Prisma models.
- Accessibility and responsive behavior are considered where applicable.
- No unrelated changes are included.
- The implementation is understandable and maintainable.

## 14. Guiding Principles

1. Simplicity over unnecessary complexity.
2. Maintainability over cleverness.
3. Modular monolith: clear module boundaries inside one API.
4. The database is accessed only through the API.
5. Migrations are reviewed, versioned, and repeatable.
6. Reusability without premature abstraction.
7. Security and privacy by design — the users are minors.
8. Consistency with existing code over personal preference.
9. Human review remains the final authority for architectural and security decisions.
