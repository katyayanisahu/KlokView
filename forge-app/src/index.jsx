/**
 * KlokView Time Tracking — Jira issue panel UI (UI Kit 2 / @forge/react).
 *
 * MINIMAL DEBUG VERSION — confirms Forge React bundle loads + renders.
 * Once we see "Hello from KlokView!", we'll restore the full UI.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text } from '@forge/react';
import { invoke, view } from '@forge/bridge';

const App = () => {
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    (async () => {
      try {
        const ctx = await view.getContext();
        const issueKey =
          ctx?.extension?.issue?.key ?? ctx?.platformContext?.issueKey ?? '(no key)';
        setStatus(`Issue: ${issueKey}`);

        // Fire bootstrap (don't block UI on it)
        invoke('bootstrap').catch(() => undefined);

        // Fetch entries
        const result = await invoke('getEntries', { issueKey });
        if (result?.error) {
          setStatus(`Issue: ${issueKey} — Error: ${result.error}`);
        } else {
          setStatus(`Issue: ${issueKey} — ${(result?.entries || []).length} entries`);
        }
      } catch (e) {
        setStatus(`Mount error: ${String(e)}`);
      }
    })();
  }, []);

  return (
    <>
      <Text>Hello from KlokView! 👋</Text>
      <Text>{status}</Text>
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
