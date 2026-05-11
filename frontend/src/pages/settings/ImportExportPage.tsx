import {
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import SettingsLayout from './SettingsLayout';
import ImportTimeModal from './ImportTimeModal';
import RevertImportModal from './RevertImportModal';
import { useAuthStore } from '@/store/authStore';
import { useAccountSettingsStore } from '@/store/accountSettingsStore';
import { useConfirm } from '@/components/ConfirmDialog';
import { extractApiError } from '@/utils/errors';
import { downloadCsv, timestampedFilename } from '@/components/reports/csvExport';
import { listTimeEntries } from '@/api/timeEntries';
import { listClients } from '@/api/clients';
import { addSampleData, getAccountSettings, removeSampleData } from '@/api/accountSettings';
import type { ImportTimeResult } from '@/api/imports';

export default function ImportExportPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canManage = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const { confirmDialog, ask } = useConfirm();

  const hasSampleData = useAccountSettingsStore(
    (s) => s.settings?.has_sample_data ?? false,
  );
  const setStoreSettings = useAccountSettingsStore((s) => s.setSettings);

  const refreshSettings = async () => {
    try {
      const next = await getAccountSettings();
      setStoreSettings(next);
    } catch {
      // non-fatal — store keeps stale value, UI will reconcile on next page load
    }
  };

  const [busy, setBusy] = useState<null | 'export-time' | 'export-clients' | 'remove-sample' | 'add-sample'>(null);
  const [flash, setFlash] = useState<{
    kind: 'ok' | 'error';
    msg: React.ReactNode;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);

  const showFlash = (kind: 'ok' | 'error', msg: React.ReactNode, ttlMs = 5000) => {
    setFlash({ kind, msg });
    if (ttlMs > 0) setTimeout(() => setFlash(null), ttlMs);
  };

  const handleExportAllTime = async () => {
    setBusy('export-time');
    setFlash(null);
    try {
      const entries = await listTimeEntries();
      if (entries.length === 0) {
        showFlash('error', 'No time entries to export.');
        return;
      }
      downloadCsv({
        filename: timestampedFilename('all_time_entries'),
        headers: ['Date', 'Person', 'Client', 'Project', 'Task', 'Notes', 'Hours', 'Billable', 'Jira Issue'],
        rows: entries.map((e) => [
          e.date,
          e.user_name,
          e.client_name,
          e.project_name,
          e.task_name,
          e.notes,
          Number.parseFloat(e.hours).toFixed(2),
          e.is_billable ? 'Yes' : 'No',
          e.jira_issue_key,
        ]),
      });
      showFlash('ok', `Exported ${entries.length} time ${entries.length === 1 ? 'entry' : 'entries'}.`);
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not export time entries.'));
    } finally {
      setBusy(null);
    }
  };

  const handleExportClients = async () => {
    setBusy('export-clients');
    setFlash(null);
    try {
      const res = await listClients();
      const clients = res.results;
      if (clients.length === 0) {
        showFlash('error', 'No clients to export.');
        return;
      }
      downloadCsv({
        filename: timestampedFilename('all_clients'),
        headers: ['Name', 'Address', 'Currency', 'Active', 'Contacts'],
        rows: clients.map((c) => [
          c.name,
          c.address,
          c.currency,
          c.is_active ? 'Yes' : 'No',
          c.contacts
            .map((ct) => `${ct.first_name} ${ct.last_name} <${ct.email}>`.trim())
            .join('; '),
        ]),
      });
      showFlash('ok', `Exported ${clients.length} client${clients.length === 1 ? '' : 's'}.`);
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not export clients.'));
    } finally {
      setBusy(null);
    }
  };

  const handleImported = (result: ImportTimeResult) => {
    setImportOpen(false);
    if (result.created === 0 && result.errors.length > 0) {
      showFlash(
        'error',
        `No rows imported. First error: ${result.errors[0].error}`,
      );
      return;
    }

    const range = result.date_range;
    const viewLink =
      range?.start && range?.end ? (
        <Link
          to={`/reports/detailed-time?start_date=${range.start}&end_date=${range.end}`}
          className="font-semibold underline hover:no-underline"
        >
          View imported entries →
        </Link>
      ) : null;

    const summary =
      result.errors.length > 0
        ? `Imported ${result.created} rows; ${result.errors.length} skipped. First error: ${result.errors[0].error}`
        : `Imported ${result.created} time ${result.created === 1 ? 'entry' : 'entries'}.`;

    // Keep the success flash visible long enough for the user to click the link.
    showFlash(
      'ok',
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <span>{summary}</span>
        {viewLink}
      </span>,
      12000,
    );
  };

  const handleReverted = (deletedCount: number) => {
    setRevertOpen(false);
    showFlash(
      'ok',
      `Reverted ${deletedCount} time ${deletedCount === 1 ? 'entry' : 'entries'}.`,
    );
  };

  const handleRemoveSample = async () => {
    if (!canManage) return;
    const ok = await ask({
      title: 'Remove all sample data?',
      message:
        'This permanently deletes every [SAMPLE]-prefixed client, project, and their time entries. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove sample data',
    });
    if (!ok) return;
    setBusy('remove-sample');
    setFlash(null);
    try {
      const result = await removeSampleData();
      const total = result.clients_removed + result.projects_removed + result.time_entries_removed;
      if (total === 0) {
        showFlash('ok', 'No sample data found in this workspace.');
      } else {
        showFlash(
          'ok',
          `Removed ${result.clients_removed} client(s), ${result.projects_removed} project(s), and ${result.time_entries_removed} time entr${result.time_entries_removed === 1 ? 'y' : 'ies'}.`,
        );
      }
      await refreshSettings();
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not remove sample data.'));
    } finally {
      setBusy(null);
    }
  };

  const handleAddSample = async () => {
    if (!canManage) return;
    setBusy('add-sample');
    setFlash(null);
    try {
      const result = await addSampleData();
      showFlash(
        'ok',
        `Seeded ${result.clients_added} sample clients and ${result.projects_added} sample projects (each with ${result.tasks_linked_per_project} tasks).`,
      );
      await refreshSettings();
    } catch (err) {
      showFlash('error', extractApiError(err, 'Could not add sample data.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsLayout
      title="Import / Export"
      description="Move data in and out of KlokView."
    >
      {confirmDialog}
      <div className="space-y-10">
        {flash ? (
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              flash.kind === 'ok'
                ? 'border-accent/30 bg-accent-soft/60 text-accent-dark'
                : 'border-danger/30 bg-danger/10 text-danger'
            }`}
          >
            {flash.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : null}
            {flash.msg}
          </div>
        ) : null}

        {!canManage ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Only owners and admins can import or export workspace data.
          </div>
        ) : null}

        {/* Sample data — top section, full width, status-aware */}
        <SectionCard
          icon={<Sparkles className="h-5 w-5" />}
          iconTone="primary"
          title="Sample data"
          badge={
            hasSampleData ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent-dark">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
                Not loaded
              </span>
            )
          }
          intro={
            hasSampleData ? (
              <>
                <strong className="font-semibold text-text">
                  Your workspace contains sample data.
                </strong>{' '}
                The <code className="rounded bg-slate-100 px-1 font-mono text-xs">[SAMPLE]</code>{' '}
                clients and projects help you and your team learn KlokView. Once you&apos;re set
                up, you can clear them.
              </>
            ) : (
              <>
                Want to explore KlokView with pre-built data? Add a fresh batch of{' '}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">[SAMPLE]</code>{' '}
                clients and projects so you can play with reports, budgets, and timesheets without
                touching real data.
              </>
            )
          }
        >
          {hasSampleData ? (
            <button
              type="button"
              onClick={handleRemoveSample}
              disabled={!canManage || busy === 'remove-sample'}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-text shadow-sm transition hover:border-danger/40 hover:bg-danger/5 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Database className="h-4 w-4" />
              {busy === 'remove-sample' ? 'Removing…' : 'Remove sample data'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAddSample}
              disabled={!canManage || busy === 'add-sample'}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {busy === 'add-sample' ? 'Adding…' : 'Add sample data'}
            </button>
          )}
        </SectionCard>

        {/* Import + Export side-by-side on widescreen, stacked on mobile */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Import data */}
          <SectionCard
            icon={<Upload className="h-5 w-5" />}
            iconTone="primary"
            title="Import data"
            intro={
              <>
                Bring existing data into KlokView from CSV. You can also import projects, people,
                and clients from their respective pages.
              </>
            }
          >
            <div className="grid grid-cols-1 gap-2">
              <ActionTile
                icon={<Users className="h-4 w-4" />}
                title="Import clients"
                subtitle="Bulk-add clients from a CSV file"
                href="/manage/clients"
              />
              <ActionTile
                icon={<FileSpreadsheet className="h-4 w-4" />}
                title="Import time"
                subtitle="Bulk-add time entries from a CSV"
                onClick={() => setImportOpen(true)}
                disabled={!canManage}
              />
              <ActionTile
                icon={<RotateCcw className="h-4 w-4" />}
                title="Revert an import"
                subtitle="Undo time entries from a previous import"
                onClick={() => setRevertOpen(true)}
                disabled={!canManage}
              />
            </div>
          </SectionCard>

          {/* Export data */}
          <SectionCard
            icon={<Download className="h-5 w-5" />}
            iconTone="accent"
            title="Export data"
            intro={
              <>
                Export workspace data as CSV. You can also export projects, people, and clients
                from their respective pages.
              </>
            }
          >
            <div className="grid grid-cols-1 gap-2">
              <ActionTile
                icon={<FileSpreadsheet className="h-4 w-4" />}
                title="Export all time"
                subtitle="Download every time entry as a CSV"
                onClick={handleExportAllTime}
                disabled={busy === 'export-time'}
                busyLabel={busy === 'export-time' ? 'Exporting…' : undefined}
              />
              <ActionTile
                icon={<Users className="h-4 w-4" />}
                title="Export all clients"
                subtitle="Download the client list with contacts"
                onClick={handleExportClients}
                disabled={busy === 'export-clients'}
                busyLabel={busy === 'export-clients' ? 'Exporting…' : undefined}
              />
            </div>
          </SectionCard>
        </div>
      </div>

      {importOpen ? (
        <ImportTimeModal
          onClose={() => setImportOpen(false)}
          onImported={handleImported}
        />
      ) : null}
      {revertOpen ? (
        <RevertImportModal
          onClose={() => setRevertOpen(false)}
          onReverted={handleReverted}
        />
      ) : null}
    </SettingsLayout>
  );
}

type IconTone = 'primary' | 'accent';

const ICON_TILE: Record<IconTone, string> = {
  primary: 'bg-primary-soft text-primary',
  accent: 'bg-accent-soft text-accent-dark',
};

function SectionCard({
  icon,
  iconTone,
  title,
  badge,
  intro,
  children,
}: {
  icon: React.ReactNode;
  iconTone: IconTone;
  title: string;
  badge?: React.ReactNode;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6 transition hover:shadow-lg">
      <div className="flex items-start gap-4">
        <div
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${ICON_TILE[iconTone]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-xl font-bold text-text">{title}</h2>
            {badge}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-text/75">{intro}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  href,
  onClick,
  disabled,
  busyLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  busyLabel?: string;
}) {
  const className =
    'group flex w-full items-center gap-3 rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-px hover:border-primary/60 hover:bg-primary-soft/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:shadow-sm';
  const inner = (
    <>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition group-hover:bg-primary group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{busyLabel ?? title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </>
  );
  if (href) {
    return (
      <Link to={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {inner}
    </button>
  );
}
