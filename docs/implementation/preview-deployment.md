# Local and Preview Deployment

Task: `INT-09`

Current phase (2026-10-16): Only the local/preview **configuration code** in INT-18 is development scope. Do not deploy, run public smoke tests, reset a shared database, or open the user's browser during the development-first goal. Sections 2–7 are a later operator/QA runbook, not required evidence for `development complete / QA pending`. Preserve existing preview accounts and data.

Status note (2026-10-16): the checked-in `start_preview.sh` runs migrations, then invokes `--scenario A-12-base --install-if-missing` and `--scenario fleet-scale --install-if-missing`; `render.yaml` uses `RIPPLE_ENVIRONMENT=preview` so both synthetic scenarios are eligible in the preview profile. The checked-in configuration is not proof that the current public deployment runs this build. Editing checked-in configuration is not authorization to deploy or mutate Render/Supabase/Vercel.

This setup gives Ripple two explicit runtime profiles without changing the product API contract.

| Concern | Local | Shareable preview | Intended GCP target |
|---|---|---|---|
| Frontend | Vite on `localhost:5173` | Vercel static Vite build | Firebase Hosting |
| API | FastAPI on `localhost:8000` | Render free Docker web service | Cloud Run |
| Database | PostgreSQL 16 in Docker | Supabase PostgreSQL | Cloud SQL for PostgreSQL |
| API routing | Vite proxies `/api` | `VITE_API_BASE_URL` selects the API origin | Hosting rewrite or API origin |

The frontend always uses `/api/v1` paths. Only the origin changes. The backend remains the same Docker image and accepts PostgreSQL URLs through environment variables, so the preview profile does not create a second application architecture.

### Optional local/preview Gemini Developer extraction

Synthetic extraction remains the default. To opt in explicitly for a local or preview backend, set these non-secret names in the ignored local environment or the preview secret configuration:

```text
RIPPLE_MODEL_PROVIDER=gemini_developer
RIPPLE_INTAKE_MODEL=gemini-3.8-flash
RIPPLE_GEMINI_API_KEY=replace-with-secret-value
```

The key is backend-only and is never placed in `VITE_*`, browser storage, URLs, logs, seed data, or this repository. Extraction creates a model request only after a user starts extraction. A provider, credential, quota, or model-access failure is returned as an honest extraction error; it does not fall back to synthetic data. Staging and production use the existing `vertex` provider path.

For staging or production, select Vertex explicitly with secret-free settings such as:

```text
RIPPLE_MODEL_PROVIDER=vertex
RIPPLE_INTAKE_MODEL=replace-with-approved-vertex-model
RIPPLE_VERTEX_PROJECT=replace-with-gcp-project
RIPPLE_VERTEX_LOCATION=us-central1
```

## 1. Local profile

Prerequisites: Node/npm, `uv`, and Docker.

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
docker compose up -d postgres
uv run --project backend --frozen alembic -c backend/alembic.ini upgrade head
uv run --project backend --frozen uvicorn app.main:app --app-dir backend --reload --port 8000
```

In a second terminal:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
```

Open `http://localhost:5173`. Browser requests stay on the Vite origin and are proxied to `http://127.0.0.1:8000`; local CORS is also enabled for direct API testing.

## 2. Create the preview database in Supabase

1. Create a Supabase Free project in a region close to the API host.
2. Open **Connect**, select the shared pooler in **Session mode**, and copy its connection string. Session mode is suitable here because Render runs one long-lived container with SQLAlchemy's small application pool.
3. Replace its password placeholder, then store the complete value only as Render's `RIPPLE_DATABASE_URL` secret. The backend accepts `postgres://`, `postgresql://`, and `sslmode=require` and normalizes them for `asyncpg`.
4. Do not add Supabase browser keys to Vercel. The frontend does not access Supabase directly.

