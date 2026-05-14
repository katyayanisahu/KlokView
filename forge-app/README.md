# KlokView Jira Forge App

A Jira Forge app that embeds a **KlokView Time Tracking** panel inside every Jira issue. Distributed as a **private Atlassian Marketplace listing** — see [Private Marketplace deploy](#private-marketplace-deploy).

The panel reads from the KlokView Django backend (`apps/integrations/jira_views.py`) over HTTPS. No data is stored inside Jira itself — KlokView remains the source of truth.

## Architecture

```
Jira Issue   →   Forge Panel (this repo)   →   Django REST API   →   PostgreSQL
```

All calls from the Forge resolver to Django carry an `Authorization: Bearer <shared-secret>` header. The secret is set as an **encrypted Forge environment variable** on one side and as the `JIRA_FORGE_API_KEY` Django env var on the other.

## Configuration (Forge variables)

The Forge resolver reads three runtime values from `process.env`:

| Variable | Purpose |
|---|---|
| `KLOKVIEW_BACKEND_URL` | Public HTTPS URL of the KlokView Django backend (called by every resolver function). |
| `KLOKVIEW_WEB_URL`     | Public HTTPS URL of the KlokView web app (used by the panel's "Open in KlokView" deep-link). |
| `KLOKVIEW_API_KEY`     | Shared secret matching `JIRA_FORGE_API_KEY` on the Django side. Set with `--encrypt`. |

Set them per environment:

```bash
# Production
forge variables set --environment production KLOKVIEW_BACKEND_URL https://api.klokview.com
forge variables set --environment production KLOKVIEW_WEB_URL     https://app.klokview.com
forge variables set --environment production --encrypt KLOKVIEW_API_KEY <generate-a-long-random-string>

# Development (forge tunnel rewrites prod URL → localhost:8000 transparently)
forge variables set --environment development KLOKVIEW_BACKEND_URL https://api.klokview.com
forge variables set --environment development KLOKVIEW_WEB_URL     http://localhost:5173
forge variables set --environment development --encrypt KLOKVIEW_API_KEY <dev-secret>
```

On the Django side, put the matching key in `backend/.env`:

```
JIRA_FORGE_API_KEY=<same-value-as-above>
```

If `JIRA_FORGE_API_KEY` is empty the backend falls open (no auth check) — useful in local dev, **never deploy production with this empty**.

## Manifest URL (one-time)

`manifest.yml` lists every external host the resolver is allowed to call (Forge enforces this at build time — env vars cannot inject hosts). Before deploying, replace the placeholder:

```yaml
external:
  fetch:
    backend:
      - https://api.klokview.invalid   # ← change to your real backend URL
```

For local development, leave the production URL here. `forge tunnel` will rewrite it to `localhost:8000` transparently.

## Local development

```bash
cd forge-app
npm install
forge variables set --environment development ...   # one-time, see above
forge tunnel
```

Now open any Jira issue on the connected site — the panel calls your local Django backend through the tunnel.

## Private Marketplace deploy

Atlassian's **private listing** distribution model lets you publish to Marketplace but restrict installs to specific Jira sites that you grant access to (by email or site URL). Steps:

1. **Vendor account** — register your organization at https://marketplace.atlassian.com/manage/vendors (free for private-only apps).
2. **Production env vars** — set all three Forge variables (above) for the `production` environment.
3. **Update `manifest.yml`** — replace the `.invalid` placeholder in `external.fetch.backend` with your real backend URL; bump `app.version` if this is a new release.
4. **Deploy the production build:**
   ```bash
   forge deploy --environment production
   ```
5. **Upload to Marketplace** — from the Atlassian Marketplace vendor portal, create a new app listing, upload the deploy artifact (Forge publishes the bundle automatically; you'll select it by app id), and set **Distribution → Private**.
6. **Grant access** — add the email addresses or Atlassian site URLs allowed to install. Approved Jira admins receive an install URL that bypasses public Marketplace search.
7. **Update the frontend** — set `VITE_JIRA_PRIVATE_LISTING_URL` in `frontend/.env` to the install URL so the **Connect in Jira** button in Settings → Integrations opens the correct page.

After install, the first time anyone opens a Jira issue, the Forge resolver hits `/jira/bootstrap/` on your backend — this auto-creates a `JiraConnection` row linked to the workspace's first owner/admin, instantly showing "Connected" in Settings → Integrations. No manual `clientKey` paste is required for the private-listing flow.

## Endpoints called by the panel

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/v1/integrations/jira/bootstrap/` | First-load handshake → auto-creates `JiraConnection`. | API key |
| GET  | `/api/v1/integrations/jira/entries/`   | Time entries logged against this issue. | API key |
| GET  | `/api/v1/integrations/jira/projects/`  | Projects + tasks available to the calling user. | API key |
| POST | `/api/v1/integrations/jira/start/`     | Start a KlokView timer scoped to this issue. | API key |
| POST | `/api/v1/integrations/jira/stop/`      | Stop a running timer. | API key |

## Roadmap

- **v1 (this version):** in-Jira start/stop timers + read-only entry log.
- **v2:** sync KlokView entries back to Jira issue worklogs (needs Celery on the backend).
- **v3:** issue-level project mapping memory (skip the picker if a project is already mapped to this issue).
