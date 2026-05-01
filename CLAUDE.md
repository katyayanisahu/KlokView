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

Status legend: ✅ done · 🟡 partial · ⬜ pending · ⏭️ deferred

### ✅ Epic 1 — Authentication (complete)

| Story | What was built |
|---|---|
| US-01 Signup | `/register` page with first/last/company/email/password, creates User with `role=owner` by default. First/last name regex-validated (letters only, Unicode). Live password-strength checklist. |
| US-02 Login | `/login` page with email/password, JWT issued on success |
| US-03 Logout | Navbar dropdown "Sign out" clears tokens + session |
| US-04 Password reset | `/forgot-password` + `/reset-password` pages, token-based; **real Gmail SMTP delivery wired up** (was console). "Check your email" success state with resend. |
| US-05 Invite + set password | `/team/invite` (admin/owner) creates pending user, sends invite email; `/accept-invite` sets password and auto-logs in. Resend invite supported. |
| US-06 Silent JWT refresh | Axios response interceptor auto-refreshes access token on 401, falls back to logout |

**Foundation also built (required but not in any US):**
- Navbar with role-aware nav (Time / Projects / Team / Reports / Manage). Logo SVG replaces wordmark.
- `ProtectedRoute` + `RequireRole` route guards
- User model: owner / admin / **manager** / member roles (manager added; permissions wiring pending); first_name/last_name; invitation fields
- Techment-inspired design system (white navbar, navy brand, mint CTAs) — see UI & Design Rules
- Dashboard shell with Harvest-style timesheet layout (mock data only — wired in Epic 2)
- `start-dev.bat` one-click launcher — opens backend + frontend in their own terminal windows for demos

### ✅ Epic 2 — Time Entries (complete)

| Story | Status |
|---|---|
| US-07 Manual time entry | ✅ done — Track Time modal: Project, Task, Notes + Hours, Billable toggle. |
| US-08 Start timer | ✅ done — Start in modal + per-row Start button on each entry (auto-stops any running timer). |
| US-09 Stop timer → entry saved | ✅ done — Stop on running row + running banner in modal. |
| US-10 Edit own entry | ✅ done. |
| US-11 Delete own entry | ✅ done. |
| US-12 Manager edits any member's entry | ✅ done — Teammates picker. |
| US-13 Billable / non-billable toggle | ✅ done. |

UI follows Harvest pattern (Day + Week views, flat underlined tabs). Project list / Project detail / Dashboard tiles now read real hours from `TimeEntry`.

### ✅ Epic 6 — Timesheet Approvals (complete)

| Story | Status |
|---|---|
| US-31 Submit timesheet | ✅ done — "Submit week for approval" button. |
| US-32 Notify manager on submit | ✅ done — email via real Gmail SMTP. |
| US-33 Approve (locks entries) | ✅ done — manager/admin/owner Approve locks edits. |
| US-34 Withdraw submission | ✅ done — submitter can withdraw before decision. |

Approval tab matches Harvest: Range (Day/Week/Semimonth/Month/Quarter/Custom/All), date navigator with calendar picker, Status + Group by + Client/Project/Role/Teammate filters, total-time summary card, submission rows with Approve/Reject/Review, and a footer "Withdraw approval" button.

### ✅ Epic 3 — Projects (complete)

All UI, models, and CRUD live. With Epic 2 now in, the budget bars + Hours columns populate from real `TimeEntry` aggregates.

