import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api, LOGIN_URL, NOTION_CONNECT_URL, STRAVA_CONNECT_URL } from '../lib/api.js';
import { loginErrorText, eventIssueText } from '../lib/errors.js';
import {
  ChartIcon,
  ChevronDownIcon,
  GearIcon,
  LayoutIcon,
  ShieldIcon,
  TrashIcon,
} from '../components/icons.jsx';
import BusyStatus, { Spinner } from '../components/BusyStatus.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import { SoundToggle } from '../components/SoundFx.jsx';
import LayoutPicker from '../components/LayoutPicker.jsx';
import WatchlistEditor from '../components/WatchlistEditor.jsx';
import AddressInput from '../components/AddressInput.jsx';
import { moveWidget, reorderWidgets, visibleWidgets, withWidgetEnabled } from '../lib/widgets.js';
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

const PANEL_TONES = {
  indigo: 'bg-tone-indigo text-tone-indigo-fg',
  green: 'bg-tone-green text-tone-green-fg',
  amber: 'bg-tone-amber text-tone-amber-fg',
  blue: 'bg-tone-blue text-tone-blue-fg',
  rose: 'bg-tone-rose text-tone-rose-fg',
};

function SettingsPanel({
  id,
  title,
  hint,
  summary,
  icon,
  tone = 'indigo',
  open,
  onToggle,
  children,
  danger = false,
}) {
  const bodyId = `${id}-body`;
  const toneClasses = PANEL_TONES[tone] ?? PANEL_TONES.indigo;
  return (
    <section
      id={id}
      className={`overflow-hidden rounded-2xl border ${
        danger ? 'border-border' : 'border-border bg-surface shadow-sm'
      }`}
    >
      <h2>
        <button
          type="button"
          className="hover:bg-surface-hover/60 flex w-full items-center justify-between gap-3 px-5 py-4 text-start sm:px-6"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="flex min-w-0 items-start gap-3">
            {icon ? (
              <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${toneClasses}`}>
                {icon}
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="text-foreground block text-lg font-semibold">{title}</span>
              {!open && (summary || hint) ? (
                <span className="text-muted mt-0.5 block text-sm font-normal">{summary || hint}</span>
              ) : null}
            </span>
          </span>
          <ChevronDownIcon
            className={`text-muted size-5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {open ? (
        <div id={bodyId} className="border-border-subtle border-t px-5 py-5 sm:px-6">
          {hint ? <p className="text-muted mb-4 text-sm">{hint}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

const inputClass =
  'border-border bg-surface text-foreground w-full rounded-lg border px-3 py-2 text-sm';

export default function SettingsPage({ account, onAccountChange, onSignedOut, onLanguageChange }) {
  const { t } = useT();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get('error');

  const [openSection, setOpenSection] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#layout') return 'layout';
    return oauthError ? 'accounts' : null;
  });
  const [saving, setSaving] = useState(false);
  const [prefsAttempted, setPrefsAttempted] = useState(false);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState(() => ({
    timeZone: account.settings.timeZone,
    language: account.settings.language,
    summaryHour: account.settings.summaryHour,
    weeklyGoalKm: account.settings.weeklyGoalKm || 0,
    calorieGoal: account.settings.calorieGoal || 2000,
    lat: account.settings.weather?.lat ?? '',
    lon: account.settings.weather?.lon ?? '',
    weatherPlace: account.settings.weather?.label || '',
    home: account.settings.places?.home || '',
    work: account.settings.places?.work || '',
  }));

  const offered = account.offered || {};
  const connected = account.connected || {};
  const watchItems = account.settings?.watchlist?.items || [];
  const connectedNames = [
    connected.google && 'Google',
    offered.notion && connected.notion && 'Notion',
    offered.strava && connected.strava && 'Strava',
  ].filter(Boolean);
  const prefIssues = settingsFormIssues(form, { weatherOffered: Boolean(offered.weather) });
  const showPrefIssue = (field) => prefsAttempted && prefIssues[field];

  useEffect(() => {
    if (location.hash !== '#layout') return;
    setOpenSection('layout');
    document.getElementById('layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  const toggleSection = (id) => setOpenSection((current) => (current === id ? null : id));

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
    setPrefsAttempted(true);
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
          label: form.weatherPlace.trim(),
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

      <div className="space-y-3">

      <SettingsPanel
        id="accounts"
        title={t('settings.accounts')}
        hint={t('settings.accountsHint')}
        summary={connectedNames.join(' · ') || t('settings.accountsNone')}
        icon={<ShieldIcon className="size-4.5" />}
        tone="indigo"
        open={openSection === 'accounts'}
        onToggle={() => toggleSection('accounts')}
      >
        <ul className="space-y-4">
          <li className="flex flex-wrap items-center justify-between gap-3">
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
                className="text-tone-rose-fg inline-flex items-center gap-1.5 text-sm font-medium hover:underline disabled:opacity-50"
              >
                {busy === 'google' && <Spinner className="size-3.5" />}
                {busy === 'google' ? t('settings.disconnecting') : t('settings.disconnect')}
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
                      className="text-tone-rose-fg inline-flex items-center gap-1.5 text-sm font-medium hover:underline disabled:opacity-50"
                    >
                      {busy === 'notion' && <Spinner className="size-3.5" />}
                      {busy === 'notion' ? t('settings.disconnecting') : t('settings.disconnect')}
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
              {(busy === 'notion-deadlines' || busy === 'notion-workouts') && (
                <BusyStatus label={t('settings.saving')} tone="indigo" />
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
                    className="text-tone-rose-fg inline-flex items-center gap-1.5 text-sm font-medium hover:underline disabled:opacity-50"
                  >
                    {busy === 'strava' && <Spinner className="size-3.5" />}
                    {busy === 'strava' ? t('settings.disconnecting') : t('settings.disconnect')}
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
      </SettingsPanel>

      <SettingsPanel
        id="layout"
        title={t('settings.layout')}
        icon={<LayoutIcon className="size-4.5" />}
        tone="blue"
        hint={t('settings.layoutHint')}
        summary={t('settings.layoutSummary', { n: visibleWidgets(account).length })}
        open={openSection === 'layout'}
        onToggle={() => toggleSection('layout')}
      >
        <LayoutPicker
          layout={account.settings?.layout}
          session={account}
          disabled={saving}
          onChange={patchWidget}
        />
        {saving && openSection === 'layout' && <BusyStatus label={t('settings.saving')} tone="blue" />}
      </SettingsPanel>

      <SettingsPanel
        id="watch"
        title={t('settings.watch')}
        hint={t('settings.watchHint')}
        icon={<ChartIcon className="size-4.5" />}
        tone="amber"
        summary={
          watchItems.length
            ? t('settings.watchSummary', { n: watchItems.length })
            : t('settings.watchEmpty')
        }
        open={openSection === 'watch'}
        onToggle={() => toggleSection('watch')}
      >

        {Boolean(watchItems.length) && (
          <ul className="space-y-2">
            {watchItems.map((item) => (
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
                  className="text-muted hover:text-tone-rose-fg inline-flex"
                  aria-label={t('settings.removeNamed', { symbol: item.symbol })}
                >
                  {busy === `watch-${item.id}` ? <Spinner className="size-4" /> : <TrashIcon className="size-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={watchItems.length ? 'mt-4' : ''}>
          <WatchlistEditor
            onAdded={(updated) => {
              onAccountChange(updated);
              setNotice(t('settings.notice.added'));
            }}
            busy={Boolean(busy)}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel
        id="prefs"
        title={t('settings.prefs')}
        hint={t('settings.prefsHint')}
        icon={<GearIcon className="size-4.5" />}
        tone="green"
        summary={`${form.language === 'English' ? t('languageEnglish') : t('languageHebrew')} · ${form.timeZone}`}
        open={openSection === 'prefs'}
        onToggle={() => toggleSection('prefs')}
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={savePreferences}>
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
              required
              value={form.weeklyGoalKm}
              onChange={(event) => patchForm('weeklyGoalKm', event.target.value)}
              aria-invalid={showPrefIssue('weeklyGoalKm') ? true : undefined}
            />
            {showPrefIssue('weeklyGoalKm') && (
              <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('weeklyGoalKm', prefIssues.weeklyGoalKm)}
              </p>
            )}
          </Field>
          <Field label={t('settings.calorieGoal')}>
            <input
              className={inputClass}
              type="number"
              min="0"
              max={GOAL_MAX_KCAL}
              step="50"
              required
              value={form.calorieGoal}
              onChange={(event) => patchForm('calorieGoal', event.target.value)}
              aria-invalid={showPrefIssue('calorieGoal') ? true : undefined}
            />
            {showPrefIssue('calorieGoal') && (
              <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('calorieGoal', prefIssues.calorieGoal)}
              </p>
            )}
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
            {showPrefIssue('home') && (
              <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('home', prefIssues.home)}
              </p>
            )}
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
            {showPrefIssue('work') && (
              <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('work', prefIssues.work)}
              </p>
            )}
          </div>
          {offered.weather && (
            <div className="sm:col-span-2">
              <AddressInput
                label={t('settings.weatherPlace')}
                value={form.weatherPlace}
                onChange={(weatherPlace) => patchForm('weatherPlace', weatherPlace)}
                onSelect={async (place) => {
                  let lat = place.lat;
                  let lon = place.lon;
                  if ((lat == null || lon == null) && place.label) {
                    try {
                      const body = await api.suggestPlaces(place.label);
                      const match = (body.places || []).find(
                        (row) => row.lat != null && row.lon != null,
                      );
                      if (match) {
                        lat = match.lat;
                        lon = match.lon;
                      }
                    } catch {
                      /* keep the previous saved coordinates */
                    }
                  }
                  setForm((prev) => ({
                    ...prev,
                    weatherPlace: place.label || prev.weatherPlace,
                    lat: lat != null ? String(Number(lat).toFixed(4)) : prev.lat,
                    lon: lon != null ? String(Number(lon).toFixed(4)) : prev.lon,
                  }));
                }}
                placeholder={t('settings.weatherSearch')}
                inputClassName={inputClass}
                savedPlaces={account.settings?.places}
              />
              {showPrefIssue('coords') && (
                <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                  {eventIssueText('coords', prefIssues.coords)}
                </p>
              )}
            </div>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="from-banner-from to-banner-to inline-flex items-center gap-2 rounded-lg bg-gradient-to-br px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving && <Spinner className="size-3.5" />}
              {saving ? t('settings.saving') : t('settings.save')}
            </button>
          </div>
        </form>
      </SettingsPanel>

      <SettingsPanel
        id="delete"
        title={t('settings.delete')}
        hint={t('settings.deleteHint')}
        icon={<TrashIcon className="size-4.5" />}
        tone="rose"
        open={openSection === 'delete'}
        onToggle={() => toggleSection('delete')}
        danger
      >
        <button
          type="button"
          disabled={busy === 'account'}
          onClick={deleteAccount}
          className="text-tone-rose-fg inline-flex items-center gap-1.5 text-sm font-medium hover:underline disabled:opacity-50"
        >
          {busy === 'account' && <Spinner className="size-3.5" />}
          {busy === 'account' ? t('settings.deleting') : t('settings.deleteAction')}
        </button>
      </SettingsPanel>
      </div>
    </div>
  );
}
