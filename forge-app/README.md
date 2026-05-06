# KlokView Jira Forge App

A Jira Forge app that embeds a **KlokView Time Tracking** panel inside every Jira issue — equivalent to the Harvest panel pattern in `Docs/Jira_Integration.docx`.

The panel reads from the KlokView Django backend (`apps/integrations/jira_views.py`) over HTTPS. No data is stored inside Jira itself — KlokView remains the source of truth.

## Architecture

See `Docs/Jira_Integration_v2_Django.pdf` §2 for the full diagram. In short:

```
Jira Issue   →   Forge Panel (this repo)   →   Django REST API   →   PostgreSQL
```

## Prerequisites

1. **Node.js 20+** — Forge CLI requirement.
2. **Atlassian developer account** — https://developer.atlassian.com (free).
3. **Forge CLI** —
   ```bash
   npm install -g @forge/cli
   forge login
   ```
4. **A reachable KlokView Django backend** — either:
   - Deploy the Django backend (Render / Railway / your own host), **OR**
   - Run `forge tunnel` for local dev (Atlassian proxies Forge → your localhost).

## First-time setup

```bash
cd forge-app
npm install
forge register   # creates an app in your developer console; copy the printed app id
```

Then edit `manifest.yml`:

1. Replace `ari:cloud:ecosystem::app/REPLACE-ME-AFTER-FORGE-REGISTER` with the app id from `forge register`.
2. Replace `https://YOUR-DJANGO-BACKEND` with your Django backend URL (only when deploying to production — local dev keeps `http://localhost:8000`).

Also edit `src/index.jsx`:

1. Set `KLOKVIEW_BACKEND` and `KLOKVIEW_FRONTEND` to match `manifest.yml`.

## Deploy & install

```bash
forge deploy           # publishes to Atlassian's cloud
forge install          # installs on your Jira site (you'll be prompted for the URL)
```

After install, open any Jira issue — the **KlokView Time Tracking** panel appears in the right sidebar.

## Local development

```bash
forge tunnel
```

This proxies Forge cloud → `http://localhost:8000` so you can iterate on the Django backend without redeploying.

## Endpoints called by the panel

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/integrations/jira/entries/?issue_key=XYZ-123` | Event log for the open issue |
| POST | `/api/v1/integrations/jira/start/` | (v2) Start a KlokView timer from inside Jira |
| POST | `/api/v1/integrations/jira/stop/` | (v2) Stop the running timer |

## Roadmap

- **v1 (this version):** read-only event log + deep-link to KlokView.
- **v2:** in-Jira Start/Stop buttons (requires picking a KlokView project on first use; persist the choice in Forge storage).
- **v3:** Atlassian Marketplace listing — sets up the "Connect Jira" → marketplace flow shown in `Docs/Jira_Integration.docx` Steps 2–5.
