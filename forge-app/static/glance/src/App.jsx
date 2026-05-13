/**
 * KlokView Time Tracking — Custom UI glance.
 *
 * Renders inside the Jira issue Details sidebar (jira:issueGlance). Calls the
 * same Forge resolvers as the issuePanel/issueAction UI via @forge/bridge.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, router, view } from '@forge/bridge';

// Match this to the KlokView web app URL. Replace with prod URL on deploy.
const KLOKVIEW_WEB_URL = 'http://localhost:5173';

export default function App() {
  const [issueKey, setIssueKey] = useState('');
  const [defaultUserName, setDefaultUserName] = useState(null);
  const [defaultUserRole, setDefaultUserRole] = useState(null);

  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);

  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [notes, setNotes] = useState('');

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

  const taskOptions = useMemo(
    () => selectedProject?.project_tasks || [],
    [selectedProject],
  );

  // Harvest-style: group tasks by billable status. Each group becomes an
  // <optgroup> in the dropdown so the user sees the billable state inline.
  const taskGroups = useMemo(() => {
    const billable = [];
    const nonBillable = [];
    taskOptions.forEach((pt) => {
      (pt.is_billable ? billable : nonBillable).push(pt);
    });
    return { billable, nonBillable };
  }, [taskOptions]);

  // Billable status is now DERIVED from the selected task (no separate
  // checkbox). Eliminates redundant UI and prevents the value from drifting
  // away from the task's configured billable rate.
  const selectedTask = useMemo(
    () => taskOptions.find((pt) => pt.id === selectedTaskId) || null,
    [taskOptions, selectedTaskId],
  );
  const isBillable = selectedTask?.is_billable ?? true;

  const refresh = useCallback(async (key) => {
    setError(null);
    try {
      const [entryResult, projResult] = await Promise.all([
        invoke('getEntries', { issueKey: key }),
        invoke('getProjects'),
      ]);
      if (entryResult?.error) {
        setError(entryResult.error);
      } else {
        setEntries(entryResult?.entries || []);
      }
      if (projResult?.error) {
        setError((prev) => prev || projResult.error);
      } else {
        setProjects(projResult?.projects || []);
        if (projResult?.defaultUserName) setDefaultUserName(projResult.defaultUserName);
        if (projResult?.defaultUserRole) setDefaultUserRole(projResult.defaultUserRole);
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

        const boot = await invoke('bootstrap').catch(() => null);
        if (boot?.default_user_name) setDefaultUserName(boot.default_user_name);
        if (boot?.default_user_role) setDefaultUserRole(boot.default_user_role);

        await refresh(key);
      } catch (e) {
        setError(`Mount failed: ${String(e)}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (selectedProjectId === null && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProject) {
      const tasks = selectedProject.project_tasks || [];
      const stillValid = tasks.some((pt) => pt.id === selectedTaskId);
      if (!stillValid) {
        setSelectedTaskId(tasks[0]?.id ?? null);
      }
    } else {
      setSelectedTaskId(null);
    }
  }, [selectedProject, selectedTaskId]);

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
        setInfo('Timer started.');
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
        setInfo('Timer stopped. Saved to KlokView.');
        await refresh(issueKey);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="kv-root">
        <div className="kv-loading">
          <span className="kv-spinner" />
          <span>Loading KlokView…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="kv-root">
      <h3 className="kv-h">KlokView Time Tracking</h3>
      <div className="kv-row kv-mb-8">
        {issueKey ? <span className="kv-lozenge">{issueKey}</span> : null}
        {defaultUserName ? (
          <span className="kv-sub">Logging as {defaultUserName}</span>
        ) : null}
      </div>

      {error ? <div className="kv-banner error">{error}</div> : null}
      {info ? <div className="kv-banner success">{info}</div> : null}

      {runningEntry ? (
        <div className="kv-running">
          <div className="kv-spaced kv-mb-8">
            <strong>Timer running</strong>
            <span className="kv-lozenge success">
              {Number(runningEntry.hours || 0).toFixed(2)} h committed
            </span>
          </div>
          <div className="kv-sub kv-mb-8">
            {runningEntry.project_name || ''}
            {runningEntry.task_name ? ` · ${runningEntry.task_name}` : ''}
          </div>
          <button
            type="button"
            className="kv-btn warn block"
            onClick={handleStop}
            disabled={submitting}
          >
            {submitting ? 'Stopping…' : 'Stop timer'}
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="kv-banner warn">
          No projects available. Create a project in KlokView or ask an admin to
          add you to one.
        </div>
      ) : (
        <>
          <div className="kv-field">
            <div className="kv-spaced kv-mb-4">
              <label className="kv-label" style={{ margin: 0 }}>Project</label>
              {/* /projects/new in KlokView is owner/admin-only (App.tsx routes).
                  Hide the link for members so we don't navigate them into a
                  permission-denied wall. */}
              {defaultUserRole === 'owner' || defaultUserRole === 'admin' ? (
                <a
                  href={`${KLOKVIEW_WEB_URL}/projects/new`}
                  onClick={(e) => {
                    e.preventDefault();
                    router.open(`${KLOKVIEW_WEB_URL}/projects/new`);
                  }}
                  className="kv-create-link"
                >
                  + Create project
                </a>
              ) : null}
            </div>
            <select
              className="kv-select"
              value={selectedProjectId ?? ''}
              onChange={(e) => setSelectedProjectId(Number(e.target.value))}
              disabled={submitting}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.client_name ? `${p.name} — ${p.client_name}` : p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="kv-field">
            <label className="kv-label">Task</label>
            <select
              className="kv-select"
              value={selectedTaskId ?? ''}
              onChange={(e) => setSelectedTaskId(Number(e.target.value))}
              disabled={submitting || taskOptions.length === 0}
            >
              {taskOptions.length === 0 ? (
                <option value="">No tasks configured</option>
              ) : (
                <>
                  {taskGroups.billable.length > 0 ? (
                    <optgroup label="Billable">
                      {taskGroups.billable.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {taskGroups.nonBillable.length > 0 ? (
                    <optgroup label="Non-Billable">
                      {taskGroups.nonBillable.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </>
              )}
            </select>
          </div>

          <div className="kv-field">
            <label className="kv-label">Notes (optional)</label>
            <textarea
              className="kv-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`Working on ${issueKey || 'this issue'}…`}
              disabled={submitting}
            />
          </div>

          <button
            type="button"
            className="kv-btn primary block"
            onClick={handleStart}
            disabled={submitting || !selectedProjectId || !selectedTaskId}
          >
            {submitting ? 'Starting…' : 'Start timer'}
          </button>
        </>
      )}

      <div className="kv-divider" />

      <h4 className="kv-h">Logged time on this issue</h4>
      {entries.length === 0 ? (
        <div className="kv-sub">No entries yet.</div>
      ) : (
        <div className="kv-entries">
          {entries.slice(0, 10).map((entry) => (
            <div key={entry.id} className="kv-entry">
              <div className="kv-spaced kv-mb-8">
                <strong>
                  {Number(entry.hours || 0).toFixed(2)} h
                  {entry.is_running ? ' (running)' : ''}
                </strong>
                <span className="kv-sub">{entry.date}</span>
              </div>
              <div className="who">
                {entry.user_name || `User #${entry.user_id}`} ·{' '}
                {entry.project_name || ''}
                {entry.task_name ? ` · ${entry.task_name}` : ''}
              </div>
              {entry.notes ? <div className="notes">"{entry.notes}"</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
