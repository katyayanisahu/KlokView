/**
 * KlokView Time Tracking — Jira issue panel UI (UI Kit 2 / @forge/react).
 *
 * Sections:
 *   1. Header     — issue key + default user + "Open in KlokView" link
 *   2. Active     — running timer for this issue, with Stop button
 *   3. Start form — project + task picker, notes, billable, Start button
 *   4. Log        — read-only list of entries already logged on this issue
 *
 * Server calls go through resolvers (`src/resolvers.js`):
 *   bootstrap → getEntries + getProjects → startTimer / stopTimer.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Checkbox,
  Heading,
  Inline,
  Link,
  LoadingButton,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  TextArea,
  Lozenge,
} from '@forge/react';
import { invoke, view } from '@forge/bridge';

// Web URL is resolved at runtime from Forge environment variables (set via
// `forge variables set --environment <env> KLOKVIEW_WEB_URL <url>`). The
// resolver returns it from `bootstrap`, so the panel always uses the URL
// appropriate to the deployed environment — no rebuild required to change it.
const FALLBACK_WEB_URL = 'https://app.klokview.invalid';

const App = () => {
  const [issueKey, setIssueKey] = useState('');
  const [defaultUserName, setDefaultUserName] = useState(null);
  const [webUrl, setWebUrl] = useState(FALLBACK_WEB_URL);

  // Data
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);

  // Form state
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [notes, setNotes] = useState('');
  const [isBillable, setIsBillable] = useState(true);

  // Lifecycle
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const runningEntry = useMemo(
    () => entries.find((e) => e.is_running && e.jira_issue_key === issueKey),
    [entries, issueKey],
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        label: p.client_name ? `${p.name} — ${p.client_name}` : p.name,
        value: String(p.id),
      })),
    [projects],
  );

  const taskOptions = useMemo(
    () =>
      (selectedProject?.project_tasks || []).map((pt) => ({
        label: pt.name,
        value: String(pt.id),
      })),
    [selectedProject],
  );

  // ---- data load ----

  const refresh = useCallback(async (key) => {
    setError(null);
    try {
      const [{ entries: entryList, error: entryErr }, projResult] = await Promise.all([
        invoke('getEntries', { issueKey: key }),
        invoke('getProjects'),
      ]);
      if (entryErr) {
        setError(entryErr);
      } else {
        setEntries(entryList || []);
      }
      if (projResult?.error) {
        setError((prev) => prev || projResult.error);
      } else {
        setProjects(projResult?.projects || []);
        setDefaultUserName(projResult?.defaultUserName || null);
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const ctx = await view.getContext();
        const key =
          ctx?.extension?.issue?.key ?? ctx?.platformContext?.issueKey ?? '';
        setIssueKey(key);

        // Bootstrap auto-links the workspace (no manual claim needed in dev).
        const boot = await invoke('bootstrap').catch(() => null);
        if (boot && boot.default_user_name) {
          setDefaultUserName(boot.default_user_name);
        }
        if (boot && boot.web_url) {
          setWebUrl(boot.web_url);
        }

        await refresh(key);
      } catch (e) {
        setError(`Mount failed: ${String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  // Auto-pick first project/task once data arrives so user can hit Start immediately.
  useEffect(() => {
    if (selectedProjectId === null && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProject) {
      const tasks = selectedProject.project_tasks || [];
      // Reset task choice when project changes (or invalid).
      const stillValid = tasks.some((pt) => pt.id === selectedTaskId);
      if (!stillValid) {
        const firstId = tasks.length > 0 ? tasks[0].id : null;
        setSelectedTaskId(firstId);
        const firstTask = tasks[0];
        if (firstTask) setIsBillable(firstTask.is_billable);
      }
    } else {
      setSelectedTaskId(null);
    }
  }, [selectedProject, selectedTaskId]);

  // ---- actions ----

  const handleStart = async () => {
    if (!selectedProjectId || !selectedTaskId) {
      setError('Pick a project and task before starting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const result = await invoke('startTimer', {
        issueKey,
        projectId: selectedProjectId,
        projectTaskId: selectedTaskId,
        notes: notes.trim(),
        isBillable,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setNotes('');
        setInfo('Timer started — keep this Jira tab open while tracking.');
        await refresh(issueKey);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async () => {
    if (!runningEntry) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const result = await invoke('stopTimer', { entryId: runningEntry.id });
      if (result?.error) {
        setError(result.error);
      } else {
        setInfo('Timer stopped. Entry saved to KlokView.');
        await refresh(issueKey);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----

  if (loading) {
    return (
      <Box padding="space.200">
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" />
          <Text>Loading KlokView…</Text>
        </Inline>
      </Box>
    );
  }

  return (
    <Stack space="space.200">
      {/* Header */}
      <Stack space="space.050">
        <Heading as="h4">KlokView Time Tracking</Heading>
        <Inline space="space.100" alignBlock="center">
          {issueKey ? <Lozenge appearance="inprogress">{issueKey}</Lozenge> : null}
          {defaultUserName ? (
            <Text size="small">Logging as {defaultUserName}</Text>
          ) : null}
        </Inline>
        <Link href={`${webUrl}/time`} openNewTab>
          Open in KlokView →
        </Link>
      </Stack>

      {/* Error / info banners */}
      {error ? (
        <SectionMessage appearance="error" title="Something went wrong">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
      {info ? (
        <SectionMessage appearance="success">
          <Text>{info}</Text>
        </SectionMessage>
      ) : null}

      {/* Running timer */}
      {runningEntry ? (
        <Box
          padding="space.150"
          backgroundColor="color.background.accent.green.subtlest"
          xcss={{ borderRadius: 'border.radius' }}
        >
          <Stack space="space.100">
            <Inline space="space.100" alignBlock="center" spread="space-between">
              <Text weight="bold">Timer running</Text>
              <Lozenge appearance="success">{Number(runningEntry.hours || 0).toFixed(2)} h committed</Lozenge>
            </Inline>
            <Text size="small">
              {runningEntry.project_name || ''}
              {runningEntry.task_name ? ` · ${runningEntry.task_name}` : ''}
            </Text>
            <LoadingButton
              appearance="warning"
              isLoading={submitting}
              onClick={handleStop}
            >
              Stop timer
            </LoadingButton>
          </Stack>
        </Box>
      ) : (
        <Stack space="space.150">
          <Heading as="h5">Log time on {issueKey || 'this issue'}</Heading>

          {projects.length === 0 ? (
            <SectionMessage appearance="warning" title="No projects available">
              <Text>
                Your KlokView workspace has no active projects you can log against.
                Create a project or ask an admin to add you to one.
              </Text>
            </SectionMessage>
          ) : (
            <>
              <Stack space="space.050">
                <Text size="small" weight="bold">Project</Text>
                <Select
                  appearance="default"
                  options={projectOptions}
                  value={
                    projectOptions.find((o) => o.value === String(selectedProjectId)) || null
                  }
                  onChange={(opt) => setSelectedProjectId(opt ? Number(opt.value) : null)}
                  isDisabled={submitting}
                />
              </Stack>

              <Stack space="space.050">
                <Text size="small" weight="bold">Task</Text>
                <Select
                  appearance="default"
                  options={taskOptions}
                  value={
                    taskOptions.find((o) => o.value === String(selectedTaskId)) || null
                  }
                  onChange={(opt) => setSelectedTaskId(opt ? Number(opt.value) : null)}
                  isDisabled={submitting || taskOptions.length === 0}
                />
                {taskOptions.length === 0 ? (
                  <Text size="small">This project has no tasks configured.</Text>
                ) : null}
              </Stack>

              <Stack space="space.050">
                <Text size="small" weight="bold">Notes (optional)</Text>
                <TextArea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={`Working on ${issueKey || 'this issue'}…`}
                  isDisabled={submitting}
                />
              </Stack>

              <Checkbox
                isChecked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                label="Billable"
                isDisabled={submitting}
              />

              <LoadingButton
                appearance="primary"
                isLoading={submitting}
                isDisabled={!selectedProjectId || !selectedTaskId}
                onClick={handleStart}
              >
                Start timer
              </LoadingButton>
            </>
          )}
        </Stack>
      )}

      {/* Logged time on this issue */}
      <Stack space="space.100">
        <Heading as="h5">Logged time on this issue</Heading>
        {entries.length === 0 ? (
          <Text size="small">No entries yet.</Text>
        ) : (
          entries.slice(0, 10).map((entry) => (
            <Box
              key={entry.id}
              padding="space.100"
              xcss={{
                borderRadius: 'border.radius',
                borderWidth: 'border.width',
                borderStyle: 'solid',
                borderColor: 'color.border',
              }}
            >
              <Stack space="space.050">
                <Inline space="space.100" spread="space-between" alignBlock="center">
                  <Text weight="bold">
                    {Number(entry.hours || 0).toFixed(2)} h
                    {entry.is_running ? ' (running)' : ''}
                  </Text>
                  <Text size="small">{entry.date}</Text>
                </Inline>
                <Text size="small">
                  {entry.user_name || `User #${entry.user_id}`} ·{' '}
                  {entry.project_name || ''}
                  {entry.task_name ? ` · ${entry.task_name}` : ''}
                </Text>
                {entry.notes ? <Text size="small">"{entry.notes}"</Text> : null}
              </Stack>
            </Box>
          ))
        )}
      </Stack>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
