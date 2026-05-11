import { AlertTriangle, Download, FileText, Upload, X } from 'lucide-react';
import { useState } from 'react';

import { extractApiError } from '@/utils/errors';
import { importTimeEntries, type ImportTimeResult } from '@/api/imports';

const HEADER_ALIASES: Record<string, string> = {
  date: 'date',
  project: 'project',
  'project name': 'project',
  task: 'task',
  'task name': 'task',
  person: 'person',
  user: 'person',
  email: 'person',
  hours: 'hours',
  'hours worked': 'hours',
  notes: 'notes',
  description: 'notes',
  billable: 'billable',
};

function parseCsvLine(line: string): string[] {
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
}

interface Props {
  onClose: () => void;
  onImported: (result: ImportTimeResult) => void;
}

export default function ImportTimeModal({ onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<{ row: string; error: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleFile = async (f: File) => {
    setFile(f);
    setErrorMsg(null);
    try {
      const text = await f.text();
      const allLines = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map(parseCsvLine);
      if (allLines.length === 0) {
        setErrorMsg('The CSV is empty.');
        setPreview(null);
        return;
      }
      const [headers, ...rows] = allLines;
      setPreview({ headers, rows: rows.slice(0, 5) });
    } catch {
      setErrorMsg('Could not read this file.');
      setPreview(null);
    }
  };

  const downloadTemplate = () => {
    const sample =
      'date,project,task,person,hours,notes,billable\n' +
      '2026-05-06,Bergen Debate Club,Sample,katyayanisahu123@gmail.com,1.5,"Sprint planning",yes\n' +
      '2026-05-07,NSD,Marketing,bob@example.com,2.0,Customer call,no\n';
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-time-entries.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async () => {
    if (!file || !preview) {
      setErrorMsg('Pick a CSV file first.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    setRowErrors([]);
    try {
      const text = await file.text();
      const allLines = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map(parseCsvLine);
      if (allLines.length < 2) {
        setErrorMsg('Need a header row + at least one data row.');
        setSubmitting(false);
        return;
      }

      const headerKeys = allLines[0].map(
        (h) => HEADER_ALIASES[h.toLowerCase().trim()] ?? h.toLowerCase().trim(),
      );
      const required = ['date', 'project', 'task', 'hours'];
      const missing = required.filter((k) => !headerKeys.includes(k));
      if (missing.length) {
        setErrorMsg(`CSV missing required columns: ${missing.join(', ')}`);
        setSubmitting(false);
        return;
      }

      const rows = allLines.slice(1).map((cells, idx) => {
        const obj: Record<string, string> = {};
        headerKeys.forEach((k, i) => {
          obj[k] = (cells[i] ?? '').trim();
        });
        return {
          date: obj.date,
          project: obj.project,
          task: obj.task,
          person: obj.person || undefined,
          hours: obj.hours,
          notes: obj.notes,
          billable: obj.billable || undefined,
          row_label: `Row ${idx + 2}`,
        };
      });

      const result = await importTimeEntries({
        rows,
        source_filename: file.name,
      });
      // If nothing succeeded, keep the modal open and show per-row errors
      // so the user can fix the CSV instead of bouncing back to the page.
      if (result.created === 0) {
        setRowErrors(result.errors);
        setErrorMsg(
          result.errors.length === 0
            ? 'No rows were imported.'
            : `No rows imported — see ${result.errors.length} error(s) below.`,
        );
        setSubmitting(false);
        return;
      }
      onImported(result);
    } catch (err) {
      setErrorMsg(extractApiError(err, 'Could not import time entries.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="absolute inset-0 bg-text/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">Import time</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted transition hover:bg-slate-100 hover:text-text"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-muted">
            Upload a CSV with columns{' '}
            <code className="rounded bg-slate-100 px-1 font-mono text-xs">
              date, project, task, person, hours, notes, billable
            </code>
            . <strong className="text-text">person</strong> can be email or full name and defaults
            to you if blank. Project and task names must already exist in this workspace.
          </p>

          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <Download className="h-4 w-4" />
            Download sample CSV
          </button>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 transition hover:border-primary/40 hover:bg-primary-soft/20">
            <Upload className="h-5 w-5 text-primary" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-text">
                {file ? file.name : 'Pick a CSV file'}
              </p>
              <p className="text-xs text-muted">
                {file ? 'Click to choose a different file' : 'Drop or browse'}
              </p>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>

          {preview ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-text">
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {row.map((c, j) => (
                        <td key={j} className="px-3 py-1.5 text-muted">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-muted">
                <FileText className="mr-1 inline h-3 w-3" />
                Previewing first {preview.rows.length} rows.
              </p>
            </div>
          ) : null}

          {errorMsg ? (
            <div className="flex items-start gap-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          {rowErrors.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-danger/30">
              <p className="border-b border-danger/20 bg-danger/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-danger">
                {rowErrors.length} skipped row{rowErrors.length === 1 ? '' : 's'}
              </p>
              <ul className="max-h-44 divide-y divide-danger/10 overflow-y-auto bg-white">
                {rowErrors.slice(0, 50).map((re, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2 text-xs">
                    <span className="font-mono font-semibold text-muted">{re.row}</span>
                    <span className="text-text">{re.error}</span>
                  </li>
                ))}
                {rowErrors.length > 50 ? (
                  <li className="px-3 py-2 text-xs text-muted">
                    + {rowErrors.length - 50} more…
                  </li>
                ) : null}
              </ul>
              <div className="border-t border-danger/20 bg-danger/5 px-3 py-2 text-[11px] text-text/80">
                <strong>Tip:</strong> Project and task names must match what already exists in the
                workspace. Person can be email or full name and is optional (defaults to you).
              </div>
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
            disabled={submitting || !file}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? 'Importing…' : 'Import rows'}
          </button>
        </div>
      </div>
    </div>
  );
}
