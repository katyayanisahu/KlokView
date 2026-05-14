/**
 * Resolver — server-side handlers callable from the panel via @forge/bridge.
 *
 * Responsibilities:
 *   - `bootstrap`     — auto-creates / refreshes the JiraConnection so the
 *                       workspace shows "Connected" without manual claim.
 *   - `getEntries`    — read existing time entries logged against this issue.
 *   - `getProjects`   — list workspace projects + tasks for the picker.
 *   - `startTimer`    — start a new KlokView timer scoped to this issue.
 *   - `stopTimer`     — stop a running timer.
 *
 * Every call passes `cloud_id` (from Forge context.cloudId) — backend uses it
 * to resolve the JiraConnection in lieu of an Atlassian-signed JWT (dev mode).
 */
import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

// Backend + web URLs come from Forge environment variables — set per env via:
//   forge variables set --environment production KLOKVIEW_BACKEND_URL https://api.klokview.com
//   forge variables set --environment production KLOKVIEW_WEB_URL     https://app.klokview.com
//   forge variables set --environment production --encrypt KLOKVIEW_API_KEY <shared-secret>
//
// For local dev: `forge tunnel` rewrites the prod URL → localhost:8000 transparently,
// so the dev workflow is unchanged — just set dev-env variables once with:
//   forge variables set --environment development KLOKVIEW_BACKEND_URL https://api.klokview.com
//   forge variables set --environment development --encrypt KLOKVIEW_API_KEY <dev-secret>
//
// The fallback values below are used ONLY if no Forge variable is set — keep them
// pointing at a placeholder so a misconfigured deploy fails loudly instead of
// silently talking to the wrong host.
const KLOKVIEW_BACKEND = process.env.KLOKVIEW_BACKEND_URL || 'https://api.klokview.invalid';
const KLOKVIEW_WEB = process.env.KLOKVIEW_WEB_URL || 'https://app.klokview.invalid';
const KLOKVIEW_API_KEY = process.env.KLOKVIEW_API_KEY || '';

const standardHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'KlokViewForge/1.0',
  // Shared-secret auth between the Forge app and the Django backend. The
  // backend rejects calls whose key doesn't match `JIRA_FORGE_API_KEY` env var,
  // so even if the backend URL leaks, random callers can't hit /jira/start/ etc.
  ...(KLOKVIEW_API_KEY ? { Authorization: `Bearer ${KLOKVIEW_API_KEY}` } : {}),
};

const resolver = new Resolver();

function cloudIdFrom(context) {
  return context?.cloudId || '';
}

function siteUrlFrom(context) {
  return context?.siteUrl || '';
}

// Fetch the calling Jira user's identity (email + accountId). Used by every
// resolver that needs user-scoped filtering so the backend can resolve the
// corresponding KlokView user by email match.
async function fetchJiraIdentity(context) {
  const accountId = context?.accountId || '';
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/myself`);
    if (!res.ok) return { email: '', accountId };
    const data = await res.json();
    return { email: data.emailAddress || '', accountId: data.accountId || accountId };
  } catch (_) {
    return { email: '', accountId };
  }
}

resolver.define('whoami', async ({ context }) => {
  // Returns the current Jira user's identity. Two-step:
  //   1. context.accountId  — stable Atlassian Account ID (always present)
  //   2. /rest/api/3/myself — email + displayName via user-context call
  // `requestJira(... { asUser })` runs as the calling Jira user so the
  // endpoint resolves to *their* profile, not the app's identity.
  const accountId = context?.accountId || null;
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/myself`);
    if (!res.ok) {
      return { accountId, email: null, displayName: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      accountId: data.accountId || accountId,
      email: data.emailAddress || null,
      displayName: data.displayName || null,
      error: null,
    };
  } catch (e) {
    return { accountId, email: null, displayName: null, error: String(e) };
  }
});

