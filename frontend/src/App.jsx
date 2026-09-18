import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/api.js';
import { errorKind, sessionErrorCopy } from './lib/errors.js';
import { todayLabel } from './lib/format.js';
import { useTheme } from './lib/theme.js';
import {
  LanguageProvider,
  displayFirstName,
  normalizeLanguage,
  readStoredLanguage,
  storeLanguage,
  useT,
} from './lib/i18n.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { SoundFx, SoundToggle } from './components/SoundFx.jsx';
import LanguageMenu from './components/LanguageMenu.jsx';
import BrandLogo from './components/BrandLogo.jsx';
import { GearIcon, LayoutIcon, SignOutIcon } from './components/icons.jsx';
import WeatherStatus from './components/WeatherStatus.jsx';
import WatchlistStatus from './components/WatchlistStatus.jsx';
import PlacesShortcuts from './components/PlacesShortcuts.jsx';
import PlacesSetup from './components/PlacesSetup.jsx';
import OnboardingWizard from './components/OnboardingWizard.jsx';
import Dashboard from './components/Dashboard.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { placesReady } from './lib/places.js';
import { enabledWidgetsKey } from './lib/widgets.js';

const EMPTY_DASHBOARD = {
  events: [],
  tasks: [],
  emails: [],
  parcels: [],
  nutrition: null,
  notion: [],
  weather: null,
  activity: null,
  fx: null,
  watchlist: { items: [], fired: [] },
  errors: [],
};

function googlePhotoUrl(url) {
  if (!url) return '';
  return String(url).replace(/=s\d+(-c)?$/, '=s96-c');
}

function Avatar({ src, name }) {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;

  return (
    <span className="ring-border size-9 shrink-0 overflow-hidden rounded-full ring-2">
      <img
        src={googlePhotoUrl(src)}
        alt={name ? t('avatar.alt', { name }) : ''}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-full object-cover object-center"
      />
    </span>
  );
}

