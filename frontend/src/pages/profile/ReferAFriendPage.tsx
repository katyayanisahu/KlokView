import { Check, Copy, Gift, Mail } from 'lucide-react';
import { useState } from 'react';

import ProfileLayout from './ProfileLayout';
import { useAuthStore } from '@/store/authStore';

export default function ReferAFriendPage() {
  const user = useAuthStore((s) => s.user);
  const [copied, setCopied] = useState(false);

  const referralUrl = `${window.location.origin}/register?ref=${user?.id ?? ''}`;
  const subject = encodeURIComponent('You should try KlokView');
  const body = encodeURIComponent(
    `Hi,\n\nI've been using KlokView to track time and run my projects, and thought you'd find it useful too.\n\nSign up here: ${referralUrl}\n\n— ${user?.full_name ?? user?.email ?? ''}`,
  );
  const mailtoHref = `mailto:?subject=${subject}&body=${body}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <ProfileLayout title="Refer a friend">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
            <Gift className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold text-text">
              Know someone who would love KlokView?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Share your personal link with friends and colleagues. Anyone who signs up gets a
              clean, simple way to track time and run projects.
            </p>

            <label className="mt-5 mb-1.5 block text-sm font-medium text-text">
              Your referral link
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                readOnly
                value={referralUrl}
                onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                className="input flex-1 bg-slate-50"
              />
              <button type="button" onClick={copyLink} className="btn-outline whitespace-nowrap">
                {copied ? (
                  <>
                    <Check className="h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> Copy link
                  </>
                )}
              </button>
            </div>

            <a
              href={mailtoHref}
              className="btn-primary mt-4 inline-flex"
            >
              <Mail className="h-4 w-4" />
              Email a friend
            </a>
          </div>
        </div>
      </div>
    </ProfileLayout>
  );
}
