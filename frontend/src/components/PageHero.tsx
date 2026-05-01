import type { ReactNode } from 'react';

interface PageHeroProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}

export default function PageHero({ title, description, actions, eyebrow }: PageHeroProps) {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-7">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 font-heading text-2xl font-bold leading-tight text-text lg:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-text/80">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
