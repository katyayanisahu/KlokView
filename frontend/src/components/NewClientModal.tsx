import { X } from 'lucide-react';
import { useState } from 'react';

import { createClient } from '@/api/clients';
import { extractApiError } from '@/utils/errors';
import type { Client } from '@/types';

interface Props {
  onClose: () => void;
  onCreated: (client: Client) => void;
}

export default function NewClientModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const client = await createClient({
        name: name.trim(),
        address: address.trim(),
      });
      onCreated(client);
    } catch (err) {
      setError(extractApiError(err, 'Could not create client.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="absolute inset-0 bg-text/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">New client</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5">
          <p className="mb-5 text-sm text-muted">
            Once you've added a client, you can add projects and contacts.
          </p>

          <div className="grid grid-cols-[140px_1fr] gap-x-6 gap-y-4">
            <label htmlFor="client_name" className="pt-2 text-sm font-medium text-text">
              Client name
            </label>
            <input
              id="client_name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              autoFocus
              required
            />

            <label htmlFor="client_address" className="pt-2 text-sm font-medium text-text">
              Address
            </label>
            <textarea
              id="client_address"
              rows={4}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input resize-none"
            />
          </div>

          {error ? (
            <div className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}

          <div className="mt-6 flex items-center gap-2">
            <button type="submit" className="btn-primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Saving…' : 'Save client'}
            </button>
            <button type="button" onClick={onClose} className="btn-outline">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
