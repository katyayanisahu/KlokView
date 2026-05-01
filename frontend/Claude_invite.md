I am building a time-tracking SaaS app called "TrackFlow" (similar to Harvest).

I have provided the following reference documents — please read them before writing any code:
1. TDD_TrackFlow_v2_New(2)/ERD_Trackflow_v2 → tech stack, folder structure, DB schema, API patterns
2. Features_Requirements → business rules, role permissions, feature specs
3. Time_Tracking_App_Completed(2) → exact UI screenshots (use these for pixel-accurate design)



## Task: Build Complete Invite Flow (Frontend + Backend)

The invite flow has 5 steps:

Step 1 — Admin/Owner opens Team page → clicks "Invite person" button
Step 2 — Fills invite form: First Name, Last Name, Email, Permission Level (role)
Step 3 — Assigns one or more projects to the invitee
Step 4 — System sends email with magic link to invitee
Step 5 — Invitee clicks link → sets password → auto logged in → lands on Dashboard

---

## BACKEND — What to Build

### New API Endpoints (add to apps/users/views.py UserViewSet)

1. POST /api/v1/users/invite/
   Permission: IsAdminOrOwner
   Request: { firstName, lastName, email, permissionLevel, projectIds[] }
   Actions:
   - Validate email not already in this account
   - Create User: is_active=False, invitation_token=random 64 chars,
     invited_at=now(), placeholder password_hash
   - Create ProjectUserAssignment row for each projectId
   - Trigger Celery: send_invite_email.delay(str(user.id))
   Response 201: serialized User object
   Error 400: { email: ["This email is already in your account."] }

2. GET /api/v1/users/validate-invite/?token=xxxx
   Permission: AllowAny (public — no JWT needed)
   Actions:
   - Find user by invitation_token
   - Check: invited_at is within last 7 days
   - Check: is_active is still False (not already accepted)
   Response 200:
   { isValid: true, firstName, lastName, email, accountName }
   Error 200 (soft):
   { isValid: false, reason: "expired" | "not_found" | "already_used" }

3. POST /api/v1/users/accept-invite/
   Permission: AllowAny (public — no JWT needed)
   Request: { token, password, confirmPassword }
   Actions:
   - Find user by invitation_token, validate not expired
   - Validate password == confirmPassword
   - Set password_hash (bcrypt), is_active=True, clear invitation_token=None
   - Return JWT exactly like login response
   Response 200:
   { access: "jwt-token", user: { id, email, firstName, lastName,
     permissionLevel, accountId, timezone } }
   // Refresh token set as HTTP-only cookie (same as login)

4. POST /api/v1/users/{id}/resend-invite/
   Permission: IsAdminOrOwner
   Actions:
   - Regenerate invitation_token (new 64-char random)
   - Reset invited_at = now()
   - Re-trigger Celery: send_invite_email.delay(str(user.id))
   Response 200: { detail: "Invite resent to jane@example.com" }

### Celery Task (apps/users/tasks.py)
- Task: send_invite_email(user_id)
- Fetch user + account from DB
- Build link: {FRONTEND_URL}/accept-invite?token={invitation_token}
- Send via SendGrid:
  Subject: "You've been invited to join {account.name} on TrackFlow"
  Body: Hi {firstName}, you've been invited. Click to set your password: [link]
  Link expires in 7 days.
- max_retries=3, countdown=60

### DB changes (already in migration, just confirm):
users table must have:
- invitation_token VARCHAR(255) nullable
- invited_at TIMESTAMPTZ nullable
- is_active BOOLEAN default True

---

## FRONTEND — What to Build

### Page 1: AcceptInvitePage
File: src/pages/auth/AcceptInvitePage.tsx
Route: /accept-invite  (PUBLIC — outside ProtectedRoute)
Style: Match LoginPage exactly — centered card, TrackFlow logo on top

Behavior on mount:
- Read token from URL: useSearchParams() → searchParams.get('token')
- Call GET /api/v1/users/validate-invite/?token=xxx using plain axios
  (NOT axiosInstance — this is public, no auth header)

State 1 — Loading:
- Centered spinner with "Validating your invite link..."

