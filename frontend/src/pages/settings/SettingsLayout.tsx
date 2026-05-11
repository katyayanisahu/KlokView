import SettingsSubnav from '@/components/SettingsSubnav';

interface Props {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function SettingsLayout({ title, description, children }: Props) {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Hero — page title + workspace eyebrow */}
        <header className="pb-6 pt-8 sm:pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
            Settings
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold text-text sm:text-[2rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>
          ) : null}
        </header>

        <div className="grid grid-cols-1 gap-6 pb-16 lg:grid-cols-[220px_1fr]">
          <SettingsSubnav />
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
