# TrackFlow

Time tracking, project management, and invoicing web app. See [claude.md](claude.md) for the full blueprint.

## Phase 1 scope

- Django + DRF backend with 6 apps scaffolded (`accounts` fully wired, others stubbed)
- Custom `accounts.User` model (email login, role, hourly_rate)
- JWT auth endpoints: `/register/`, `/login/`, `/token/refresh/`, `/me/`
- React 18 + TypeScript frontend (Vite), Tailwind, React Router, Zustand auth store
- Login / Register pages with `react-hook-form` + `zod` validation
- `ProtectedRoute` + `PublicOnlyRoute` gating with auto token refresh

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ (or Docker Desktop)

## 1. Start PostgreSQL

```bash
docker compose up -d db
```

Or use a local Postgres and create a database:

```sql
CREATE DATABASE trackflow_db;
```

## 2. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # Windows: copy .env.example .env

python manage.py makemigrations accounts
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Backend runs at http://localhost:8000.

### Auth endpoints (all under `/api/v1/auth/`)

| Method | Path              | Auth | Body                                      |
|--------|-------------------|------|-------------------------------------------|
| POST   | `/register/`      | -    | `{ email, full_name, password }`          |
| POST   | `/login/`         | -    | `{ email, password }`                     |
| POST   | `/token/refresh/` | -    | `{ refresh }`                             |
| GET    | `/me/`            | JWT  | -                                         |
| PATCH  | `/me/`            | JWT  | partial user fields                       |

All responses follow: `{ "success": bool, "data": ..., "error": ... }`.

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # Windows: copy .env.example .env
npm run dev
```

Frontend runs at http://localhost:5173. It expects the backend at `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`).

## Project structure

```
trackflow/
├── backend/
│   ├── trackflow/           # project settings, urls, wsgi, asgi
│   ├── apps/
│   │   ├── accounts/        # custom User + JWT auth (complete)
│   │   ├── clients/         # stub (Phase 2)
│   │   ├── projects/        # stub (Phase 2)
│   │   ├── timesheets/      # stub (Phase 3)
│   │   ├── reports/         # stub (Phase 4)
│   │   └── invoices/        # stub (Phase 4)
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/             # axios client + auth calls
│       ├── components/      # ProtectedRoute, PublicOnlyRoute
│       ├── pages/           # LoginPage, RegisterPage, DashboardPage
│       ├── store/           # Zustand auth store
│       ├── types/           # TS interfaces
│       └── utils/           # error helpers
├── docker-compose.yml
└── README.md
```

## Next phases

See the Build Order section of [claude.md](claude.md) — Phase 2 adds Clients and Projects CRUD.