State 2 — Invalid/Expired (isValid: false):
- Show appropriate message:
  reason="expired"      → "This invite link has expired (7 days).
                           Ask your admin to resend the invite."
  reason="already_used" → "You've already set up your account. Please log in."
  reason="not_found"    → "This invite link is invalid."
- Button: "Go to Login" → navigates to /login

State 3 — Valid (isValid: true):
- Heading: "Hi {firstName}! 👋"
- Subtext: "You've been invited to join {accountName} on TrackFlow.
            Set your password to get started."
- Email field: pre-filled with invite.email, disabled (read-only, gray bg)
- Password field: show/hide toggle, min 8 chars, 1 uppercase, 1 number
- Confirm Password field: show/hide toggle, must match password
- Validation: react-hook-form + zod
- Submit: "Set Password & Join TrackFlow"
- On success:
    dispatch(setAuth({ user: data.user, accessToken: data.access }))
    navigate('/dashboard', { replace: true })
- On error: show inline red message from response

### Page 2: InvitePage
File: src/pages/team/InvitePage.tsx
Route: /team/invite  (PROTECTED — Admin/Owner only via RoleGuard)
Style: Centered card (max-w-lg), same visual language as SignupPage

Form fields:
1. First Name — required
2. Last Name — required
3. Email — required, email format
4. Permission Level — RadioGroup (shadcn), 3 options with descriptions:
   • Member (default) → "Can log time and view own timesheets"
   • Admin           → "Can manage projects, team, and reports.
                        Cannot delete employees."
   • Owner           → "Full access including billing and
                        employee management."
5. Projects — multiselect dropdown:
   - Fetch with useProjects hook (GET /api/v1/projects/?is_active=true)
   - Show: "Project Name — Client Name" per option
   - Selected count badge: "2 projects selected"
   - Searchable (filter as you type)

Submit button: "Send Invite"
Loading state: spinner + "Sending invite..."
On success:
  - Toast: "Invite sent to {email}!"
  - navigate('/team')
On error email exists:
  - Inline error under email field: "This email is already in your account."

### New Type File
File: src/types/invite.types.ts

export interface InviteFormData {
  firstName: string
  lastName: string
  email: string
  permissionLevel: 'owner' | 'admin' | 'member'
  projectIds: string[]
}

export interface ValidateInviteResponse {
  isValid: boolean
  reason?: 'expired' | 'not_found' | 'already_used'
  firstName?: string
  lastName?: string
  email?: string
  accountName?: string
}

export interface AcceptInvitePayload {
  token: string
  password: string
  confirmPassword: string
}

### New API File
File: src/api/invite.api.ts
- validateToken(token) → plain axios GET (public, no auth)
- acceptInvite(data)   → plain axios POST (public, no auth)
  include: withCredentials: true  (to receive refresh token cookie)
- sendInvite(data)     → axiosInstance POST (needs auth)
- resendInvite(userId) → axiosInstance POST (needs auth)

### New Hook File
File: src/hooks/useInvite.ts
- useValidateInviteToken(token) → useQuery, enabled: !!token, retry: false
- useAcceptInvite()  → useMutation, onSuccess: dispatch setAuth + navigate
- useSendInvite()    → useMutation, onSuccess: invalidate ['users'] queries
- useResendInvite()  → useMutation, onSuccess: invalidate ['users','pending']

### Route additions (src/App.tsx)
Public (outside ProtectedRoute):
  /accept-invite → <AcceptInvitePage />

Protected + AppShell + RoleGuard(['admin','owner']):
  /team/invite → <InvitePage />

---

## Output Format Expected

Deliver in this exact order:
1. Backend: apps/users/tasks.py (Celery email task)
2. Backend: apps/users/views.py additions (4 new actions only, not full file)
3. Backend: config/urls.py additions (new routes only)
4. Frontend: src/types/invite.types.ts
5. Frontend: src/api/invite.api.ts
6. Frontend: src/hooks/useInvite.ts
7. Frontend: src/pages/auth/AcceptInvitePage.tsx
8. Frontend: src/pages/team/InvitePage.tsx
9. Frontend: src/App.tsx additions (routes only, not full file)

For each file — show FULL file content, not snippets.
For modifications (views.py, urls.py, App.tsx) — show only the NEW code
to add, with a comment showing exactly where to insert it.

---
