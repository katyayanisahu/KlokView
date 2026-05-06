import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  defaultName?: string;
  onCancel: () => void;
  onSave: (name: string, isShared: boolean) => Promise<void> | void;
}

export default function SaveReportModal({ open, defaultName = '', onCancel, onSave }: Props) {
  const [name, setName] = useState(defaultName);
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the modal is reopened.
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setIsShared(false);
      setError(null);
      setSaving(false);
    }
  }, [open, defaultName]);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please give the report a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed, isShared);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Save report failed', err);
      setError('Could not save the report. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 px-4"
      onClick={onCancel}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="font-heading text-lg font-bold text-text">Save report</h2>
              <p className="mt-0.5 text-xs text-muted">
                Save this configuration so you can open it again from the Saved Reports tab.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-slate-100 hover:text-text"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div>
              <label htmlFor="saved_report_name" className="label">
                Report name
              </label>
              <input
                id="saved_report_name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q2 hours summary"
                className="input"
                autoFocus
                required
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition hover:bg-bg/50">
              <input
                type="checkbox"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block font-medium text-text">Share with workspace</span>
                <span className="block text-xs text-muted">
                  Other admins and owners will see this report under "Reports shared with me".
                </span>
              </span>
            </label>

            {error ? (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-bg/30 px-6 py-3">
            <button type="button" onClick={onCancel} className="btn-outline">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
