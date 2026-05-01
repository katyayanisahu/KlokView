import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export type ConfirmTone = 'danger' | 'warning' | 'primary';

interface ConfirmConfig {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmDialogProps extends ConfirmConfig {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const accentBg =
    tone === 'danger' ? 'bg-danger/10 text-danger'
      : tone === 'warning' ? 'bg-warning/10 text-warning'
        : 'bg-primary-soft text-primary';

  const confirmBtnClasses =
    tone === 'danger'
      ? 'inline-flex items-center justify-center rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-danger/90'
      : tone === 'warning'
        ? 'inline-flex items-center justify-center rounded-lg bg-warning px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-warning/90'
        : 'btn-primary';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-text/40" onClick={onCancel} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${accentBg}`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-lg font-bold text-text">{title}</h3>
            {message ? (
              <div className="mt-1.5 text-sm text-muted">{message}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="-mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button type="button" onClick={onCancel} className="btn-outline">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={confirmBtnClasses}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * useConfirm — drop-in replacement for window.confirm() that resolves a Promise
 * when the user clicks Confirm or Cancel. Returns the dialog element to render
 * once at the page root, plus an `ask(config)` function.
 *
 * Usage:
 *   const { confirmDialog, ask } = useConfirm();
 *   if (!(await ask({ title: 'Delete X?', tone: 'danger' }))) return;
 *   // ... do the delete ...
 *   render: {confirmDialog}
 */
export function useConfirm() {
  const [config, setConfig] = useState<(ConfirmConfig & { resolve: (ok: boolean) => void }) | null>(
    null,
  );

  const ask = useCallback((cfg: ConfirmConfig): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfig({ ...cfg, resolve });
    });
  }, []);

  const handleConfirm = () => {
    if (config) config.resolve(true);
    setConfig(null);
  };
  const handleCancel = () => {
    if (config) config.resolve(false);
    setConfig(null);
  };

  const confirmDialog = (
    <ConfirmDialog
      open={!!config}
      title={config?.title ?? ''}
      message={config?.message}
      confirmLabel={config?.confirmLabel}
      cancelLabel={config?.cancelLabel}
      tone={config?.tone}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirmDialog, ask };
}
