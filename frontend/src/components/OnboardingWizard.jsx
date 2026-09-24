import { useState } from 'react';
import { api } from '../lib/api.js';
import { playUi } from '../lib/sounds.js';
import { markOnboardComplete, prefersReducedMotion } from '../lib/celebrate.js';
import { onboardingErrorText } from '../lib/errors.js';
import { DAILY_ROUTINES, HOBBIES, PRIMARY_FOCUSES } from '../lib/onboarding.js';
import { LanguageSwitch, displayFirstName, normalizeLanguage, useT } from '../lib/i18n.jsx';
import LanguageMenu from './LanguageMenu.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import { SoundToggle } from './SoundFx.jsx';
import { Spinner } from './BusyStatus.jsx';
import BrandLogo from './BrandLogo.jsx';
import ConfettiBurst from './ConfettiBurst.jsx';
import {
  BikeIcon,
  BookIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  DroneIcon,
  GearIcon,
  RunIcon,
  SparkleIcon,
  SunIcon,
} from './icons.jsx';

const FOCUS_ICONS = {
  academic: BookIcon,
  software: GearIcon,
  productivity: CheckCircleIcon,
};

const HOBBY_ICONS = {
  running: RunIcon,
  mountain_biking: BikeIcon,
  drone: DroneIcon,
};

const ROUTINE_ICONS = {
  outdoor: SunIcon,
  briefing: SparkleIcon,
  work: BriefcaseIcon,
};

const STEP_COUNT = 4;