| Story | Status |
|---|---|
| US-14 Create project (name, client) | ✅ done — `/projects/new` wizard (Basics → Budget → Tasks). **Per V2 spec, project_type picker removed from UI** — DB still stores `time_materials` as default for backward compat. |
| US-15 Set budget (hours) | ✅ done — hours-only after V2 simplification. Options: `none` / `total_hours` / `hours_per_task`. Fee variants removed from picker; legacy fee rows still render via `formatBudget` fallback. Budget alerts (%), monthly reset, includes-non-billable toggles all wired. **Spent/Remaining bars now populated from real `TimeEntry` aggregates (Epic 2 ✅).** |
| US-16 Assign team members | ✅ done — `ProjectMembership` model + in-place team tab on project detail. Add/remove member, toggle `is_project_manager` flag. **Per V2 spec, per-user `hourly_rate` override removed from UI** (DB column kept). |
| US-17 Add tasks to project | ✅ done — `Task` (workspace library) + `ProjectTask` junction with per-project `is_billable` override; in-place task tab on project detail with add/remove + Hours placeholder column. |
| US-18 Archive project | ✅ done — list-page archive filter, inline `↻ Restore` pill on archived rows, Archive in detail-page Actions dropdown, prominent `Archived` warning badge. |
| US-19 Link to Jira project | ⏭️ Epic 7 later |

**Filters live on list page:** Filter by client + Filter by manager. **Manager filter is role-gated** — hidden from Member role per Harvest pattern. Manager dropdown lists only users actually flagged `is_project_manager=true` on at least one project (not all admin/owner). Search matches across project name, project code, and client name.

**Clients management** (`/manage/clients`):
- `Client` model with `name`, `address`, `currency`, `is_active` (+ `tax_rate`, `discount_rate`, `invoice_due_date_type` legacy columns kept on model, hidden from UI per V2 spec)
- New `ClientContact` model — first/last name, email, title, office/mobile/fax — nested under client; full CRUD via `ContactModal`
- Page features: New client + Add contact + **Import (CSV bulk create)** + Export, search by client/contact, Active/Archived filter, inline `↻ Restore` pill on archived clients

**Tasks management** (`/manage/tasks`): bulk-select + bulk archive/delete, group select-all checkboxes, **Default billable rate column removed per V2 spec**, inline `↻ Restore` pill on archived rows. "New task" + Export + Active/Archived filter visible when no selection; switches to "Archive or delete selected tasks" + search when rows checked (Harvest pattern).

**Roles management** (`/manage/roles`): `JobRole` model (organizational labels distinct from User.role permission level) + assignment via `assigned_user_ids`. New search input + 5-second deferred-undo delete with inline strip.

**V2 design simplification (per `/Docs/[V2] TrackFlow Design Changes_ Projects & Tasks Page`)** — applied:
- Hours-only display globally — `formatBudget` returns `${num} hr` for all budget types
- All `$` symbols and `.00` price formatting removed
- Currency, Tax, Discount, Invoice due date — all hidden from UI (model fields preserved)
- Project type (`Time & Materials` / `Fixed Fee` / `Non-Billable`) — picker removed from create form, type pill removed from list/detail header, single-type model (defaults `time_materials`)
- Per-user `hourly_rate` rate override — column removed from project Team tab
- Costs ($) column — removed from Projects list
- Charts Y-axis — `hours` everywhere (was `$Xk` for fee budgets)

### 🟡 Epic 4 — Team Management (partial)

| Story | Status |
|---|---|
| US-20 Invite team member | ✅ done — email (real Gmail SMTP) + magic link + accept; resend supported; **Manager role** now selectable in invite form alongside Admin/Member |
| US-21 Assign role | ⬜ UI to change existing user's role pending (Manager role exists in DB now, so unblocked) |
| US-22 Archive team member | ⬜ pending |
| US-23 Weekly capacity | ⬜ pending |
| US-24 Employee / Contractor flag | ⬜ pending |

