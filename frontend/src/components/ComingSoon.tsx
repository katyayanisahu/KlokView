import type { LucideIcon } from 'lucide-react';

import PageHero from '@/components/PageHero';

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export default function ComingSoon({ title, description, icon: Icon }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-bg">
      <PageHero title={title} description={description} />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-8 py-16 text-center shadow-md">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
            <Icon className="h-8 w-8 text-primary" />
          </span>
          <h2 className="mt-6 font-heading text-xl font-bold text-text">{title}</h2>
          <p className="mt-3 max-w-md text-sm text-muted">{description}</p>
          <span className="mt-6 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-dark">
            Coming soon
          </span>
        </div>
      </main>
    </div>
  );
}
