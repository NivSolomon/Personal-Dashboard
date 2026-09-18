import { LOGIN_URL } from '../lib/api.js';
import { loginErrorText } from '../lib/errors.js';
import { useT } from '../lib/i18n.jsx';
import LanguageMenu from './LanguageMenu.jsx';
import {
  AlertIcon,
  CalendarIcon,
  CheckCircleIcon,
  HomeIcon,
  MailIcon,
  ShieldIcon,
  SparkleIcon,
} from './icons.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { SoundToggle } from './SoundFx.jsx';
import BrandLogo from './BrandLogo.jsx';

function GoogleMark() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function DashboardPreview() {
  const { t } = useT();
  return (
    <div className="mt-8 hidden lg:block" aria-hidden="true">
      <div className="from-banner-from to-banner-to relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg">
        <div className="pointer-events-none absolute -top-16 -end-12 size-40 rounded-full bg-white/15 blur-2xl" />
        <p className="relative flex items-center gap-1.5 text-xs font-semibold text-white/70">
          <SparkleIcon className="size-3.5" />
          {t('login.preview.summary')}
        </p>
        <p className="relative mt-3 text-sm leading-relaxed">{t('login.preview.body')}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <PreviewPanel
          title={t('login.perm.calendar')}
          tone="bg-tone-indigo text-tone-indigo-fg"
          Icon={CalendarIcon}
        >
          <PreviewRow meta="09:00" label={t('login.preview.meet1')} />
          <PreviewRow meta="11:30" label={t('login.preview.meet2')} />
        </PreviewPanel>
        <PreviewPanel
          title={t('login.perm.tasks')}
          tone="bg-tone-green text-tone-green-fg"
          Icon={CheckCircleIcon}
        >
          <PreviewRow
            meta={<span className="border-subtle mt-0.5 size-2.5 rounded-full border" />}
            label={t('login.preview.task1')}
          />
          <PreviewRow
            meta={<span className="border-subtle mt-0.5 size-2.5 rounded-full border" />}
            label={t('login.preview.task2')}
          />
        </PreviewPanel>
        <PreviewPanel title={t('widget.emails.title')} tone="bg-tone-amber text-tone-amber-fg" Icon={MailIcon}>
          <PreviewRow
            meta={<span className="bg-tone-amber-fg mt-1 size-1.5 rounded-full" />}
            label={t('login.preview.mail1')}
          />
          <PreviewRow
            meta={<span className="bg-tone-amber-fg mt-1 size-1.5 rounded-full" />}
            label={t('login.preview.mail2')}
          />
        </PreviewPanel>
      </div>
    </div>
  );
}

function PreviewPanel({ title, tone, Icon, children }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-3 shadow-sm">
      <p className="text-foreground mb-2.5 flex items-center gap-1.5 text-xs font-semibold">
        <span className={`grid size-6 place-items-center rounded-md ${tone}`}>
          <Icon className="size-3.5" />
        </span>
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function PreviewRow({ meta, label }) {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span className="text-subtle flex w-9 shrink-0 justify-end tabular-nums">{meta}</span>
      <span className="text-muted truncate">{label}</span>
    </li>
  );
}

export default function LoginScreen({ error, theme, onToggleTheme, onLanguageChange }) {
  const { t, language } = useT();
  const permissions = [
    {
      Icon: CalendarIcon,
      tone: 'bg-tone-indigo text-tone-indigo-fg',
      name: t('login.perm.calendar'),
      description: t('login.perm.calendarDesc'),
    },
    {
      Icon: CheckCircleIcon,
      tone: 'bg-tone-green text-tone-green-fg',
      name: t('login.perm.tasks'),
      description: t('login.perm.tasksDesc'),
    },
    {
      Icon: MailIcon,
      tone: 'bg-tone-amber text-tone-amber-fg',
      name: t('login.perm.mail'),
      description: t('login.perm.mailDesc'),
    },
    {
      Icon: HomeIcon,
      tone: 'bg-tone-blue text-tone-blue-fg',
      name: t('login.perm.places'),
      description: t('login.perm.placesDesc'),
    },
  ];

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="bg-banner-from/20 dark:bg-banner-from/30 absolute -top-32 start-[-8%] size-[28rem] rounded-full blur-3xl" />
        <div className="bg-banner-to/20 dark:bg-banner-to/25 absolute top-1/3 -end-24 size-[24rem] rounded-full blur-3xl" />
        <div className="bg-tone-indigo/70 dark:bg-tone-indigo/40 absolute -bottom-24 start-1/3 size-72 rounded-full blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center gap-3">
          <BrandLogo className="size-9" withName />
        </div>
        <div className="flex items-center gap-2">
          <LanguageMenu value={language} onChange={onLanguageChange} />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <SoundToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl items-center gap-8 px-5 pb-12 sm:px-8 lg:min-h-[calc(100svh-4.75rem)] lg:grid-cols-2 lg:gap-14 lg:pb-10">
        <section className="rise-in order-2 lg:order-1">
          <p className="bg-tone-indigo text-tone-indigo-fg inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <SparkleIcon className="size-3.5" />
            {t('login.badge')}
          </p>
          <h1 className="text-foreground mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl xl:text-5xl">
            {t('login.headline')}
          </h1>
          <p className="text-muted mt-3 max-w-md text-sm leading-relaxed text-pretty sm:text-base">
            {t('login.sub')}
          </p>
          <DashboardPreview />
        </section>

        <section className="rise-in border-border bg-surface/85 relative order-1 w-full max-w-md justify-self-center overflow-hidden rounded-2xl border shadow-xl backdrop-blur-md lg:order-2 lg:max-w-none lg:justify-self-stretch [animation-delay:90ms]">
          <div className="from-banner-from to-banner-to h-1 bg-gradient-to-l" />
          <div className="p-6 sm:p-8">
            <h2 className="text-foreground text-xl font-bold">{t('login.start')}</h2>
            <p className="text-muted mt-1.5 text-sm leading-relaxed">{t('login.cta')}</p>

            {error && (
              <p className="bg-tone-rose text-tone-rose-fg mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>{loginErrorText(error)}</span>
              </p>
            )}

            <a
              href={LOGIN_URL}
              className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 font-medium text-slate-800 shadow-sm ring-1 ring-slate-300 transition hover:-translate-y-px hover:bg-slate-50 hover:shadow-md active:translate-y-0"
            >
              <GoogleMark />
              {t('login.google')}
            </a>

            <p className="text-subtle mt-3 flex items-center justify-center gap-1.5 text-center text-xs leading-relaxed">
              <ShieldIcon className="size-3.5 shrink-0" />
              {t('login.privacy')}
            </p>

            <p className="text-subtle mt-6 mb-2 text-xs font-medium">{t('login.permissions')}</p>
            <ul className="space-y-2">
              {permissions.map(({ Icon, tone, name, description }) => (
                <li
                  key={name}
                  className="border-border bg-background/70 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm"
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}>
                    <Icon className="size-4.5" />
                  </span>
                  <span>
                    <span className="text-foreground font-medium">{name}</span>
                    <span className="text-muted mt-0.5 block text-xs">{description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
