# Bidding Strategy Agent (Self-Evolving Bid Agent)

An AI bidding assistant that automatically generates bid/tender documents from an uploaded tender file, and turns every manual revision into its own experience for future projects.

Core philosophy: **One Agent + Toolset + Self-Evolving Loop** — no sprawling microservices or multi-agent pipelines.

## Architecture

```
apps/server      NestJS + TypeORM + MySQL/SQLite
apps/web         React 18 + Vite + Ant Design
packages/shared  Zod schemas / enums shared between frontend and backend
docs/            Design documents and implementation specs (recommended reading)
```

## Quick Start (one command, single port, zero-dependency SQLite by default)

```bash
pnpm install
pnpm dev
```

Open **http://localhost:3000/** and you'll see the frontend; the `/api/v1` path on the same port serves the backend API.

`pnpm dev` will:

- Build the frontend on first run; the backend serves it and listens on port 3000 (single port, no CORS issues);
- Keep `vite build --watch` running to rebuild the frontend on source changes — just refresh the page to see the latest build;
- For Vite native HMR, open a separate terminal and run `pnpm dev:web` (http://localhost:5173, with `/api` proxied to the backend).

The backend auto-detects `apps/web/dist` as the frontend directory; you can also set the `WEB_DIST` environment variable to point elsewhere.
For custom configuration, copy `apps/server/.env.example` to `apps/server/.env` before running `pnpm dev`.

> `pnpm start` is an alias for `pnpm dev`.

Default accounts:
- Administrator: `admin / admin123`
- Bidding specialist: `user / user123`

> Without `LLM_API_KEY`, the system automatically falls back to the Mock Provider and produces structurally complete demo content offline.

## Database (zero-dependency SQLite / optional MySQL)

By default the app uses an embedded **SQLite** (`better-sqlite3`): the database directory and file are **created automatically, tables are auto-created, and seed data is written on first launch** — no extra installation required.

| Config | Description |
|------|------|
| `DB_TYPE=sqlite` | Default. Uses embedded SQLite |
| `SQLITE_FILE=data/dev.db` | Database file path; relative paths resolve from the working directory, and missing directories/file are created recursively |
| `DB_TYPE=mysql` | Switch to MySQL 8 (`DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`) |

- The SQLite connection enables `WAL` logging, foreign keys, and a 5s `busy_timeout`;
- Table schemas are created automatically via TypeORM `synchronize`;
- On first launch the default tenant, admin account, sample memories, and skills are seeded automatically;
- Startup logs print the actual database file path;
- Visit `GET /api/v1/system/db` to inspect the current driver, file path, file size, and existence.

The desktop local mode always uses SQLite, with data stored in the user data directory (see `desktop/README.md`), created automatically on first launch.

## Model Configuration (encrypted at rest)

Model configuration lives in the `t_llm_config` table. **A tenant can store multiple model profiles** and mark one as the default. The **API Key is encrypted with AES-256-GCM before being stored**, and both the API and the page only ever return masked values (e.g. `****7890`).

- The encryption key comes from `APP_SECRET` (falls back to `JWT_SECRET` when unset); in production be sure to set and securely store a dedicated key — **changing it after the fact will make historical ciphertext undecryptable**.
- Resolution priority: **tenant default enabled config → environment variables → offline Mock**; without an API Key the system falls back to Mock and stays fully usable offline.
- Admin endpoints (require the `ADMIN` role):
  - `GET /api/v1/llm-config` — list all profiles (masked) plus the active one
  - `POST /api/v1/llm-config` — create
  - `PUT /api/v1/llm-config/:id` — update (`apiKey` empty string clears it; omitting it keeps the current one)
  - `DELETE /api/v1/llm-config/:id` — delete (if it was default, another profile is promoted)
  - `POST /api/v1/llm-config/:id/default` — set as default
  - `POST /api/v1/llm-config/test` — connectivity test (optional `id` or temporary key/baseUrl)
- You can also manage multiple profiles and the default on the frontend "System Settings" page.

## Production Deployment

```bash
docker compose up -d
```

Environment variables (server):
- `DB_TYPE=mysql|mysql8` — MySQL recommended in production
- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` — OpenAI-compatible protocol
- `JWT_SECRET` — change in production
- `UPLOAD_DIR` — file upload directory
- `AGENT_AUTO_CONTINUE` — default `true`: skips human checkpoints (demo mode)

## Desktop App (self-contained local runtime)

No deployment, no database server — install and run:

```bash
pnpm desktop:install    # Install desktop dependencies (electron / electron-builder)
pnpm desktop:prepare    # Build shared/server/web and stage the runtime (downloads an embedded Node on first run)
pnpm desktop:dev        # Launch the desktop app locally

pnpm desktop:dist       # Package an installer for the current platform → desktop/release/
```

- **Local mode (default)**: an embedded Node starts the backend, SQLite data lives in the user directory, and the frontend is served by the backend on a single port.
- **Remote mode**: switch to a remote console via menu "Mode → Set Remote Console Address…".
- See [`desktop/README.md`](desktop/README.md) for details.

To skip downloading the embedded Node, use `BIDSTRAT_SKIP_NODE=1 pnpm desktop:prepare` (falls back to the system Node during development).

## Automated Releases (GitHub Actions)

Aligned with the `huohuo-drama` release model: pushing **main / master** (or manually running the workflow) auto-bumps the version and publishes.

```bash
git push origin main
# or: Actions → Release → Run workflow
```

It automatically:
1. Bumps **patch +1** from the latest `v*` / `x.y.z` tag (first release is `v1.0.0`);
2. Builds server / web Docker images, ships `*-linux-amd64.tar.gz`, and on release pushes to GHCR  
   (`ghcr.io/<owner>/bidstrat-agent-server`, `bidstrat-agent-web`);
3. Packages desktop installers on Windows / macOS / Linux (NSIS, dmg/zip, AppImage/deb);
4. Aggregates artifacts into a **GitHub Release**.

PRs and non-trunk branches only build artifacts — **no GHCR push, no Release**.

`.github/workflows/ci.yml` runs `pnpm -r typecheck` and `pnpm -r build` on every push / PR.

## The Self-Evolving Loop

```
Human finalization → auto-collect diff & classify (accepted / minor / major / rewrite)
        ↓
Project archived → retrospective distills experience cards (PENDING)
        ↓
Double gate: evaluation regression passes → human approval (APPROVED)
        ↓
SEMANTIC_MEMORY / SKILL / EPISODIC_MEMORY version upgrade, old versions DISABLED
        ↓
One-click rollback
```

## Core Philosophy

> **Complexity must be forced out by real load, not designed up-front.**
> Until then, a self-evolving Agent, a monolith, and a single MySQL is the best architecture.

## Evolution Triggers

| Trigger | Consider introducing |
|---|---|
| KB chunking > 100K | MySQL VECTOR / dedicated vector store |
| Parsing tasks bog down the main process | Extract parsing into a worker |
| Concurrent generation > 50 projects | K8s + job queue |
| A real need for parallel heterogeneous reasoning | Re-evaluate multi-agent |

## API Overview

| Module | Key endpoints |
|---|---|
| Auth | `POST /api/v1/auth/login` |
| Projects | `/projects` `/projects/:id` `/projects/:id/run` `/projects/:id/events (SSE)` `POST /projects/:id/export` `GET /projects/:id/export/download` `/projects/:id/close` |
| Model config | `GET /llm-config` `POST /llm-config` `PUT /llm-config/:id` `DELETE /llm-config/:id` `POST /llm-config/:id/default` `POST /llm-config/test` |
| Tender docs | `POST /tender-docs/upload` |
| Requirements | `/requirements` `PUT /requirements/batch/confirm` |
| Response matrix | `/responses` |
| Sections | `/sections` `POST /sections/:id/rewrite` `POST /sections/:id/review` `PUT /sections/:id/feedback` |
| Memories | `/memories` `/memories/:id/disable` |
| Skills | `/skills` `POST /skills/:id/rollback` |
| Experience cards | `/experience-cards` `/experience-cards/:id/approve` `/:id/reject` |
| Knowledge base | `/kb/assets` `/kb/search` |
| Agent | `/agent-runs` `/agent-runs/:id` |
| Audit | `/audit` |
| Model config | `GET /llm-config` `POST /llm-config` `PUT /llm-config/:id` `DELETE /llm-config/:id` `POST /llm-config/:id/default` `POST /llm-config/test` |
| System | `GET /health` `GET /system/db` |

## License

Internal use only.