The Render startup command runs `alembic upgrade head`, then calls the seed CLI for each explicit synthetic scenario with `--install-if-missing` before starting Uvicorn. It verifies a newly installed graph but reports `skipped_existing` for an edited scenario without resetting it or requiring its baseline checksum. Operators use the separate strict `--verify` command when they intentionally want to compare against baseline. This is intentionally limited to the single-instance preview profile. Production migration and seed orchestration must be separated before horizontal scaling.

## 3. Create the API preview in Render

1. Push the repository to the Git provider you want Render to read. This repository contains `render.yaml`; no secret belongs in the commit.
2. In Render, choose **New > Blueprint** and select the repository.
3. Confirm the `ripple-api-preview` free web service.
4. Set these prompted values:

   - `RIPPLE_DATABASE_URL`: Supabase session-pooler URL with the real database password.
   - `RIPPLE_CORS_ORIGINS`: JSON array containing the stable Vercel URL, for example `["https://ripple-demo.vercel.app"]`.
   - `RIPPLE_CORS_ORIGIN_REGEX`: optional, narrow regex for this project's Vercel branch URLs, for example `^https://ripple-[a-z0-9-]+\\.vercel\\.app$`.

5. Deploy and verify `https://YOUR_RENDER_SERVICE.onrender.com/api/v1/health/ready` returns a successful response.

`render.yaml` keeps one worker, a small database pool, an external health check, `RIPPLE_ENVIRONMENT=preview`, and the synthetic provider default suitable for a demo preview. Do not treat a local config diff as an applied cloud change.

## 4. Create the frontend preview in Vercel

1. Import the same repository into Vercel.
2. Set **Root Directory** to `frontend`. The checked-in `vercel.json` supplies the Vite build and SPA fallback.
3. Add `VITE_API_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com` to both **Preview** and **Production** environments.
4. Deploy.
5. Copy the stable Vercel URL back into Render's `RIPPLE_CORS_ORIGINS`, then redeploy the API if it changed.

`VITE_*` values are compiled into browser JavaScript and are never secrets. Only the API base URL belongs there.

## 5. Acceptance smoke test

Run these after both services are deployed:

```powershell
Invoke-RestMethod https://YOUR_RENDER_SERVICE.onrender.com/api/v1/health/live
Invoke-RestMethod https://YOUR_RENDER_SERVICE.onrender.com/api/v1/health/ready
```

Then open the Vercel URL and verify:

1. No CORS errors appear in the browser console.
2. Demo scenarios load.
3. Reset succeeds for `A-12-base`.
4. A run can be created and its SSE trace appears.
5. Refreshing a nested route still renders the application.

## 6. Operational expectations

- Render free web services sleep after 15 minutes without inbound traffic. The first request after sleep can take about a minute. This is acceptable for a review link, not for a live production SLA.
- Render's filesystem is ephemeral. All durable data stays in Supabase; do not add SQLite, uploads, or runtime-generated assets to the container.
- Supabase Free projects with low activity can pause after seven days and can be resumed from the dashboard. The Free database becomes read-only above its database-size quota.
- Keep demo records synthetic. The preview has no authentication boundary and must not contain company data or secrets.
- If the UI loads but API requests fail, check `VITE_API_BASE_URL`, then Render CORS values, then `/api/v1/health/ready`, in that order.

## 7. Rollback and teardown

- Vercel: promote a previous deployment or remove the project.
- Render: roll back to one of the available previous deploys or suspend/delete the preview service.
- Supabase: keep the project for demo history or delete it after the preview; it is the only durable preview state.
- Local: `docker compose down` stops PostgreSQL without deleting its named volume. Add `--volumes` only when intentionally resetting local data.

## 8. Moving to GCP later

The migration keeps the same environment contract:

- Build `frontend/dist` and serve it from Firebase Hosting.
- Deploy `backend/Dockerfile` to Cloud Run.
- Set `RIPPLE_DATABASE_URL` to Cloud SQL's PostgreSQL connection path or connector-supported URL.
- Replace the preview CORS origins with the Firebase Hosting domain.
- Move startup migrations into a Cloud Run Job or CI release step before enabling multiple API instances.

Do not carry Render's startup-migration shortcut into a horizontally scaled production service.
