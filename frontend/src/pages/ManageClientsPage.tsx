import { Archive, ChevronDown, Download, Pencil, Plus, RotateCcw, Search, Trash2, Upload, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import ManageSubnav from '@/components/ManageSubnav';
import PageHero from '@/components/PageHero';
import NewClientModal from '@/components/NewClientModal';
import ContactModal from '@/components/ContactModal';
import { useConfirm } from '@/components/ConfirmDialog';
import { useUndoDelete } from '@/hooks/useUndoDelete';
import { archiveClient, createClient, deleteContact, listClients, restoreClient } from '@/api/clients';
import { extractApiError } from '@/utils/errors';
import type { Client, ClientContact } from '@/types';

type StatusFilter = 'active' | 'archived';

interface ContactModalState {
  client: Pick<Client, 'id' | 'name'>;
  contact: ClientContact | null;
}

export default function ManageClientsPage() {
  const { confirmDialog, ask } = useConfirm();
  const [clients, setClients] = useState<Client[]>([]);

  const {
    pending: pendingContactDelete,
    scheduleDelete: scheduleContactDelete,
    undo: undoContactDelete,
  } = useUndoDelete<ClientContact>({
    apiDelete: async (k) => { await deleteContact(k.id); },
    removeFromList: (k) =>
      setClients((prev) =>
        prev.map((c) =>
          c.id === k.client ? { ...c, contacts: c.contacts.filter((x) => x.id !== k.id) } : c,
        ),
      ),
    restoreToList: (k, idx) =>
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== k.client) return c;
          const next = [...c.contacts];
          next.splice(idx, 0, k);
          return { ...c, contacts: next };
        }),
      ),
    getLabel: (k) => `${k.first_name} ${k.last_name}`.trim() || k.email || 'Contact',
    onError: (err) => alert(extractApiError(err, 'Could not delete contact.')),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [contactModal, setContactModal] = useState<ContactModalState | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const importExportRef = useRef<HTMLDivElement | null>(null);

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listClients({
        is_active: status === 'active',
        search: search.trim() || undefined,
      });
      setClients(res.results);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load clients'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (importExportRef.current && !importExportRef.current.contains(e.target as Node)) {
        setImportExportOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleArchive = async (client: Client) => {
    const ok = await ask({
      title: `Archive "${client.name}"?`,
      message:
        'Archived clients are hidden from active lists. You can restore them anytime from the Archived filter.',
      confirmLabel: 'Archive',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await archiveClient(client.id);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    } catch (err) {
      alert(extractApiError(err, 'Could not archive client.'));
    }
  };

  const handleRestore = async (client: Client) => {
    try {
      await restoreClient(client.id);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    } catch (err) {
      alert(extractApiError(err, 'Could not restore client.'));
    }
  };

  const handleDeleteContact = async (clientId: number, contact: ClientContact) => {
    const fullName = `${contact.first_name} ${contact.last_name}`.trim() || 'this contact';
    const ok = await ask({
      title: `Delete ${fullName}?`,
      message: "You'll have 5 seconds to undo.",
      confirmLabel: 'Delete contact',
      tone: 'danger',
    });
    if (!ok) return;
    const client = clients.find((c) => c.id === clientId);
    const index = client?.contacts.findIndex((k) => k.id === contact.id) ?? 0;
    scheduleContactDelete(contact, index);
  };

  const handleContactSaved = (clientId: number, contact: ClientContact, mode: 'created' | 'updated') => {
    setClients((prev) =>
      prev.map((c) => {
        if (c.id !== clientId) return c;
        if (mode === 'created') return { ...c, contacts: [...c.contacts, contact] };
        return {
          ...c,
          contacts: c.contacts.map((k) => (k.id === contact.id ? contact : k)),
        };
      }),
    );
    setContactModal(null);
  };

  const exportCsv = () => {
    const rows: string[][] = [
      ['Client', 'Currency', 'Status', 'Contact name', 'Contact email', 'Title', 'Office', 'Mobile', 'Fax'],
    ];
    clients.forEach((c) => {
      if (c.contacts.length === 0) {
        rows.push([c.name, c.currency, c.is_active ? 'Active' : 'Archived', '', '', '', '', '', '']);
        return;
      }
      c.contacts.forEach((k) => {
        rows.push([
          c.name,
          c.currency,
          c.is_active ? 'Active' : 'Archived',
          `${k.first_name} ${k.last_name}`.trim(),
          k.email,
          k.title,
          k.office_number,
          k.mobile_number,
          k.fax_number,
        ]);
      });
    });
    const csv = rows
      .map((r) => r.map((cell) => `"${(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setImportExportOpen(false);
  };

  const filtered = useMemo(() => clients, [clients]);

  return (
    <div className="min-h-screen bg-bg">
      <PageHero
        eyebrow="Workspace"
        title="Clients"
        description="The companies you bill — manage their contacts, statuses, and contracts."
      />
      <ManageSubnav />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setNewClientOpen(true)} className="btn-primary">
              <Plus className="mr-1 h-4 w-4" />
              New client
            </button>
            <button
              type="button"
              onClick={() => {
                if (clients.length === 0) {
                  alert('Add a client first before adding a contact.');
                  return;
                }
                setContactModal({ client: { id: clients[0].id, name: clients[0].name }, contact: null });
              }}
              className="btn-outline"
              title="Add contact (uses first client; pick a client row for a specific one)"
            >
              <UserPlus className="mr-1 h-4 w-4" />
              Add contact
            </button>
            <div className="relative" ref={importExportRef}>
              <button
                type="button"
                onClick={() => setImportExportOpen((v) => !v)}
                className="btn-outline"
              >
                Import/Export
                <ChevronDown className="ml-1 h-4 w-4" />
              </button>
              {importExportOpen ? (
                <div className="absolute left-0 z-10 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4 text-muted" />
                    Export clients (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportOpen(true);
                      setImportExportOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-text hover:bg-slate-50"
                  >
                    <Upload className="h-4 w-4 text-muted" />
                    Import clients (CSV)
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by client or contact"
                className="input w-full pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="input"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-muted">
            Loading clients…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-sm text-danger">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-16 text-center shadow-md">
            <p className="text-sm text-muted">
              {status === 'active' ? 'No active clients yet.' : 'No archived clients.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
            {filtered.map((c, idx) => (
              <div
                key={c.id}
                className={`${idx === 0 ? '' : 'border-t border-slate-200'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/manage/clients/${c.id}/edit`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-text shadow-sm transition hover:bg-slate-50"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Link>
                    <Link
                      to={`/manage/clients/${c.id}/edit`}
                      className={`font-semibold hover:text-primary ${
                        c.is_active ? 'text-text' : 'text-muted'
                      }`}
                    >
                      {c.name}
                    </Link>
                    <span className="text-xs text-muted">
                      {c.active_project_count} project{c.active_project_count === 1 ? '' : 's'}
                    </span>
                    {!c.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                        Archived
                      </span>
                    ) : null}
                    {!c.is_active ? (
                      <button
                        type="button"
                        onClick={() => handleRestore(c)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-dark/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-dark transition hover:bg-accent-soft/70"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setContactModal({ client: { id: c.id, name: c.name }, contact: null })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-text shadow-sm transition hover:bg-slate-50"
                    >
                      <Plus className="h-3 w-3" />
                      Add contact
                    </button>
                    {c.is_active ? (
                      <button
                        type="button"
                        onClick={() => handleArchive(c)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-warning/10 hover:text-warning"
                        title="Archive client"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {c.contacts.length > 0 ? (
                  <div>
                    {c.contacts.map((k) => {
                      const fullName = `${k.first_name} ${k.last_name}`.trim();
                      return (
                        <div
                          key={k.id}
                          className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 pl-12"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setContactModal({ client: { id: c.id, name: c.name }, contact: k })
                              }
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-text shadow-sm transition hover:bg-slate-50"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                            <div>
                              <div className="text-sm font-medium text-text">{fullName || '(unnamed)'}</div>
                              {k.email ? (
                                <a
                                  href={`mailto:${k.email}`}
                                  className="text-xs text-primary hover:underline"
                                >
                                  {k.email}
                                </a>
                              ) : null}
                              {k.title ? (
                                <div className="text-xs text-muted">{k.title}</div>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(c.id, k)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                            title="Delete contact"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
            {pendingContactDelete ? (
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-6 py-2.5 text-sm">
                <span className="text-text">
                  <strong className="font-semibold">{pendingContactDelete.label}</strong>{' '}
                  has been deleted.{' '}
                  <button
                    type="button"
                    onClick={undoContactDelete}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Undo
                  </button>
                </span>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {newClientOpen ? (
        <NewClientModal
          onClose={() => setNewClientOpen(false)}
          onCreated={(c) => {
            setClients((prev) => [...prev, { ...c, contacts: c.contacts ?? [] }]);
            setNewClientOpen(false);
          }}
        />
      ) : null}

      {contactModal ? (
        <ContactModal
          client={contactModal.client}
          contact={contactModal.contact}
          onClose={() => setContactModal(null)}
          onSaved={(saved, mode) => handleContactSaved(contactModal.client.id, saved, mode)}
        />
      ) : null}

      {importOpen ? (
        <ImportClientsModal
          onClose={() => setImportOpen(false)}
          onImported={(created) => {
            setClients((prev) => [...prev, ...created]);
            setImportOpen(false);
          }}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

function ImportClientsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (created: Client[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setErrorMsg(null);
    try {
      const text = await f.text();
      const rows = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map(parseCsvLine);
      setPreview(rows.slice(0, 6));
    } catch {
      setErrorMsg('Could not read this file.');
      setPreview(null);
    }
  };

  const handleSampleDownload = () => {
    const sample =
      'Client,Address\nAcme Corp,"123 Main St, Springfield"\nGlobex Inc,"456 Maple Ave"\n';
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-clients.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    if (!preview || preview.length < 2) {
      setErrorMsg('No client rows found. Please pick a CSV with at least one client.');
      return;
    }

    // Re-parse full file (preview is only first 5 data rows)
    if (!file) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const text = await file.text();
      const allRows = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map(parseCsvLine);
      // Detect header row: skip first row if it looks like one (case-insensitive "client" in cell 0)
      const dataRows =
        allRows[0] && allRows[0][0].toLowerCase().includes('client')
          ? allRows.slice(1)
          : allRows;

      const created: Client[] = [];
      const failures: string[] = [];
      for (const row of dataRows) {
        const name = row[0]?.trim();
        if (!name) continue;
        const address = row[1]?.trim() ?? '';
        try {
          const c = await createClient({ name, address });
          created.push({ ...c, contacts: c.contacts ?? [] });
        } catch (err) {
          failures.push(`${name}: ${extractApiError(err, 'failed')}`);
        }
      }
      if (created.length === 0) {
        setErrorMsg(
          failures.length ? `No clients imported.\n${failures.join('\n')}` : 'No valid client rows found.',
        );
        setSubmitting(false);
        return;
      }
      if (failures.length) {
        alert(`Imported ${created.length} clients. ${failures.length} failed:\n${failures.join('\n')}`);
      }
      onImported(created);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Could not import clients.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="absolute inset-0 bg-text/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">Import clients</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-text">Create a CSV file with two columns in this order:</p>
          <p className="mt-1 font-mono text-sm font-semibold text-text">Client, Address</p>
          <p className="mt-2 text-xs text-muted">
            Header row required. Only the Client column needs to be filled.{' '}
            <button
              type="button"
              onClick={handleSampleDownload}
              className="text-primary hover:underline"
            >
              Download a sample CSV file
            </button>
          </p>

          <div className="mt-4 flex items-center gap-3">
            <label className="btn-outline cursor-pointer">
              <Upload className="h-4 w-4" /> Choose file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
              />
            </label>
            <span className="text-sm text-muted">{file ? file.name : 'No file chosen'}</span>
          </div>

          {preview ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <div className="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-muted">
                Preview (first 5 rows)
              </div>
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.map((row, i) => (
                      <tr
                        key={i}
                        className={
                          i === 0
                            ? 'bg-slate-50/50 font-semibold text-text'
                            : 'border-t border-slate-100 text-text'
                        }
                      >
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-1.5 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="mt-4 whitespace-pre-line rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              {errorMsg}
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button type="button" onClick={onClose} className="btn-outline">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!preview || submitting}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Importing…' : 'Upload and import'}
          </button>
        </div>
      </div>
    </div>
  );
}
