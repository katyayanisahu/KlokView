## 🧭 Project Overview

**App Name:** TrackFlow  
**Purpose:** A Harvest-like time tracking, project management web application.  

## 📂 Key Documents

- User Stories: /Docs/UserStories_TrackFlow_v2.docx
- Technical Design (TDD): /Docs/TDD_TrackFlow_v2_New.docx
- Features & Requirements: /Docs/TrackFlow_Features_Requirements_Updated.pdf
- Database Design (ERD): /Docs/ERD_TrackFlow_v2_New.docx
- /Docs/Trackflow Design Changes & Tasks Page
- /Docs/Time_Tracking_App_Complete.docx
- /Docs/Outlook_JIRA_Integration_Harvest
- /Docs/Outlook_Integration.docx
- /Docs/Jira_Integration.docx
- /Docs/Jira_Integration_v2_Django.pdf

## Tech Stack
-  Frontend: React.js + TypeScript + Tailwind CSS
- Backend: Python Django + Django REST Framework (DRF)
- Database: PostgreSQL
- Auth: JWT (via djangorestframework-simplejwt)

## UI & Design Rules

**Stack:** Tailwind CSS only — no custom CSS files

**Colors (Techment-inspired — white navbar + navy brand + mint CTAs + blue secondary):**
- Primary: Dark Blue (#0052CC) — brand wordmark, navbar text/logo, active nav indicator, headings, avatar bg, **Invite button**, focus rings
- Primary Dark: #003F9E — hover for primary surfaces (Invite hover, footer link hover)
- Primary Soft: #DEEBFF — subtle fills, role badges, selected-state cards, dashboard welcome banner, stat-card accents
- Accent: Mint Green (#5CDCA5) — ALL CTA buttons (Submit, Sign in, Track time, Save, Send reset link, etc.) AND nav link hover-underline
- Accent Dark: #3BBF87 — CTA hover, billable badge text
- Accent Soft: #E7F9F1 — info callouts, billable stat cards, billable badges
- Background: #F4F5F7 (page) / #FFFFFF (cards, navbar)
- Text: #172B4D (primary text, **footer background**), #6B778C (muted)
- Rule: mint CTA buttons use DARK text (text-text), not white — mint is a light shade and dark text is more readable
- **Invite button is the one exception** — solid `bg-primary` (blue) with white text, distinguishing it from the mint CTA system. This is intentional Techment styling.

**Typography:**
- Font: Inter (SaaS standard)
- Headings: font-bold, clear hierarchy
- Body: font-medium, readable

**Components:**
- Buttons (CTA): rounded-lg, shadow-sm, `bg-accent` (mint) with `text-text` (dark) — use `.btn-primary`
- Buttons (secondary): `.btn-outline` — white bg with slate border, hover tints primary-soft
- Invite button (navbar only): `bg-primary` blue with white text, `hover:bg-primary-dark`
- Cards: bg-white, rounded-xl, border border-slate-200, shadow-md
- Forms: rounded-lg inputs, py-2.5 padding, primary focus ring
- Navbar: white bg + border-b, navy brand wordmark, muted inactive nav links, **primary underline for active, animated mint underline on hover (scale-x from origin-left)**
- Footer: dark navy bg (`bg-text`), white headings, slate-400 links with mint hover, 4-column grid (Brand / Product / Resources / Company), bottom strip with copyright + Terms/Privacy. Lives in `components/Footer.tsx` and is wired globally via `ProtectedRoute`.
- Auth page bg: subtle gradient `from-bg to-primary-soft/30`, single-column centered layout
- Stat cards (Projects list, Dashboard banner): `rounded-xl` with `bg-white` or `bg-primary-soft/40` for emphasized cards
- Dashboard welcome banner: `bg-gradient-to-r from-primary-soft via-primary-soft/70 to-white` with primary-bordered stat tiles inside
- Manage landing: card grid linking to Clients / Tasks / Roles, each with primary-soft or accent-soft icon background

**Layout:**
- Fully responsive — mobile + desktop
- Spacious, minimal, professional SaaS look
- Logged-in pages have global Footer rendered via `ProtectedRoute` flex-column wrapper

**Rules:**
- No inline styles
- No assumed features outside user stories
- Ask before installing new dependencies
- Keep backend and frontend in sync
- Hero panels with `bg-hero-gradient` (primary→primary-dark) are available via `.hero-blue` utility for future marketing surfaces, but **do not use on auth pages** — auth stays clean centered single-column.

## 🚀 Development Workflow

**Status legend:** ✅ done · 🟡 partial · ⬜ pending · ⏭️ deferred

> **UI brand name** is **KlokView** (renamed from TrackFlow). Backend code, project files, and this doc still use "TrackFlow" internally — only user-facing UI was renamed.

### ✅ Epic 1 — Authentication (done)

| Story | What works |
|---|---|
| US-01 Signup | `/register` — first/last/email/password + company name. Owner role assigned by default. |
| US-02 Login | `/login` — JWT issued on success. |
| US-03 Logout | Top-right user menu → Sign out. |
| US-04 Password reset | `/forgot-password` + `/reset-password`, token-based, real Gmail SMTP. |
| US-05 Invite + accept | `/team/invite` → email link → `/accept-invite` sets password. Resend supported. |
| US-06 Silent JWT refresh | Axios interceptor auto-refreshes on 401, fallback to logout. |

**Foundation also built:** tenant model (`Account`), JWT, role-aware sidebar nav, route guards (`ProtectedRoute` / `RequireRole` / `RequireModule`), Techment-inspired design system, `start-dev.bat` one-click launcher.

### ✅ Epic 2 — Time Entries (Done)

| Story | Status |
|---|---|
| US-07 Manual time entry | ✅ Track Time modal: Project · Task · Notes · Hours · Billable. |
| US-08 Start timer | ✅ Start from modal or per-row Start button (auto-stops any running timer). |
| US-09 Stop timer → save | ✅ Stop on running row + running banner in modal. |
| US-10 Edit own entry | ✅ |
| US-11 Delete own entry | ✅ |
| US-12 Manager edits any member's entry | ✅ via Teammates picker. |
| US-13 Billable / non-billable toggle | ✅ |

UI follows Harvest pattern (Day + Week views, underlined tabs). Project list / detail / dashboard tiles read real hours from `TimeEntry`.

**Period dropdown (Day / Week / Custom):** Top-right of the Timesheet replaces the old Day/Week pill toggle. Day/Week behave as before. **Custom** swaps the prev/next/calendar with two date inputs and renders a flat chronological list of entries across the range (with date label per row, internal scroll at `max-h-[640px]`). Week strip, rejected banner, and submit-week row are hidden in Custom view since they're week-anchored. Dropdown tints `primary-soft` when not on default `Day` to flag a non-default selection.

### ✅ Epic 3 — Projects (Done)
    //comment
All UI + CRUD live. Budget bars and Hours columns read real `TimeEntry` aggregates.

| Story | Status |
|---|---|
| US-14 Create project | ✅ `/projects/new` 3-step wizard (Basics → Budget → Tasks). |
| US-15 Set hours budget | ✅ Options: `none` / `total_hours` / `hours_per_task`. Spent/Remaining bars from real entries. Budget alerts (%), monthly reset, includes-non-billable toggles all wired. |
| US-16 Assign team members | ✅ `ProjectMembership` + Team tab. Add/remove + `is_project_manager` toggle. |
| US-17 Add tasks to project | ✅ Workspace `Task` library + `ProjectTask` with per-project billable override. |
| US-18 Archive project | ✅ Archive filter + inline `↻ Restore` pill on archived rows. |
| US-19 Link to Jira project | ⏭️ See Epic 7. |

**Filters on list page:** Filter by client + Filter by manager (manager filter hidden from Member role). Search matches project name / code / client name.

**Manage tabs (live):**
- **Clients** (`/manage/clients`) — CRUD + nested `ClientContact` + CSV import + archive/restore
- **Tasks** (`/manage/tasks`) — workspace task library + bulk archive/delete (Harvest pattern)
- **Roles** (`/manage/roles`) — `JobRole` labels (organizational, distinct from User.role permission level) + 5-second undo on delete

**V2 spec applied** (per `/Docs/[V2] TrackFlow Design Changes`):
- Hours-only display globally (`formatBudget` returns `${num} hr`)
- All `$`, fees, currency, tax, discount, invoice due date — hidden from UI (DB columns preserved)
- Project type picker removed (defaults `time_materials`)
- Per-user `hourly_rate` override removed from project Team tab
- Costs column removed from Projects list

### ✅ Epic 4 — Team Management (mostly done)

| Story | Status |
|---|---|
| US-20 Invite team member | ✅ Email + magic link + accept; resend supported; Manager role selectable. |
| US-21 Assign role | ✅ `/team/:id/edit` has role dropdown (Member/Manager/Admin). |
| US-22 Archive team member | ✅ Archive + restore on `/team/:id/edit`. |
| US-23 Weekly capacity | ✅ Editable on invite + edit pages; used by utilization reports. |
| US-24 Employee / Contractor flag | ⬜ DB field not added yet. |

Per-route role guards: in place across Team, Manage, Settings (owner/admin), Reports/Time (all roles), Profile (all roles). Manager role works end-to-end.

### ✅ Epic 5 — Reports (done, 1 pending)

Live at `/reports/*` (visible to all roles — Member sees own data, Manager sees managed projects, Admin/Owner sees everything):
- **Time report** — hours grouped by client/project/task, billable %, charts. Amount columns + KPI use `formatCurrency()` and respect workspace currency (₹, $, €, …) reactively. **Billable amount column + KPI are hidden for Member role** (Rate column in the project-task drilldown too — rate alone is meaningless without amount).
- **Profitability** — admin-only, costs/billable amounts (data hidden in UI per V2 but available)
- **Detailed Time** — drill-down by user/project/date with CSV export
- **Activity Log** — edit/delete timeline (gated by `activity_log` module flag). Member sees own activity + project-created events only for projects they're a member of.
- **Saved Reports** — name + share filter combinations across users

| Story | Status |
|---|---|
| US-25 Time report | ✅ |
| US-26 Team utilization | ✅ via Detailed Time + Profitability |
| US-27 Activity log | ✅ |
| US-28 CSV export | ✅ (PDF not done — low priority) |
| US-29 Save filters | ✅ |
| US-30 Scheduled email | ⬜ pending — needs Celery |

### ✅ Epic 6 — Timesheet Approvals (done)

| Story | Status |
|---|---|
| US-31 Submit timesheet | ✅ "Submit week for approval" button. |
| US-32 Notify manager on submit | ✅ email via real Gmail SMTP. |
| US-33 Approve (locks entries) | ✅ manager/admin/owner Approve locks edits. |
| US-34 Withdraw submission | ✅ submitter can withdraw before decision. |

Approval tab matches Harvest: Range filter (Day/Week/Semimonth/Month/Quarter/Custom/All), date navigator with calendar picker, Status + Group by + Client/Project/Role/Teammate filters, total-time summary card, Approve/Reject/Review actions, footer "Withdraw approval" button.

### 🟡 Epic 7 — Jira Integration (in progress)

Atlassian Connect-style install: backend listens for the install webhook, stores `clientKey` + `sharedSecret` (Fernet-encrypted), admin then claims the connection from Settings → Integrations.

| Step | Status |
|---|---|
| Atlassian Connect install handshake | ✅ webhook stores `JiraConnection` (one per Jira site) |
| Claim flow | ✅ admin pastes `clientKey` from Settings → Integrations to link site to workspace |
| Status / Disconnect | ✅ shown in Integrations card |
| Issue picker in Track Time modal | 🟡 backend search exists; UI integration pending |
| Auto-tag time entries with Jira issue key | 🟡 `TimeEntry.jira_issue_key` field exists; full UX flow pending |
| Sync hours back to Jira worklogs | ⬜ needs Celery |
| OAuth flow alternative (instead of Connect install) | ⬜ pending |

Stories US-35 to US-39 — partial.

### 🟡 Epic 8 — Outlook Integration (mostly done)

| Step | Status |
|---|---|
| Microsoft OAuth connect | ✅ "Connect with Microsoft" in Settings → Integrations |
| Token storage (Fernet-encrypted) | ✅ `OutlookConnection` model |
| Event picker on dashboard | ✅ "Pull-in event" banner opens picker |
| Import event as time entry | ✅ creates `TimeEntry` + tracks `ImportedCalendarEvent` to prevent dupes |
| Disconnect | ✅ |
| Two-way sync (TrackFlow → Outlook) | ⬜ pending |
| Webhook subscription for new events | ⬜ pending |

Stories US-40 to US-43 — partial.

### ✅ Settings module (done)

`/settings/*` pages, owner/admin only:
- **Preferences** — workspace timezone, fiscal year start, week starts on, default capacity, date/time format, currency, number format, timer mode, deadline message
- **Integrations** — Jira + Outlook connect/disconnect cards (single 2-col grid, category pill per card)
- **Modules** — toggle which features are enabled workspace-wide (`time_tracking`, `team`, `reports`, `activity_log`, `jira_sync`, `outlook_sync`, `timesheet_approval`)
- **Sign-in security** — 2FA requirement, allow Google/Microsoft SSO, session timeout, login alerts
- **Import/Export** — sample data add/remove, CSV imports for clients/projects/people, ownership transfer

**Caveat:** Timer mode setting still saves to DB without affecting UI. **Currency + Number format are now wired** — Time report, Profitability, Project Detail all use `formatCurrency()` / `formatMoney()` which read from `useAccountSettingsStore` reactively. Setting INR in Preferences flips `$` → `₹` immediately across these pages.

### ✅ Profile module (done)

`/profile/*` pages, available to every logged-in user. Sidebar layout with profile plaque + nav (Basic info, Assigned projects, Assigned people, Permissions, Notifications):
- **Basic info** — name, employee ID, capacity, timezone (with workspace fallback), photo (placeholder for upload)
- **Assigned projects** — read-only list with Project manager Yes/No column + "Open project" link per row; role-aware intro line (Owner / Administrator / Member)
- **Assigned people** — manager+ only; list of people the user manages; admins get a "no team needed" message
- **Permissions** — read-only role + workspace module enabled/disabled list
- **Notifications** — 8 email toggles (timesheet reminders, weekly summary, approval alerts on submit/approve, project deletion, product updates)
- **Refer a friend** (`/profile/refer`) — copyable referral link + mailto to share

**Top-right user dropdown** links: My profile · My time report · Notifications · Refer a friend · Sign out.

🟡 **Pending wire-up:** Notification toggles save to `User.notification_prefs` but the actual `send_mail` callsites in `apps/timesheets/views.py` and project-deleted email path don't read them yet. ~2-3 hours of work to close.

⬜ **Photo upload pending** — currently a "Upload photo · coming soon" disabled chip; ~2-3 hours for local MVP, +half day for S3.

### 🎨 Reusable primitives

When you need these patterns, **grab the existing primitive** — don't reinvent.

- **`<ConfirmDialog>` + `useConfirm()`** ([components/ConfirmDialog.tsx](frontend/src/components/ConfirmDialog.tsx)) — styled replacement for `window.confirm()`. Tones: `danger` / `warning` / `primary`. ESC closes, Enter confirms.
- **`useUndoDelete<T>()`** ([hooks/useUndoDelete.ts](frontend/src/hooks/useUndoDelete.ts)) — Harvest-style 5-second deferred delete with inline `Undo` strip. Optimistic UI removal + timer-deferred API call. Currently single-item only; bulk-delete adaptation noted under Known infra gaps.
- **Inline `↻ Restore` pill** — used on archived rows across Projects / Tasks / Clients (mint accent, one-click recovery without opening Actions dropdown).
- **Tab-sidebar pattern** — used on `/profile/*` and `/settings/*`. Active state: `bg-primary-soft/60` + filled solid-blue icon tile + bold dark label. No left border bar (deliberately removed for cleaner geometry). See [SettingsSubnav.tsx](frontend/src/components/SettingsSubnav.tsx) and [ProfileLayout.tsx](frontend/src/pages/profile/ProfileLayout.tsx).
- **`PageHero`** ([components/PageHero.tsx](frontend/src/components/PageHero.tsx)) — page header strip with eyebrow + title + description + optional actions slot. Use on any new top-level page.

### 🎯 Feature sequence going forward

1. **Notifications wire-up (~2-3 hr)** — respect `User.notification_prefs` in `apps/timesheets/views.py` send_mail callsites + project-deleted email path. Closes the gap shipped with the Notifications tab.
2. **Epic 7 — Jira sync features** — issue picker in Track Time modal, auto-tag entries, sync hours to worklogs. Worklog push needs Celery.
3. **Epic 5 — US-30 Scheduled email** — same Celery setup as #2.
4. **Epic 4 — finish US-24** (employee/contractor flag) — small DB + form change.
5. **Photo upload** — replaces disabled "Upload photo · coming soon" chip in Profile › Display.
6. **Optional cleanup** — drop or wire up Timer mode / Currency / Number format settings in Preferences (currently save but no visible effect).

### 🚧 Known infra gaps

**Resolved:**
- ~~Multi-tenancy~~: ✅ `Account` model + `account_id` FK on users/clients/projects/tasks. JWT carries `account_id`. `TenantScopedMixin` auto-filters by `request.user.account_id`.
- ~~Production email~~: ✅ Real Gmail SMTP via `backend/.env`. Password-reset, invite, approval emails deliver to real inboxes.
- ~~Manager role~~: ✅ DB enum + invite + edit-role + per-route guards all wired. Manager works end-to-end across Team / Projects / Approvals / Profile.
- ~~Member-role visibility scoping~~: ✅ Tenant scoping alone (`account_id`) wasn't enough — list endpoints were leaking workspace-wide data to Member role. Now scoped: `ProjectViewSet`, `ClientViewSet`, `ClientContactViewSet`, `TaskViewSet` filter to projects/clients/tasks where `memberships__user=request.user` for non-admin/owner roles. `UserListView` returns only teammates sharing a project (plus self). `ActivityLogReportView` project-created events also scoped. Manager + Member both fall under this filter; admin/owner unaffected.

**Open — high priority** (user-visible gaps shipped this session):
- **Notification prefs not respected by `send_mail`**: 🟡 partial. `User.notification_prefs` saves correctly from `/profile/notifications`, but the actual email-sending code in `apps/timesheets/views.py` (timesheet submitted / approved emails) and the project-deleted path don't read those prefs yet. Users can uncheck a box but still get the email. ~2-3 hours to wire — close before next feature work.
- **Backend brand still says "TrackFlow"**: ⬜ pending. UI was renamed to KlokView, but `backend/apps/accounts/views.py` invite + reset email subject/body, `backend/apps/timesheets/views.py` approval email content, `apps/integrations/*.py` log lines, and `backend/.env.example` all still say "TrackFlow". User-visible in delivered emails — should match the UI rename.
- **Photo upload**: ⬜ pending. Profile › Display shows a disabled "Upload photo · coming soon" chip. Needs `MEDIA_ROOT` config + `User.avatar_image` field + multipart endpoint + Pillow resize + file picker UI. ~2-3 hours for local MVP, +half day for S3.
- **Preferences settings save but no visible effect**: 🟡 narrowed. `currency` + `number_format` now wired via `formatCurrency()` / `formatMoney()` across Time report, Profitability, Project Detail. `Account.timer_mode` still saves but isn't read anywhere — drop from the form or wire it up. **Indian lakh-style grouping (1,23,456) is not supported yet** — `number_format` only maps to en-US / de-DE / fr-FR locales. With INR currency the amount renders as `₹1,234.56` (US grouping). Add an `en-IN` mapping if Indian grouping is needed.

**Open — lower priority:**
- **Seed-data migration**: ⬜ pending. `[SAMPLE]` data exists in current DB but isn't codified as a Django data migration — fresh `migrate` won't reproduce it. Add when onboarding a new dev/customer.
- **Bulk undo strip**: ⬜ pending. Single-item delete shows the 5-second `Undo` strip; bulk delete (Tasks/Projects) currently fires immediately. Reuse `useUndoDelete` over an array.
- **Legacy `total_fees` / `fees_per_task` budget data**: 🟡 partial. UI no longer offers these for new projects, but legacy rows render via `formatBudget` fallback. Data migration to convert them to `total_hours` would make the codepath removable.
- **Celery / async jobs**: ⬜ pending. All emails are synchronous. Required to land: scheduled report email (US-30), Jira worklog push, Outlook webhook subscription. Set this up before tackling those features.
- **Inert DB columns from removed UI**: 🟡 minor. `User.home_show_welcome` (Show Welcome home page toggle removed), `Client.tax_rate` / `discount_rate` / `invoice_due_date_type` (V2 removed currency UI), `User.hourly_rate` per-project override (V2 removed). All harmless, just clutter — drop via migration if/when convenient.
- **`trackflow:pinnedProjects` localStorage key**: ⬜ minor. Internal namespace not renamed during KlokView rebrand because changing it would lose existing users' pinned-project state. Migrate-on-read could be added later.

---

## ⚙️ Implementation Instructions

- Work **ONE one feature at a time**
- Do NOT skip acceptance criteria
- First explain approach, then write code