function Choice({ selected, onClick, icon: Icon, label, hint, multi = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`border-border bg-background hover:border-ring flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-start transition ${
        selected ? 'border-ring ring-ring/30 bg-tone-green/40 ring-2' : ''
      }`}
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-lg ${
          selected ? 'bg-tone-green text-tone-green-fg' : 'bg-tone-neutral text-tone-neutral-fg'
        }`}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="text-foreground flex items-center gap-2 text-sm font-semibold">
          {label}
          {multi && selected && <CheckCircleIcon className="size-4" />}
        </span>
        <span className="text-muted mt-0.5 block text-xs leading-relaxed">{hint}</span>
      </span>
    </button>
  );
}

export default function OnboardingWizard({
  account,
  theme,
  onToggleTheme,
  onSaved,
  onLogout,
  onLanguageChange,
}) {
  const { t, language } = useT();
  const firstName = displayFirstName(account.user?.name, language);
  const [step, setStep] = useState(0);
  const [primaryFocus, setPrimaryFocus] = useState(account.preferences?.primaryFocus || null);
  const [hobbies, setHobbies] = useState(account.preferences?.hobbies || []);
  const [dailyRoutine, setDailyRoutine] = useState(account.preferences?.dailyRoutine || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [finale, setFinale] = useState(false);

  const toggleHobby = (id) => {
    setHobbies((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const canAdvance =
    step === 0 || (step === 1 && primaryFocus) || step === 2 || (step === 3 && dailyRoutine);

  const submit = async () => {
    if (!primaryFocus || !dailyRoutine || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api.completeOnboarding({
        primaryFocus,
        hobbies,
        dailyRoutine,
        language: normalizeLanguage(language),
      });
      markOnboardComplete();
      setFinale(true);
      playUi('celebrate');
      const pause = prefersReducedMotion() ? 500 : 1700;
      await new Promise((resolve) => window.setTimeout(resolve, pause));
      onSaved(next);
    } catch (err) {
      setError(err.code || 'unavailable');
      playUi('error');
    } finally {
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
          <LanguageMenu value={language} onChange={onLanguageChange} />
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
          <div className="space-y-5 p-6 sm:p-8">
            <div>
              <p className="text-muted text-xs font-medium">
                {firstName
                  ? t('onboard.namedStep', { name: firstName, current: step + 1, total: STEP_COUNT })
                  : t('onboard.step', { current: step + 1, total: STEP_COUNT })}
              </p>
              <h1 className="text-foreground mt-1 text-2xl font-bold">{t('onboard.title')}</h1>
              <p className="text-muted mt-1.5 text-sm leading-relaxed">{t('onboard.sub')}</p>
            </div>

            <div className="flex gap-1.5" aria-hidden="true">
              {Array.from({ length: STEP_COUNT }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 flex-1 rounded-full ${
                    index <= step ? 'from-banner-from to-banner-to bg-gradient-to-l' : 'bg-border'
                  }`}
                />
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <p className="text-foreground text-sm font-medium">{t('onboard.langTitle')}</p>
                <p className="text-muted text-xs">{t('onboard.langHint')}</p>
                <LanguageSwitch value={language} onChange={onLanguageChange} className="w-full justify-center" />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <p className="text-foreground text-sm font-medium">{t('onboard.focusTitle')}</p>
                {PRIMARY_FOCUSES.map((id) => (
                  <Choice
                    key={id}
                    selected={primaryFocus === id}
                    onClick={() => setPrimaryFocus(id)}
                    icon={FOCUS_ICONS[id]}
                    label={t(`onboard.focus.${id}`)}
                    hint={t(`onboard.focus.${id}Hint`)}
                  />
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <p className="text-foreground text-sm font-medium">{t('onboard.hobbiesTitle')}</p>
                <p className="text-muted text-xs">{t('onboard.hobbiesHint')}</p>
                {HOBBIES.map((id) => (
                  <Choice
                    key={id}
                    multi
                    selected={hobbies.includes(id)}
                    onClick={() => toggleHobby(id)}
                    icon={HOBBY_ICONS[id]}
                    label={t(`onboard.hobby.${id}`)}
                    hint={t(`onboard.hobby.${id}Hint`)}
                  />
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <p className="text-foreground text-sm font-medium">{t('onboard.routineTitle')}</p>
                {DAILY_ROUTINES.map((id) => (
                  <Choice
                    key={id}
                    selected={dailyRoutine === id}
                    onClick={() => setDailyRoutine(id)}
                    icon={ROUTINE_ICONS[id]}
                    label={t(`onboard.routine.${id}`)}
                    hint={t(`onboard.routine.${id}Hint`)}
                  />
                ))}
              </div>
            )}

            {error && (
              <p className="bg-tone-rose text-tone-rose-fg rounded-lg px-3 py-2 text-sm">
                {onboardingErrorText(error)}
              </p>
            )}

            <div className="flex gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep((prev) => prev - 1);
                  }}
                  className="border-border bg-background text-foreground hover:bg-surface-hover flex-1 rounded-xl border px-4 py-3 text-sm font-medium"
                >
                  {t('onboard.back')}
                </button>
              )}
              {step < STEP_COUNT - 1 ? (
                <button
                  type="button"
                  disabled={!canAdvance}
                  onClick={() => setStep((prev) => prev + 1)}
                  className="from-banner-from to-banner-to flex-[2] rounded-xl bg-gradient-to-br px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {t('onboard.next')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canAdvance || saving}
                  onClick={submit}
                  className="from-banner-from to-banner-to inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-gradient-to-br px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving && <Spinner className="size-4" />}
                  {saving ? t('onboard.saving') : t('onboard.save')}
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      {finale && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/55 px-5 backdrop-blur-sm">
          <ConfettiBurst active duration={2400} className="pointer-events-none fixed inset-0 z-0" />
          <div
            role="status"
            aria-live="polite"
            className="celebrate-pop border-border bg-surface relative z-10 max-w-sm rounded-2xl border px-8 py-8 text-center shadow-2xl"
          >
            <span className="from-banner-from to-banner-to mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg">
              <SparkleIcon className="size-7" />
            </span>
            <p className="text-foreground text-xl font-bold">
              {firstName ? t('onboard.doneTitleNamed', { name: firstName }) : t('onboard.doneTitle')}
            </p>
            <p className="text-muted mt-2 text-sm leading-relaxed">{t('onboard.doneBody')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
