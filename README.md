# TrackFlow

Time tracking, project management, and reporting web app — a Harvest-inspired SaaS.
Internal codebase name is **TrackFlow**; the user-facing UI brand is **KlokView**.

For the full feature blueprint and roadmap, see [CLAUDE.md](CLAUDE.md).

---

## Tech stack

- **Backend:** Python 3.11+ · Django 5 · Django REST Framework · SimpleJWT
- **Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · Zustand · React Hook Form + Zod
- **Database:** PostgreSQL 14+
- **Auth:** JWT (access + refresh, silent refresh interceptor)
- **Email:** Django console backend by default, real Gmail SMTP optional

---

## Prerequisites

Install these before starting:

| Tool | Version | Purpose |
|---|---|---|
| [Python](https://www.python.org/downloads/) | 3.11 or newer | Backend runtime |
| [Node.js](https://nodejs.org/) | 18 or newer | Frontend build / dev server |
| [PostgreSQL](https://www.postgresql.org/download/) | 14 or newer | Database (or use Docker — see below) |
| [Git](https://git-scm.com/downloads) | any recent | Clone repo |

**Optional but recommended (Windows users):**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — easiest way to run Postgres without installing it natively

Verify versions:

```bash
python --version    # Python 3.11+
node --version      # v18+
psql --version      # 14+   (skip if using Docker)
```

---

## Quick start (TL;DR)

For someone who just wants to run it locally:

```bash
# 1. Clone
git clone <repo-url> TrackFlow_Project
cd TrackFlow_Project

# 2. Start Postgres (pick one)
docker compose up -d db          # Option A — Docker
# or create a Postgres DB named "trackflow_db" manually — Option B

# 3. Backend
cd backend
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
copy .env.example .env           # Windows
# cp .env.example .env           # macOS/Linux
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# 4. Frontend (new terminal)
cd frontend
npm install
copy .env.example .env           # Windows
# cp .env.example .env           # macOS/Linux
npm run dev
```

Open <http://localhost:5173> and sign in with the superuser credentials.

**Windows shortcut:** after the one-time setup above, double-click `start-dev.bat` from the project root — it launches both backend and frontend in separate terminal windows.

---

## Detailed setup

### 1. Clone the repository

```bash
git clone <repo-url> TrackFlow_Project
cd TrackFlow_Project
```

### 2. Database — pick ONE of these two paths

#### Option A — Docker (recommended)

The repo ships with a `docker-compose.yml` that runs Postgres 16 with the right database/user/password baked in.

```bash
docker compose up -d db
```

Verify it's up:

```bash
docker ps          # should show "trackflow-db" running on port 5432
```

To stop / remove later: `docker compose down` (keeps data) or `docker compose down -v` (wipes data).

#### Option B — Native PostgreSQL

If Postgres is installed locally:

```bash
psql -U postgres
```

Then in the psql prompt:

```sql
CREATE DATABASE trackflow_db;
\q
```

Default expectations: user `postgres`, password `postgres`, host `localhost`, port `5432`. If your local setup differs, update those values in `backend/.env` after step 3.

### 3. Backend setup

```bash
cd backend
```

**Create and activate a virtualenv:**

```bash
python -m venv venv

# Windows (PowerShell):
venv\Scripts\Activate.ps1
# Windows (cmd):
venv\Scripts\activate.bat
# macOS / Linux:
source venv/bin/activate
```

**Install dependencies:**

```bash
pip install -r requirements.txt
```

**Create environment file:**

```bash
# Windows:
copy .env.example .env
# macOS / Linux:
cp .env.example .env
```

Open `backend/.env` and review. For local dev the defaults work — only edit if your Postgres credentials differ or you want real email delivery (see [Optional configuration](#optional-configuration) below).

**Run migrations:**

```bash
python manage.py migrate
```

This creates all tables: accounts, clients, projects, timesheets, reports, integrations.

**Create a superuser (first admin account):**

```bash
python manage.py createsuperuser
```

You'll be prompted for email, name, and password. This account becomes the workspace owner.

**Start the backend:**

```bash
python manage.py runserver
```

Backend now runs at <http://localhost:8000>. Django admin: <http://localhost:8000/admin/>.

### 4. Frontend setup

Open a **new terminal** (leave the backend running in the first one):

```bash
cd frontend
npm install
```

**Create environment file:**

```bash
# Windows:
copy .env.example .env
# macOS / Linux:
cp .env.example .env
```

The default `VITE_API_BASE_URL=http://localhost:8000/api/v1` matches the backend you just started.

**Start the dev server:**

```bash
npm run dev
```

Frontend now runs at <http://localhost:5173>.

### 5. Sign in

Open <http://localhost:5173> in your browser. Sign in with the superuser email/password from step 3. You should land on the dashboard.

---

## Optional configuration

### Real email delivery (Gmail SMTP)

By default, all emails (password resets, team invites, approval notifications) print to the backend console — useful for local dev. To send real emails:

1. Generate a Gmail **App Password** at <https://myaccount.google.com/apppasswords> (requires 2FA on your Google account).
2. Edit `backend/.env` and uncomment + fill these lines:

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=you@gmail.com
EMAIL_HOST_PASSWORD=your-16-char-app-password
DEFAULT_FROM_EMAIL=KlokView <you@gmail.com>
```

3. Restart the backend (`python manage.py runserver`).

### Jira integration

Atlassian Connect handshake — backend listens at `/api/v1/integrations/jira/install/` for the install webhook. Admin then claims the connection from **Settings → Integrations**. See [Docs/Jira_Integration_v2_Django.pdf](Docs/Jira_Integration_v2_Django.pdf) for full setup instructions.

### Outlook integration

Microsoft OAuth — configure the Azure app registration redirect URL to your frontend, then connect from **Settings → Integrations → Connect with Microsoft**. Tokens are stored Fernet-encrypted (key is derived from `SECRET_KEY`, so no separate env var needed).

---

## Daily workflow

### Windows one-click launcher

After one-time setup, you can start everything with:

```bash
start-dev.bat
```

Two terminal windows open — one each for backend and frontend. Close them to stop the servers.

### Manual

Two terminals:

```bash
# Terminal 1 — backend
cd backend
venv\Scripts\activate
python manage.py runserver

# Terminal 2 — frontend
cd frontend
npm run dev
```

---

## Environment variables reference

### `backend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | `django-insecure-…` | Django secret. **Change for production.** Also seeds Fernet key for Jira/Outlook token encryption. |
| `DEBUG` | `True` | Set `False` for production. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated list. |
| `DB_NAME` | `trackflow_db` | Postgres database name. |
| `DB_USER` | `postgres` | Postgres user. |
| `DB_PASSWORD` | `postgres` | Postgres password. |
| `DB_HOST` | `localhost` | Postgres host. |
| `DB_PORT` | `5432` | Postgres port. |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,…` | Origins allowed to call the API. Add your frontend domain in production. |
| `EMAIL_BACKEND` | console backend | See [Real email delivery](#real-email-delivery-gmail-smtp). |
| `FRONTEND_URL` | `http://localhost:5173` | Used in email links (password reset, team invites). |

### `frontend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Backend URL the SPA talks to. |

---

## Project structure

```
TrackFlow_Project/
├── backend/
│   ├── trackflow/              # Django project: settings, urls, wsgi, asgi
│   ├── apps/
│   │   ├── accounts/           # Custom User, Account (tenant), JWT auth, invites
│   │   ├── clients/            # Clients + nested ClientContact + CSV import
│   │   ├── projects/           # Projects, ProjectMembership, ProjectTask, JobRole
│   │   ├── timesheets/         # TimeEntry, timer state, weekly approval workflow
│   │   ├── reports/            # Time / Profitability / Detailed / Activity log
│   │   └── integrations/       # JiraConnection, OutlookConnection (Fernet-encrypted)
│   ├── manage.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── api/                # Axios client + per-resource calls
│       ├── components/         # Reusable primitives (ConfirmDialog, PageHero, etc.)
│       ├── hooks/              # useUndoDelete, useWeekStart, useFiscalYearStartMonth
│       ├── pages/              # Route-level pages (Dashboard, Projects, Reports, …)
│       ├── store/              # Zustand stores (auth, accountSettings)
│       ├── types/              # Shared TypeScript interfaces
│       └── utils/              # format helpers, error helpers
├── Docs/                       # Product specs, ERD, TDD, integration guides
├── docker-compose.yml          # Postgres-only Compose file
├── start-dev.bat               # Windows one-click launcher
├── CLAUDE.md                   # Full project blueprint + roadmap + design rules
└── README.md
```

---

## API basics

All endpoints are versioned under `/api/v1/`. JWT bearer token required except for auth/register/login routes.

Response envelope:

```json
{ "success": true, "data": ..., "error": null }
```

Key route groups:

| Prefix | Module |
|---|---|
| `/api/v1/auth/` | register, login, refresh, me, invite, accept-invite |
| `/api/v1/clients/` | CRUD + contacts + CSV import |
| `/api/v1/projects/` | CRUD + team + tasks |
| `/api/v1/timesheets/` | time entries, timer, approval |
| `/api/v1/reports/` | time, profitability, detailed-time, activity-log, saved-reports |
| `/api/v1/integrations/` | Jira + Outlook connect/disconnect |
| `/api/v1/account/` | workspace settings (timezone, fiscal year, modules, etc.) |

Django admin (superuser only): <http://localhost:8000/admin/>

---

## Troubleshooting

### `psycopg2` install fails

You're missing Postgres client libraries. Easiest fix: `requirements.txt` already pins `psycopg2-binary` (precompiled wheel) — make sure you're inside the venv when running `pip install`.

### `relation "..." does not exist` errors

Migrations didn't run. From `backend/` with the venv active:

```bash
python manage.py migrate
```

### `CORS error` in browser console

The frontend origin isn't in `CORS_ALLOWED_ORIGINS`. Add your frontend URL to `backend/.env` and restart the backend.

### Login works but pages show "Network Error"

Frontend can't reach the backend. Verify:
- Backend is running at <http://localhost:8000>
- `frontend/.env` has `VITE_API_BASE_URL=http://localhost:8000/api/v1`
- Restart `npm run dev` after editing `.env`

### Docker Postgres container won't start

Port `5432` is probably already in use by a local Postgres install. Either stop the local service, or change the host port mapping in `docker-compose.yml` from `"5432:5432"` to `"5433:5432"` and update `DB_PORT=5433` in `backend/.env`.

### Emails not sending

By default emails print to the **backend terminal** — that's expected. Look at the `python manage.py runserver` window. To send real emails, follow [Real email delivery](#real-email-delivery-gmail-smtp).

### Frontend shows old data after a backend change

Clear browser localStorage (JWT + cached settings cling there) — DevTools → Application → Local Storage → Clear All. Then sign in again.

---

## Default ports

| Service | Port | URL |
|---|---|---|
| Backend (Django) | 8000 | <http://localhost:8000> |
| Frontend (Vite) | 5173 | <http://localhost:5173> |
| Postgres | 5432 | `localhost:5432` |
| Django Admin | 8000 | <http://localhost:8000/admin/> |

---

## Useful commands

```bash
# Backend
python manage.py makemigrations            # generate new migrations after model changes
python manage.py migrate                   # apply pending migrations
python manage.py createsuperuser           # add admin user
python manage.py shell                     # Django shell (useful for debugging)
python manage.py collectstatic             # collect static files (production only)

# Frontend
npm run dev                                # dev server with hot reload
npm run build                              # production build (output: dist/)
npm run preview                            # preview the production build
npm run lint                               # ESLint check

# Docker
docker compose up -d db                    # start Postgres
docker compose logs -f db                  # tail Postgres logs
docker compose down                        # stop (keep data)
docker compose down -v                     # stop + delete data volume
```

---

## What's built

For an up-to-date map of which features are complete, partial, or pending, see the **Development Workflow** section of [CLAUDE.md](CLAUDE.md). High-level summary:

- Epic 1 — Authentication (signup / login / invite / password reset): **done**
- Epic 2 — Time entries (manual + timer, Harvest-style Day/Week views): **done**
- Epic 3 — Projects (3-step wizard, budgets, members, tasks, archive): **done**
- Epic 4 — Team management (invite, role, capacity, archive): **mostly done**
- Epic 5 — Reports (Time, Profitability, Detailed, Activity log, Saved reports): **done**
- Epic 6 — Timesheet approvals (submit, notify, approve, withdraw): **done**
- Epic 7 — Jira integration (Atlassian Connect handshake done; worklog sync pending Celery)
- Epic 8 — Outlook integration (OAuth + event import done; webhook sync pending)
- Settings + Profile modules: **done**

---

## License

Internal project. Not yet open-sourced.
