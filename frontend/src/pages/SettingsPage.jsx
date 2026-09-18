import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, LOGIN_URL, NOTION_CONNECT_URL, STRAVA_CONNECT_URL } from '../lib/api.js';
import { loginErrorText, eventIssueText } from '../lib/errors.js';
import { TrashIcon } from '../components/icons.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import { SoundToggle } from '../components/SoundFx.jsx';
import LayoutPicker from '../components/LayoutPicker.jsx';
import WatchlistEditor from '../components/WatchlistEditor.jsx';
import AddressInput from '../components/AddressInput.jsx';
import { moveWidget, reorderWidgets, withWidgetEnabled } from '../lib/widgets.js';
import { GOAL_MAX_KCAL, GOAL_MAX_KM, hasIssues, settingsFormIssues } from '../lib/validate.js';
import { LanguageSwitch, useT } from '../lib/i18n.jsx';
import LanguageMenu from '../components/LanguageMenu.jsx';

const TIME_ZONES = Intl.supportedValuesOf?.('timeZone') || [
  'Asia/Jerusalem',
  'UTC',
  'Europe/London',
  'America/New_York',
];

function StatusPill({ on, onLabel, offLabel }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        on ? 'bg-tone-green text-tone-green-fg' : 'bg-tone-neutral text-tone-neutral-fg'
      }`}
    >
      {on ? onLabel : offLabel}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'border-border bg-surface text-foreground w-full rounded-lg border px-3 py-2 text-sm';

export default function SettingsPage({ account, onAccountChange, onSignedOut, onLanguageChange }) {
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get('error');

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sources, setSources] = useState([]);
  const [weatherQuery, setWeatherQuery] = useState('');
  const [form, setForm] = useState(() => ({
    timeZone: account.settings.timeZone,
    language: account.settings.language,
    summaryHour: account.settings.summaryHour,
    weeklyGoalKm: account.settings.weeklyGoalKm || 0,
    calorieGoal: account.settings.calorieGoal || 2000,
    lat: account.settings.weather?.lat ?? '',
    lon: account.settings.weather?.lon ?? '',
    home: account.settings.places?.home || '',
    work: account.settings.places?.work || '',
  }));

  const offered = account.offered || {};
  const connected = account.connected || {};

  useEffect(() => {
    if (!connected.notion) {
      setSources([]);
      return undefined;
    }
    let cancelled = false;
    api
      .notionDataSources()
      .then((body) => {
        if (!cancelled) setSources(body.dataSources || []);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [connected.notion]);

  const sourceOptions = useMemo(
    () => [{ id: '', title: t('settings.noSource') }, ...sources],
    [sources, t],
  );

  const saveLayout = async (next) => {
    setSaving(true);
    setNotice(null);
    try {
      const updated = await api.updateSettings({ layout: next });
      onAccountChange(updated);
      setNotice(t('settings.notice.layout'));
    } catch {
      setNotice(t('settings.notice.layoutFail'));
    } finally {
      setSaving(false);
    }
  };

  const patchWidget = (id, action) => {
    const current = account.settings?.layout || { widgets: [] };
    if (action.overId) {
      void saveLayout(reorderWidgets(current, id, action.overId));
      return;
    }
    if (typeof action.move === 'number') {
      void saveLayout(moveWidget(current, id, action.move));
      return;
    }
    void saveLayout(withWidgetEnabled(current, id, action.enabled));
  };

  const patchForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const changeLanguage = (language) => {
    patchForm('language', language);
    onLanguageChange?.(language);
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    const issues = settingsFormIssues(form, { weatherOffered: Boolean(offered.weather) });
    if (hasIssues(issues)) {
      const first = Object.entries(issues)[0];
      setNotice(eventIssueText(first[0], first[1]));
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const updated = await api.updateSettings({
        timeZone: form.timeZone,
        language: form.language,
        summaryHour: Number(form.summaryHour),
        weeklyGoalKm: Number(form.weeklyGoalKm) || 0,
        calorieGoal: Number(form.calorieGoal) || 0,
        weather: {
          lat: form.lat === '' ? null : Number(form.lat),
          lon: form.lon === '' ? null : Number(form.lon),
        },
        places: {
          home: form.home.trim(),
          work: form.work.trim(),
        },
      });
      onAccountChange(updated);
      setNotice(t('settings.notice.prefs'));
    } catch (error) {
      const code = error?.code;
      setNotice(
        code === 'invalid_coordinates'
          ? eventIssueText('coords', 'invalid')
          : code === 'invalid_goal'
            ? eventIssueText('weeklyGoalKm', 'invalid')
            : code === 'invalid_calorie_goal'
              ? eventIssueText('calorieGoal', 'invalid')
              : t('error.save'),
      );
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (provider) => {
    setBusy(provider);
    setNotice(null);
    try {
      await api.disconnect(provider);
      if (provider === 'google') {
        onSignedOut();
        return;
      }
      onAccountChange(await api.me());
    } catch {
      setNotice(t('settings.notice.disconnectFail'));
    } finally {
      setBusy(null);
    }
  };

  const chooseSource = async (kind, dataSourceId) => {
    setBusy(`notion-${kind}`);
    setNotice(null);
    try {
      onAccountChange(await api.selectNotionDataSource(kind, dataSourceId || null));
    } catch {
      setNotice(t('settings.notice.notionFail'));
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm(t('settings.deleteConfirm'))) return;
    setBusy('account');
    try {
      await api.deleteAccount();
      onSignedOut();
    } catch {
      setNotice(t('settings.notice.deleteFail'));
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <BrandLogo className="size-8" withName />
          <h1 className="text-foreground mt-3 text-3xl font-bold">{t('settings.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <LanguageMenu value={form.language} onChange={changeLanguage} />
          <SoundToggle />
          <Link
            to="/"
            className="border-border bg-surface text-muted hover:text-foreground rounded-lg border px-3 py-2 text-sm font-medium"
          >
            {t('settings.back')}
          </Link>
        </div>
      </header>

      {oauthError && (
        <p className="bg-tone-rose text-tone-rose-fg rounded-lg px-3 py-2 text-sm">
          {loginErrorText(oauthError)}
        </p>
      )}
      {notice && (
        <p className="bg-tone-neutral text-tone-neutral-fg rounded-lg px-3 py-2 text-sm">{notice}</p>
      )}

      <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm sm:p-6">
        <h2 className="text-foreground text-lg font-semibold">{t('settings.accounts')}</h2>
        <p className="text-muted mt-1 text-sm">{t('settings.accountsHint')}</p>

        <ul className="mt-5 space-y-4">
          <li className="border-border-subtle flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-foreground font-medium">Google</p>
              <p className="text-muted text-sm">{account.user.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill on={connected.google} onLabel={t('connected')} offLabel={t('disconnected')} />
              <a
                href={LOGIN_URL}
                className="border-border text-foreground hover:bg-surface-hover rounded-lg border px-3 py-1.5 text-sm font-medium"
              >
                {t('settings.reconnect')}
              </a>
              <button
                type="button"
                disabled={busy === 'google'}
                onClick={() => disconnect('google')}
                className="text-tone-rose-fg text-sm font-medium hover:underline disabled:opacity-50"
              >
                {t('settings.disconnect')}
              </button>
            </div>
          </li>

          {offered.notion && (
            <li className="border-border-subtle space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-foreground font-medium">Notion</p>
                  <p className="text-muted text-sm">
                    {connected.notion
                      ? account.notion?.workspaceName || t('settings.notionConnected')
                      : t('settings.notionHint')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill on={connected.notion} onLabel={t('connected')} offLabel={t('disconnected')} />
                  {connected.notion ? (
                    <button
                      type="button"
                      disabled={busy === 'notion'}
                      onClick={() => disconnect('notion')}
                      className="text-tone-rose-fg text-sm font-medium hover:underline disabled:opacity-50"
                    >
                      {t('settings.disconnect')}
                    </button>
                  ) : (
                    <a
                      href={NOTION_CONNECT_URL}
                      className="bg-tone-indigo text-tone-indigo-fg rounded-lg px-3 py-1.5 text-sm font-medium"
                    >
                      {t('settings.connectNotion')}
                    </a>
                  )}
                </div>
              </div>

              {connected.notion && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('settings.deadlinesDb')}>
                    <select
                      className={inputClass}
                      disabled={busy === 'notion-deadlines'}
                      value={account.notion?.deadlines?.dataSourceId || ''}
                      onChange={(event) => chooseSource('deadlines', event.target.value)}
                    >
                      {sourceOptions.map((source) => (
                        <option key={source.id || 'none'} value={source.id}>
                          {source.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('settings.workoutsDb')}>
                    <select
                      className={inputClass}
                      disabled={busy === 'notion-workouts'}
                      value={account.notion?.workouts?.dataSourceId || ''}
                      onChange={(event) => chooseSource('workouts', event.target.value)}
                    >
                      {sourceOptions.map((source) => (
                        <option key={`w-${source.id || 'none'}`} value={source.id}>
                          {source.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
            </li>
          )}

          {offered.strava && (
            <li className="border-border-subtle flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <p className="text-foreground font-medium">Strava</p>
                <p className="text-muted text-sm">{t('settings.stravaHint')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill on={connected.strava} onLabel={t('connected')} offLabel={t('disconnected')} />
                {connected.strava ? (
                  <button
                    type="button"
                    disabled={busy === 'strava'}
                    onClick={() => disconnect('strava')}
                    className="text-tone-rose-fg text-sm font-medium hover:underline disabled:opacity-50"
                  >
                    {t('settings.disconnect')}
                  </button>
                ) : (
                  <a
                    href={STRAVA_CONNECT_URL}
                    className="bg-tone-amber text-tone-amber-fg rounded-lg px-3 py-1.5 text-sm font-medium"
                  >
                    {t('settings.connectStrava')}
                  </a>
                )}
              </div>
            </li>
          )}
        </ul>
      </section>

      <section id="layout" className="border-border bg-surface rounded-2xl border p-5 shadow-sm sm:p-6">
        <h2 className="text-foreground text-lg font-semibold">{t('settings.layout')}</h2>
        <p className="text-muted mt-1 text-sm">{t('settings.layoutHint')}</p>
        <div className="mt-4">
          <LayoutPicker
            layout={account.settings?.layout}
            session={account}
            disabled={saving}
            onChange={patchWidget}
          />
        </div>
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm sm:p-6">
        <h2 className="text-foreground text-lg font-semibold">{t('settings.watch')}</h2>
        <p className="text-muted mt-1 text-sm">{t('settings.watchHint')}</p>

        {Boolean(account.settings?.watchlist?.items?.length) && (
          <ul className="mt-4 space-y-2">
            {(account.settings.watchlist.items || []).map((item) => (
              <li
                key={item.id}
                className="border-border-subtle flex flex-wrap items-center justify-between gap-2 border-t pt-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">
                    {item.name || item.symbol}
                  </p>
                  <p className="text-muted text-xs">
                    {item.symbol}
                    {(item.alerts || []).length
                      ? ` · ${t('settings.alertsCount', { n: item.alerts.length })}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === `watch-${item.id}`}
                  onClick={async () => {
                    setBusy(`watch-${item.id}`);
                    setNotice(null);
                    try {
                      onAccountChange(await api.removeWatchlistItem(item.id));
                    } catch {
                      setNotice(t('settings.notice.removeFail'));
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="text-muted hover:text-tone-rose-fg"
                  aria-label={t('settings.removeNamed', { symbol: item.symbol })}
                >
                  <TrashIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <WatchlistEditor
            onAdded={(updated) => {
              onAccountChange(updated);
              setNotice(t('settings.notice.added'));
            }}
            busy={Boolean(busy)}
          />
        </div>
      </section>

      <section className="border-border bg-surface rounded-2xl border p-5 shadow-sm sm:p-6">
        <h2 className="text-foreground text-lg font-semibold">{t('settings.prefs')}</h2>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={savePreferences}>
          <Field label={t('settings.timeZone')}>
            <select
              className={inputClass}
              value={form.timeZone}
              onChange={(event) => patchForm('timeZone', event.target.value)}
            >
              {TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <p className="text-muted mb-1.5 text-sm font-medium">{t('settings.language')}</p>
            <LanguageSwitch value={form.language} onChange={changeLanguage} />
            <p className="text-subtle mt-1.5 text-xs">{t('languageHint')}</p>
          </div>
          <Field label={t('settings.summaryHour')}>
            <select
              className={inputClass}
              value={form.summaryHour}
              onChange={(event) => patchForm('summaryHour', event.target.value)}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('settings.goal')}>
            <input
              className={inputClass}
              type="number"
              min="0"
              max={GOAL_MAX_KM}
              step="0.1"
              value={form.weeklyGoalKm}
              onChange={(event) => patchForm('weeklyGoalKm', event.target.value)}
            />
          </Field>
          <Field label={t('settings.calorieGoal')}>
            <input
              className={inputClass}
              type="number"
              min="0"
              max={GOAL_MAX_KCAL}
              step="50"
              value={form.calorieGoal}
              onChange={(event) => patchForm('calorieGoal', event.target.value)}
            />
          </Field>
          <div className="sm:col-span-1">
            <AddressInput
              label={t('settings.home')}
              value={form.home}
              onChange={(home) => patchForm('home', home)}
              required
              placeholder={t('places.street')}
              inputClassName={inputClass}
            />
          </div>
          <div className="sm:col-span-1">
            <AddressInput
              label={t('settings.work')}
              value={form.work}
              onChange={(work) => patchForm('work', work)}
              required
              placeholder={t('places.street')}
              inputClassName={inputClass}
            />
          </div>
          {offered.weather && (
            <>
              <div className="sm:col-span-2">
                <AddressInput
                  label={t('settings.weatherPlace')}
                  value={weatherQuery}
                  onChange={setWeatherQuery}
                  onSelect={(place) => {
                    if (place.lat != null) patchForm('lat', String(Number(place.lat).toFixed(4)));
                    if (place.lon != null) patchForm('lon', String(Number(place.lon).toFixed(4)));
                  }}
                  placeholder={t('settings.weatherSearch')}
                  inputClassName={inputClass}
                  savedPlaces={account.settings?.places}
                />
              </div>
              <Field label={t('settings.lat')}>
                <input
                  className={inputClass}
                  type="number"
                  step="0.0001"
                  placeholder="32.0853"
                  value={form.lat}
                  onChange={(event) => patchForm('lat', event.target.value)}
                />
              </Field>
              <Field label={t('settings.lon')}>
                <input
                  className={inputClass}
                  type="number"
                  step="0.0001"
                  placeholder="34.7818"
                  value={form.lon}
                  onChange={(event) => patchForm('lon', event.target.value)}
                />
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="from-banner-from to-banner-to rounded-lg bg-gradient-to-br px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t('settings.saving') : t('settings.save')}
            </button>
          </div>
        </form>
      </section>

      <section className="border-border rounded-2xl border p-5 sm:p-6">
        <h2 className="text-foreground text-lg font-semibold">{t('settings.delete')}</h2>
        <p className="text-muted mt-1 text-sm">{t('settings.deleteHint')}</p>
        <button
          type="button"
          disabled={busy === 'account'}
          onClick={deleteAccount}
          className="text-tone-rose-fg mt-3 text-sm font-medium hover:underline disabled:opacity-50"
        >
          {t('settings.deleteAction')}
        </button>
      </section>
    </div>
  );
}
