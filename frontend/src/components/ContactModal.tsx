import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { createContact, updateContact } from '@/api/clients';
import { extractApiError } from '@/utils/errors';
import type { Client, ClientContact } from '@/types';

interface Props {
  client: Pick<Client, 'id' | 'name'>;
  contact?: ClientContact | null;
  onClose: () => void;
  onSaved: (contact: ClientContact, mode: 'created' | 'updated') => void;
}

export default function ContactModal({ client, contact, onClose, onSaved }: Props) {
  const isEdit = Boolean(contact);
  const [firstName, setFirstName] = useState(contact?.first_name ?? '');
  const [lastName, setLastName] = useState(contact?.last_name ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [title, setTitle] = useState(contact?.title ?? '');
  const [office, setOffice] = useState(contact?.office_number ?? '');
  const [mobile, setMobile] = useState(contact?.mobile_number ?? '');
  const [fax, setFax] = useState(contact?.fax_number ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contact) return;
    setFirstName(contact.first_name);
    setLastName(contact.last_name);
    setEmail(contact.email);
    setTitle(contact.title);
    setOffice(contact.office_number);
    setMobile(contact.mobile_number);
    setFax(contact.fax_number);
  }, [contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        client: client.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        title: title.trim(),
        office_number: office.trim(),
        mobile_number: mobile.trim(),
        fax_number: fax.trim(),
      };
      if (isEdit && contact) {
        const saved = await updateContact(contact.id, payload);
        onSaved(saved, 'updated');
      } else {
        const saved = await createContact(payload);
        onSaved(saved, 'created');
      }
    } catch (err) {
      setError(extractApiError(err, 'Could not save contact.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="absolute inset-0 bg-text/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-text">
            {isEdit ? 'Edit contact' : `New contact for ${client.name}`}
          </h2>
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
            No email is sent when adding a contact. The email address is captured for your own
            reference and for the convenience of sending invoices to the client directly from
            KlokView.
          </p>

          <div className="grid grid-cols-[140px_1fr] gap-x-6 gap-y-4">
            <label htmlFor="contact_first_name" className="pt-2 text-sm font-medium text-text">
              First name
            </label>
            <input
              id="contact_first_name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="input"
              autoFocus
              required
            />

            <label htmlFor="contact_last_name" className="pt-2 text-sm font-medium text-text">
              Last name
            </label>
            <input
              id="contact_last_name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="input"
            />

            <label htmlFor="contact_email" className="pt-2 text-sm font-medium text-text">
              Email
            </label>
            <input
              id="contact_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />

            <div className="col-span-2 mt-2 border-t border-slate-200 pt-2" />

            <label htmlFor="contact_title" className="pt-2 text-sm font-medium text-text">
              Title
            </label>
            <input
              id="contact_title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
            />

            <label htmlFor="contact_office" className="pt-2 text-sm font-medium text-text">
              Office number
            </label>
            <input
              id="contact_office"
              type="tel"
              value={office}
              onChange={(e) => setOffice(e.target.value)}
              className="input"
            />

            <label htmlFor="contact_mobile" className="pt-2 text-sm font-medium text-text">
              Mobile number
            </label>
            <input
              id="contact_mobile"
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="input"
            />

            <label htmlFor="contact_fax" className="pt-2 text-sm font-medium text-text">
              Fax number
            </label>
            <input
              id="contact_fax"
              type="tel"
              value={fax}
              onChange={(e) => setFax(e.target.value)}
              className="input"
            />
          </div>

          {error ? (
            <div className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          ) : null}

          <div className="mt-6 flex items-center gap-2">
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !firstName.trim()}
            >
              {submitting ? 'Saving…' : 'Save contact'}
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
