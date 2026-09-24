import { useState } from 'react';
import { api } from '../lib/api.js';
import { playUi } from '../lib/sounds.js';
import { Spinner } from './BusyStatus.jsx';
import { BriefcaseIcon, HomeIcon } from './icons.jsx';
import BrandLogo from './BrandLogo.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { SoundToggle } from './SoundFx.jsx';
import AddressInput from './AddressInput.jsx';
import { eventIssueText } from '../lib/errors.js';
import { LOCATION_MAX } from '../lib/validate.js';
import { useT } from '../lib/i18n.jsx';
import LanguageMenu from './LanguageMenu.jsx';

const inputClass =
  'border-border bg-background text-foreground w-full rounded-xl border px-3 py-2.5 text-sm';

export default function PlacesSetup({
  account,
  theme,
  onToggleTheme,
  onSaved,
  onLogout,
  onLanguageChange,
}) {
  const { t, language } = useT();
  const suggested = account.settings?.places || {};
  const fromGoogle = Boolean(suggested.home?.trim() || suggested.work?.trim());
  const [home, setHome] = useState(suggested.home || '');
  const [work, setWork] = useState(suggested.work || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [attempted, setAttempted] = useState(false);

  const homeIssue = !home.trim() ? 'required' : home.trim().length > LOCATION_MAX ? 'too_long' : null;
  const workIssue = !work.trim() ? 'required' : work.trim().length > LOCATION_MAX ? 'too_long' : null;

  const submit = async (event) => {
    event.preventDefault();
    setAttempted(true);
    const nextHome = home.trim();
    const nextWork = work.trim();
    if (!nextHome || !nextWork || nextHome.length > LOCATION_MAX || nextWork.length > LOCATION_MAX) {
      setError(t('places.missing'));
      playUi('error');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.updateSettings({ places: { home: nextHome, work: nextWork } }));
    } catch {
      setError(t('places.failed'));
      playUi('error');
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-svh overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="bg-banner-from/20 dark:bg-banner-from/30 absolute -top-32 start-[-8%] size-[28rem] rounded-full blur-3xl" />
        <div className="bg-banner-to/20 dark:bg-banner-to/25 absolute top-1/3 -end-24 size-[24rem] rounded-full blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <div className="flex items-center gap-3">
          <BrandLogo className="size-9" withName />
        </div>
        <div className="flex items-center gap-2">
          {onLanguageChange && <LanguageMenu value={language} onChange={onLanguageChange} />}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <SoundToggle />
          <button
            type="button"
            onClick={onLogout}
            className="border-border bg-surface text-muted hover:text-foreground rounded-lg border px-3 py-2 text-sm font-medium"
          >
            {t('logout')}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-lg px-5 pb-16 sm:px-8">
        <section className="rise-in border-border bg-surface/85 overflow-hidden rounded-2xl border shadow-xl backdrop-blur-md">
          <div className="from-banner-from to-banner-to h-1 bg-gradient-to-l" />
          <form className="space-y-5 p-6 sm:p-8" onSubmit={submit}>
            <div>
              <h1 className="text-foreground text-2xl font-bold">{t('places.title')}</h1>
              <p className="text-muted mt-1.5 text-sm leading-relaxed">{t('places.sub')}</p>
            </div>

            {fromGoogle && (
              <p className="bg-tone-indigo text-tone-indigo-fg rounded-lg px-3 py-2 text-sm">
                {t('places.fromGoogle')}
              </p>
            )}

            <AddressInput
              label={
                <span className="flex items-center gap-1.5">
                  <HomeIcon className="size-4" />
                  {t('places.home')}
                </span>
              }
              value={home}
              onChange={setHome}
              required
              placeholder={t('places.street')}
              inputClassName={inputClass}
            />
            {attempted && homeIssue && (
              <p role="alert" className="text-tone-rose-fg -mt-2 text-xs">
                {eventIssueText('home', homeIssue)}
              </p>
            )}

            <AddressInput
              label={
                <span className="flex items-center gap-1.5">
                  <BriefcaseIcon className="size-4" />
                  {t('places.work')}
                </span>
              }
              value={work}
              onChange={setWork}
              required
              placeholder={t('places.street')}
              inputClassName={inputClass}
            />
            {attempted && workIssue && (
              <p role="alert" className="text-tone-rose-fg -mt-2 text-xs">
                {eventIssueText('work', workIssue)}
              </p>
            )}

            {error && (
              <p className="bg-tone-rose text-tone-rose-fg rounded-lg px-3 py-2 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="from-banner-from to-banner-to flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving && <Spinner className="size-4" />}
              {saving ? t('onboard.saving') : t('places.save')}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