Manager role is in the schema and invitable. Per-route permission wiring (which pages Manager can access beyond Member's defaults) is partial — Member is gated out of "Filter by manager" on Projects page; broader role guards still pending.

---

### 🎨 Cross-cutting design system additions (built alongside Epic 3)

Reusable primitives that apply across all current and future epics:

- **`<ConfirmDialog>` + `useConfirm()`** ([components/ConfirmDialog.tsx](frontend/src/components/ConfirmDialog.tsx)) — replaces all native `window.confirm()` with styled modal. Tones: `danger` / `warning` / `primary`. ESC closes, Enter confirms. Used across Roles/Tasks/Clients/Projects delete + archive flows.
- **`useUndoDelete<T>()`** ([hooks/useUndoDelete.ts](frontend/src/hooks/useUndoDelete.ts)) — Harvest-style 5-second deferred delete with inline `**X** has been deleted. Undo` strip. Optimistic UI removal, timer-deferred API call, restore on undo or API failure. Wired into Roles, Tasks, Projects (single delete), and Client contacts.
- **Inline `↻ Restore` pill** — appears on archived rows across Projects, Tasks, Clients (mint accent, one-click recovery without opening Actions dropdown).
- **Footer** ([components/Footer.tsx](frontend/src/components/Footer.tsx)) — global, rendered via `ProtectedRoute`; dark navy bg + 4-column grid + mint hover on links (Techment-inspired).
- **Manage landing** (`/manage`) — 3-card grid (Clients / Tasks / Roles) with primary-soft / accent-soft icon tiles; `ManageSubnav` provides persistent tab switching once inside.
- **Dashboard welcome banner** — primary-soft gradient strip with greeting + week/billable hour tiles.
- **Project detail metric cards** — Total hours (with billable/non-billable split), Remaining hours, Team utilization placeholder. No `$` / Costs / Invoiced cards (per V2 spec).

---

### 🎯 Feature sequence going forward

#### ⬜ Epic 5 — Reports (IMMEDIATE NEXT)

Replace `/reports` stub with real charts + exportable tables. Stories: US-25 Time report, US-26 Team utilization, US-27 Activity log, US-28 CSV/PDF export, US-29 Save filters, US-30 Scheduled email. Reports tab is already visible to all roles (Harvest pattern — Member sees own data, Manager sees managed projects, Admin/Owner sees everything).

#### ⬜ Complete Epic 4 — Team Management

Finish US-21 (change role) to US-24 (employee/contractor flag).

#### ⏭️ Epic 7 — Jira Integration

Deferred. US-35 to US-39 — needs OAuth + Celery.

#### ⏭️ Epic 8 — Outlook Integration

Deferred. US-40 to US-43 — needs Microsoft OAuth + calendar sync.

---

### 🚧 Known infra gaps (address when a real customer needs them)

- ~~Multi-tenancy~~: ✅ done in Phase 1.5. `Account` model created; `account_id` FK on `users`/`clients`/`projects`/`tasks`; JWT payload includes `account_id`; `TenantScopedMixin` auto-filters all queries by `request.user.account_id`. Signup creates a new Account; invites inherit inviter's account.
- ~~Production email~~: ✅ done. Real Gmail SMTP wired up via `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` + App Password in `backend/.env`. Password-reset and invite emails actually deliver to real inboxes.
- **Manager role**: 🟡 partial. DB enum + invite form support `manager`. Per-page guards: Manager filter on Projects is hidden from Member; broader role guards still pending — do this alongside Epic 6 approvals.
- **Seed-data migration**: ⬜ pending. `[SAMPLE]` clients/projects/contacts exist in current DB but aren't codified as a Django data migration — fresh `migrate` won't reproduce them. Low priority until we onboard a new dev/customer.
- **Bulk undo strip**: ⬜ pending. Single-item delete shows the 5-second `Undo` strip; bulk delete (Tasks/Projects bulk action) currently fires immediately without undo. Reuse `useUndoDelete` over an array if needed.
- **Legacy `total_fees` / `fees_per_task` budget data**: 🟡 partial. UI no longer offers these as options for new projects, but legacy rows continue to render via `formatBudget` fallback. A data migration to convert them to `total_hours` would make the codepath dead-code-removable.
- **Celery / async jobs**: Password-reset and invite emails are synchronous. Switch to Celery when Jira/Outlook integrations need scheduled tasks, or if SMTP latency starts blocking signup/invite responses.

---

## ⚙️ Implementation Instructions

- Work **ONE one feature at a time**
- Do NOT skip acceptance criteria
- First explain approach, then write code