resolver.define('bootstrap', async ({ context }) => {
  const cloudId = cloudIdFrom(context);
  const baseUrl = siteUrlFrom(context);
  if (!cloudId) {
    return { connected: false, error: 'No cloudId in Forge context.' };
  }
  const me = await fetchJiraIdentity(context);
  try {
    const res = await api.fetch(`${KLOKVIEW_BACKEND}/api/v1/integrations/jira/bootstrap/`, {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify({
        cloud_id: cloudId,
        base_url: baseUrl,
        jira_email: me.email,
        jira_account_id: me.accountId,
      }),
    });
    if (!res.ok) {
      return { connected: false, error: `Bootstrap failed: HTTP ${res.status}` };
    }
    const data = await res.json();
    // The panel needs to know which KlokView web URL to deep-link to. The
    // resolver is the only place with access to Forge environment variables,
    // so we surface it here once and the UI keeps it across renders.
    return { ...data, web_url: KLOKVIEW_WEB };
  } catch (e) {
    return { connected: false, error: String(e) };
  }
});

resolver.define('getEntries', async ({ context, payload }) => {
  const cloudId = cloudIdFrom(context);
  const issueKey = (payload && payload.issueKey) || '';
  if (!issueKey) {
    return { entries: [], error: null };
  }
  const me = await fetchJiraIdentity(context);
  try {
    const qs = new URLSearchParams({
      issue_key: issueKey,
      cloud_id: cloudId,
      jira_email: me.email,
      jira_account_id: me.accountId,
    }).toString();
    const url = `${KLOKVIEW_BACKEND}/api/v1/integrations/jira/entries/?${qs}`;
    const res = await api.fetch(url, { method: 'GET', headers: standardHeaders });
    if (!res.ok) {
      return { entries: [], error: `KlokView returned ${res.status}` };
    }
    const data = await res.json();
    return { entries: Array.isArray(data) ? data : [], error: null };
  } catch (e) {
    return { entries: [], error: String(e) };
  }
});

resolver.define('getProjects', async ({ context }) => {
  const cloudId = cloudIdFrom(context);
  if (!cloudId) {
    return { projects: [], error: 'No cloudId.' };
  }
  const me = await fetchJiraIdentity(context);
  try {
    const qs = new URLSearchParams({
      cloud_id: cloudId,
      jira_email: me.email,
      jira_account_id: me.accountId,
    }).toString();
    const url = `${KLOKVIEW_BACKEND}/api/v1/integrations/jira/projects/?${qs}`;
    const res = await api.fetch(url, { method: 'GET', headers: standardHeaders });
    if (!res.ok) {
      return { projects: [], error: `KlokView returned ${res.status}` };
    }
    const data = await res.json();
    return {
      projects: data.projects || [],
      defaultUserId: data.default_user_id || null,
      defaultUserName: data.default_user_name || null,
      defaultUserRole: data.default_user_role || null,
      error: null,
    };
  } catch (e) {
    return { projects: [], error: String(e) };
  }
});

resolver.define('startTimer', async ({ context, payload }) => {
  const cloudId = cloudIdFrom(context);
  const me = await fetchJiraIdentity(context);
  const body = {
    cloud_id: cloudId,
    jira_email: me.email,
    jira_account_id: me.accountId,
    issue_key: payload?.issueKey || '',
    project_id: payload?.projectId,
    project_task_id: payload?.projectTaskId,
    notes: payload?.notes || '',
    is_billable: payload?.isBillable !== false,
  };
  try {
    const res = await api.fetch(`${KLOKVIEW_BACKEND}/api/v1/integrations/jira/start/`, {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = JSON.parse(text).detail || detail; } catch (_) {}
      return { entry: null, error: detail };
    }
    return { entry: JSON.parse(text), error: null };
  } catch (e) {
    return { entry: null, error: String(e) };
  }
});

resolver.define('stopTimer', async ({ context, payload }) => {
  const cloudId = cloudIdFrom(context);
  const me = await fetchJiraIdentity(context);
  const body = {
    cloud_id: cloudId,
    jira_email: me.email,
    jira_account_id: me.accountId,
    id: payload?.entryId,
  };
  try {
    const res = await api.fetch(`${KLOKVIEW_BACKEND}/api/v1/integrations/jira/stop/`, {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { detail = JSON.parse(text).detail || detail; } catch (_) {}
      return { entry: null, error: detail };
    }
    return { entry: JSON.parse(text), error: null };
  } catch (e) {
    return { entry: null, error: String(e) };
  }
});

export const handler = resolver.getDefinitions();
