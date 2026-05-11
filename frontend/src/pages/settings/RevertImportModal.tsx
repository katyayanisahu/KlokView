import { Loader2, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useConfirm } from '@/components/ConfirmDialog';
import { extractApiError } from '@/utils/errors';
import { listImports, revertImport, type ImportBatch } from '@/api/imports';

interface Props {
  onClose: () => void;
  onReverted: (deletedCount: number) => void;
}

export default function RevertImportModal({ onClose, onReverted }: Props) {
  const { confirmDialog, ask } = useConfirm();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      setBatches(await listImports());
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Could not load import history.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleRevert = async (batch: ImportBatch) => {
    const ok = await ask({
      title: `Revert this import?`,
      message: `This permanently deletes the ${batch.surviving_record_count} time ${
        batch.surviving_record_count === 1 ? 'entry' : 'entries'
      } that came from "${batch.source_filename || 'this batch'}". This cannot be undone.`,
      tone: 'danger',
      confirmLabel: 'Revert import',
    });
    if (!ok) return;

    setBusyId(batch.id);
    try {
      const result = await revertImport(batch.id);
      onReverted(result.reverted);
      setBatches((prev) => prev.filter((b) => b.id !== batch.id));
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Could not revert import.'));
    } finally {
      setBusyId(null);
    }
  };

  const formatTimestamp = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      {confirmDialog}
      <div className="absolute inset-0 bg-text/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">Revert an import</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted transition hover:bg-slate-100 hover:text-text"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <p className="text-sm text-muted">
            Each row below represents a CSV import. Reverting deletes only the time entries that
            came from that import — your manually-tracked entries stay untouched.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading imports…
            </div>
          ) : errorMsg ? (
            <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{errorMsg}</div>
          ) : batches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-muted">
              No imports yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {batches.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">
                      {b.source_filename || `Import #${b.id}`}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatTimestamp(b.created_at)} · by {b.created_by_name || b.created_by_email || '—'}
                    </p>
                    <p className="mt-1 text-xs text-text/80">
                      {b.surviving_record_count} of {b.record_count} time{' '}
                      {b.record_count === 1 ? 'entry' : 'entries'} still active
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevert(b)}
                    disabled={busyId !== null || b.surviving_record_count === 0}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-danger transition hover:border-danger/40 hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyId === b.id ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Reverting…
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Revert
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button type="button" onClick={onClose} className="btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
