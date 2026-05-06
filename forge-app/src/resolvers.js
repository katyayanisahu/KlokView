/**
 * Resolver — server-side handlers callable from the panel via @forge/bridge.
 *
 * Two responsibilities:
 *   1. `bootstrap` — auto-creates a JiraConnection on the KlokView side so
 *      the workspace shows "Connected" without needing a manual clientKey
 *      paste. Mimics the public Marketplace install lifecycle.
 *   2. `getEntries` — returns existing time entries logged against this
 *      Jira issue, for the read-only event log section of the panel.
 */
import Resolver from '@forge/resolver';
import api from '@forge/api';

// Dev URL via Cloudflare Tunnel — `cloudflared tunnel --url http://localhost:8000`.
// Replace with your real deployed Django URL for production.
const KLOKVIEW_BACKEND = 'https://mailing-closing-until-district.trycloudflare.com';

const standardHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'KlokViewForge/1.0',
};

const resolver = new Resolver();

resolver.define('bootstrap', async ({ context }) => {
  // The Forge runtime exposes the calling Atlassian site's stable
  // identifier as `cloudId`. We use it as the JiraConnection client_key.
  const cloudId = context?.cloudId || '';
  const baseUrl = context?.siteUrl || '';
  if (!cloudId) {
    return { connected: false, error: 'No cloudId in Forge context.' };
  }

  try {
    const res = await api.fetch(`${KLOKVIEW_BACKEND}/api/v1/integrations/jira/bootstrap/`, {
      method: 'POST',
      headers: standardHeaders,
      body: JSON.stringify({ cloud_id: cloudId, base_url: baseUrl }),
    });
    if (!res.ok) {
      return { connected: false, error: `Bootstrap failed: HTTP ${res.status}` };
    }
    return await res.json();
  } catch (e) {
    return { connected: false, error: String(e) };
  }
});

resolver.define('getEntries', async ({ payload }) => {
  const issueKey = (payload && payload.issueKey) || '';
  if (!issueKey) {
    return { entries: [], error: null };
  }

  try {
    const res = await api.fetch(
      `${KLOKVIEW_BACKEND}/api/v1/integrations/jira/entries/?issue_key=${encodeURIComponent(issueKey)}`,
      {
        method: 'GET',
        headers: standardHeaders,
      },
    );
    if (!res.ok) {
      return { entries: [], error: `KlokView returned ${res.status}` };
    }
    const data = await res.json();
    return { entries: Array.isArray(data) ? data : [], error: null };
  } catch (e) {
    return { entries: [], error: String(e) };
  }
});

export const handler = resolver.getDefinitions();