function Shell({
  session,
  theme,
  onToggleTheme,
  onLogout,
  onLanguageChange,
  weather,
  weatherLoading,
  watchlistFired,
  layoutEditing,
  onToggleLayout,
  children,
}) {
  const { t, language } = useT();
  const firstName = displayFirstName(session.user.name, language);

  return (
    <div className="mx-auto max-w-7xl p-6 sm:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <BrandLogo className="size-8" withName />
          <p className="text-muted mt-2 text-sm font-medium">{todayLabel(session.timeZone)}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <h1 className="text-foreground text-3xl font-bold">{t('hello', { name: firstName })}</h1>
            <WeatherStatus weather={weather} loading={weatherLoading} />
            <WatchlistStatus fired={watchlistFired} />
            <PlacesShortcuts
              places={session.settings?.places}
              origin={session.settings?.weather}
              timeZone={session.timeZone}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Avatar src={session.user.picture} name={firstName || session.user.name} />
          <button
            type="button"
            onClick={onToggleLayout}
            aria-pressed={layoutEditing}
            title={layoutEditing ? t('customizeDone') : t('customize')}
            aria-label={layoutEditing ? t('customizeDone') : t('customize')}
            className={`grid size-9 place-items-center rounded-lg border transition ${
              layoutEditing
                ? 'border-tone-green-fg/30 bg-tone-green text-tone-green-fg'
                : 'border-border bg-surface text-muted hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            <LayoutIcon className="size-4" />
          </button>
          <LanguageMenu value={language} onChange={onLanguageChange} />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <SoundToggle />
          <Link
            to="/settings"
            title={t('settings')}
            aria-label={t('settings')}
            className="border-border bg-surface text-muted hover:text-foreground hover:bg-surface-hover grid size-9 place-items-center rounded-lg border transition"
          >
            <GearIcon className="size-4" />
          </Link>
          <button
            type="button"
            onClick={onLogout}
            title={t('logout')}
            aria-label={t('logout')}
            className="border-border bg-surface text-muted hover:text-foreground hover:bg-surface-hover grid size-9 place-items-center rounded-lg border transition"
          >
            <SignOutIcon className="size-4" />
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}

function resolveUiLanguage(session, guestLanguage) {
  if (session.status === 'authed' && session.hasCompletedOnboarding) {
    return normalizeLanguage(session.settings?.language);
  }
  return normalizeLanguage(guestLanguage || session.settings?.language);
}

function AppTree({
  session,
  setSession,
  dashboard,
  dashboardLoading,
  summary,
  summaryState,
  layoutEditing,
  setLayoutEditing,
  theme,
  toggleTheme,
  loadDashboard,
  loadSummary,
  applyAccount,
  applyLayout,
  applyNutrition,
  handleRefresh,
  handleLogout,
  signOut,
  onLanguageChange,
}) {
  const { t } = useT();

  if (session.status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="rise-in flex flex-col items-center gap-4">
          <BrandLogo className="size-12 rounded-2xl shadow-lg" />
          <p className="text-muted text-sm">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (session.status === 'anon') {
    return (
      <LoginScreen
        error={new URLSearchParams(window.location.search).get('error')}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLanguageChange={onLanguageChange}
      />
    );
  }

  if (session.status === 'error') {
    const copy = sessionErrorCopy(session.kind);
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-foreground text-lg font-semibold">{copy.title}</p>
          <p className="text-muted mt-2 text-sm leading-relaxed">{copy.body}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="border-border bg-surface text-foreground hover:bg-surface-hover mt-5 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!session.hasCompletedOnboarding) {
    return (
      <OnboardingWizard
        account={session}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSaved={(next) => applyAccount(next)}
        onLogout={handleLogout}
        onLanguageChange={onLanguageChange}
      />
    );
  }

  if (!placesReady(session.settings)) {
    return (
      <PlacesSetup
        account={session}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSaved={(next) => applyAccount(next)}
        onLogout={handleLogout}
        onLanguageChange={onLanguageChange}
      />
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Shell
            session={session}
            theme={theme}
            onToggleTheme={toggleTheme}
            onLogout={handleLogout}
            onLanguageChange={onLanguageChange}
            weather={dashboard.weather}
            weatherLoading={dashboardLoading}
            watchlistFired={dashboard.watchlist?.fired || []}
            layoutEditing={layoutEditing}
            onToggleLayout={() => setLayoutEditing((open) => !open)}
          >
            <Dashboard
              session={session}
              dashboard={dashboard}
              dashboardLoading={dashboardLoading}
              summary={summary}
              summaryState={summaryState}
              editing={layoutEditing}
              onRefresh={handleRefresh}
              onAccountChange={applyAccount}
              onLayoutChange={applyLayout}
              onNutritionChange={applyNutrition}
              onReload={loadDashboard}
            />
          </Shell>
        }
      />
      <Route
        path="/settings"
        element={
          <SettingsPage
            account={session}
            onAccountChange={applyAccount}
            onSignedOut={signOut}
            onLanguageChange={onLanguageChange}
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const [session, setSession] = useState({ status: 'loading' });
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [summaryState, setSummaryState] = useState({ loading: true, error: null, refreshing: false });
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [guestLanguage, setGuestLanguage] = useState(readStoredLanguage);
  const { theme, toggle: toggleTheme } = useTheme();

  const signOut = useCallback(() => setSession({ status: 'anon' }), []);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      setDashboard(await api.dashboard());
    } catch (error) {
      if (error.needsLogin) signOut();
      else setDashboard({ ...EMPTY_DASHBOARD, errors: [{ source: 'all', code: errorKind(error) }] });
    } finally {
      setDashboardLoading(false);
    }
  }, [signOut]);

  const loadSummary = useCallback(
    async (refresh = false) => {
      setSummaryState((prev) => ({ ...prev, error: null, [refresh ? 'refreshing' : 'loading']: true }));
      try {
        setSummary(refresh ? await api.refreshSummary() : await api.summary());
      } catch (error) {
        if (error.needsLogin) signOut();
        else setSummaryState((prev) => ({ ...prev, error: errorKind(error) }));
      } finally {
        setSummaryState((prev) => ({ ...prev, loading: false, refreshing: false }));
      }
    },
    [signOut],
  );

  useEffect(() => {
    api
      .me()
      .then((me) => {
        if (!me.hasCompletedOnboarding) {
          const guest = readStoredLanguage();
          me = { ...me, settings: { ...me.settings, language: guest } };
        }
        setSession({ status: 'authed', ...me });
        if (me.settings?.language) setGuestLanguage(normalizeLanguage(me.settings.language));
      })
      .catch((error) =>
        setSession(error.needsLogin ? { status: 'anon' } : { status: 'error', kind: errorKind(error) }),
      );
  }, []);

  const dataSettingsKey =
    session.status === 'authed'
      ? JSON.stringify({
          tz: session.settings?.timeZone,
          weather: session.settings?.weather,
          places: session.settings?.places,
          goal: session.settings?.weeklyGoalKm,
          lang: session.settings?.language,
          enabled: enabledWidgetsKey(session.settings?.layout),
          notion: session.notion,
          connected: session.connected,
        })
      : '';

  useEffect(() => {
    if (session.status !== 'authed') return;
    if (!session.hasCompletedOnboarding) return;
    if (!placesReady(session.settings)) return;
    void loadDashboard();
    void loadSummary();
  }, [session.status, session.hasCompletedOnboarding, dataSettingsKey, loadDashboard, loadSummary]);

  const applyAccount = useCallback((next) => {
    setSession({ status: 'authed', ...next });
    if (next.settings?.language) {
      const nextLanguage = storeLanguage(next.settings.language);
      setGuestLanguage(nextLanguage);
    }
    if (next.watchlist) {
      setDashboard((prev) => ({
        ...prev,
        watchlist: next.watchlist,
        errors: (prev.errors || []).filter((error) => error.source !== 'watchlist'),
      }));
    }
  }, []);

  const applyLayout = useCallback((layout) => {
    setSession((prev) => {
      if (prev.status !== 'authed') return prev;
      return {
        ...prev,
        settings: { ...prev.settings, layout },
      };
    });
  }, []);

  const applyNutrition = useCallback((nutrition) => {
    setDashboard((prev) => ({ ...prev, nutrition }));
  }, []);

  const handleRefresh = async () => {
    await Promise.all([loadSummary(true), loadDashboard()]);
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    signOut();
  };

  const onLanguageChange = useCallback(
    (next) => {
      const language = storeLanguage(next);
      setGuestLanguage(language);
      setSession((prev) => {
        if (prev.status !== 'authed') return prev;
        return { ...prev, settings: { ...prev.settings, language } };
      });
      if (session.status === 'authed') {
        void api
          .updateSettings({ language })
          .then((updated) => applyAccount(updated))
          .catch(() => {});
      }
    },
    [applyAccount, session.status],
  );

  const language = resolveUiLanguage(session, guestLanguage);

  return (
    <LanguageProvider language={language}>
      <SoundFx />
      <AppTree
        session={session}
        setSession={setSession}
        dashboard={dashboard}
        dashboardLoading={dashboardLoading}
        summary={summary}
        summaryState={summaryState}
        layoutEditing={layoutEditing}
        setLayoutEditing={setLayoutEditing}
        theme={theme}
        toggleTheme={toggleTheme}
        loadDashboard={loadDashboard}
        loadSummary={loadSummary}
        applyAccount={applyAccount}
        applyLayout={applyLayout}
        applyNutrition={applyNutrition}
        handleRefresh={handleRefresh}
        handleLogout={handleLogout}
        signOut={signOut}
        onLanguageChange={onLanguageChange}
      />
    </LanguageProvider>
  );
}
