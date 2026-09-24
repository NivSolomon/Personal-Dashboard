import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { api, isAbortError, setAuthToken } from './lib/api.js';
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
import { Spinner } from './components/BusyStatus.jsx';
import BrandLogo from './components/BrandLogo.jsx';
import { GearIcon, LayoutIcon, SignOutIcon } from './components/icons.jsx';
import WeatherStatus from './components/WeatherStatus.jsx';
import WatchlistStatus from './components/WatchlistStatus.jsx';
import PlacesShortcuts from './components/PlacesShortcuts.jsx';
import WelcomeMoment from './components/WelcomeMoment.jsx';
import Dashboard from './components/Dashboard.jsx';
import { placesReady } from './lib/places.js';
import { enabledWidgetsKey } from './lib/widgets.js';
import {
  clearBoardSnapshot,
  dashboardLooksReady,
  mergeDashboard,
  readBoardSnapshot,
  writeBoardSnapshot,
} from './lib/boardCache.js';

const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard.jsx'));
const PlacesSetup = lazy(() => import('./components/PlacesSetup.jsx'));

const EMPTY_DASHBOARD = {
  events: [],
  tasks: [],
  emails: [],
  parcels: [],
  nutrition: null,
  notion: [],
  weather: null,
  activity: null,
  fx: { base: 'ILS', asOf: null, quotes: [] },
  watchlist: { items: [], fired: [] },
  commute: null,
  dayPlan: null,
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
  onStartLayout,
  children,
}) {
  const { t, language } = useT();
  const [signingOut, setSigningOut] = useState(false);
  const firstName = displayFirstName(session.user.name, language);

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onLogout();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6 sm:p-8">
      <a href="#main" className="skip-link">
        {t('skipToContent')}
      </a>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <BrandLogo className="size-8" withName />
          <p className="text-muted mt-2 text-sm font-medium">{todayLabel(session.timeZone)}</p>
          <h1 className="text-foreground mt-0.5 text-3xl font-bold">{t('hello', { name: firstName })}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <WeatherStatus weather={weather} loading={weatherLoading} timeZone={session.timeZone} />
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
            onClick={logout}
            disabled={signingOut}
            title={signingOut ? t('loggingOut') : t('logout')}
            aria-label={signingOut ? t('loggingOut') : t('logout')}
            aria-busy={signingOut}
            className="border-border bg-surface text-muted hover:text-foreground hover:bg-surface-hover grid size-9 place-items-center rounded-lg border transition disabled:opacity-60"
          >
            {signingOut ? <Spinner className="size-4" /> : <SignOutIcon className="size-4" />}
          </button>
        </div>
      </header>
      <main id="main">{children}</main>
      <WelcomeMoment firstName={firstName} onCustomize={onStartLayout} />
    </div>
  );
}

function PageFallback() {
  const { t } = useT();
  return (
    <div className="grid min-h-[40vh] place-items-center p-6">
      <p className="text-muted flex items-center gap-2 text-sm">
        <Spinner className="size-4" />
        {t('loading')}
      </p>
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
  handleBoardChange,
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
          <p className="text-muted flex items-center gap-2 text-sm">
            <Spinner className="size-4" />
            {t('loading')}
          </p>
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
      <Suspense fallback={<PageFallback />}>
        <OnboardingWizard
          account={session}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSaved={(next) => applyAccount(next)}
          onLogout={handleLogout}
          onLanguageChange={onLanguageChange}
        />
      </Suspense>
    );
  }

  if (!placesReady(session.settings)) {
    return (
      <Suspense fallback={<PageFallback />}>
        <PlacesSetup
          account={session}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSaved={(next) => applyAccount(next)}
          onLogout={handleLogout}
          onLanguageChange={onLanguageChange}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageFallback />}>
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
            onStartLayout={() => setLayoutEditing(true)}
          >
            <Dashboard
              session={session}
              dashboard={dashboard}
              dashboardLoading={dashboardLoading}
              summary={summary}
              summaryState={summaryState}
              editing={layoutEditing}
              onAccountChange={applyAccount}
              onLayoutChange={applyLayout}
              onNutritionChange={applyNutrition}
              onReload={handleBoardChange}
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
    </Suspense>
  );
}

export default function App() {
  const [session, setSession] = useState({ status: 'loading' });
  const [dashboard, setDashboard] = useState(
    () => readBoardSnapshot()?.dashboard || EMPTY_DASHBOARD,
  );
  const [dashboardLoading, setDashboardLoading] = useState(
    () => !dashboardLooksReady(readBoardSnapshot()?.dashboard),
  );
  const [summary, setSummary] = useState(() => readBoardSnapshot()?.summary || null);
  const [summaryState, setSummaryState] = useState(() => ({
    loading: !readBoardSnapshot()?.summary,
    error: null,
    refreshing: false,
  }));
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [guestLanguage, setGuestLanguage] = useState(readStoredLanguage);
  const { theme, toggle: toggleTheme } = useTheme();
  const sessionRef = useRef(session);
  const dashboardRef = useRef(dashboard);
  const summaryRef = useRef(summary);
  const briefingSyncTimer = useRef(null);
  sessionRef.current = session;
  dashboardRef.current = dashboard;
  summaryRef.current = summary;

  const signOut = useCallback(() => setSession({ status: 'anon' }), []);

  const persistBoard = useCallback((nextDashboard, nextSummary) => {
    const userId = sessionRef.current?.user?.id;
    if (!userId) return;
    writeBoardSnapshot({
      userId,
      dashboard: nextDashboard,
      summary: nextSummary,
    });
  }, []);

  const loadDashboard = useCallback(
    async (signal, { silent = false } = {}) => {
      const stay = silent || dashboardLooksReady(dashboardRef.current);
      if (!stay) setDashboardLoading(true);
      try {
        const data = await api.dashboard({ signal });
        if (signal?.aborted) return;
        const next = mergeDashboard(dashboardRef.current, data);
        setDashboard(next);
        persistBoard(next, summaryRef.current);
      } catch (error) {
        if (isAbortError(error)) return;
        if (error.needsLogin) signOut();
        else if (!stay) {
          setDashboard({ ...EMPTY_DASHBOARD, errors: [{ source: 'all', code: errorKind(error) }] });
        }
      } finally {
        if (!signal?.aborted) setDashboardLoading(false);
      }
    },
    [persistBoard, signOut],
  );

  const loadSummary = useCallback(
    async (refresh = false, signal, { keepVisible = false, language } = {}) => {
      const stay =
        keepVisible || Boolean(summaryRef.current?.text || summaryRef.current?.dailyTip);
      setSummaryState((prev) => ({
        ...prev,
        error: null,
        loading: stay ? false : !refresh,
        refreshing: refresh || stay,
      }));
      try {
        const data = refresh
          ? await api.refreshSummary({ signal })
          : await api.summary({ signal, language });
        if (signal?.aborted) return;
        setSummary(data);
        persistBoard(dashboardRef.current, data);
      } catch (error) {
        if (isAbortError(error)) return;
        if (error.needsLogin) signOut();
        else setSummaryState((prev) => ({ ...prev, error: errorKind(error) }));
      } finally {
        if (!signal?.aborted) {
          setSummaryState((prev) => ({ ...prev, loading: false, refreshing: false }));
        }
      }
    },
    [persistBoard, signOut],
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const applyMe = (me) => {
      if (!me.hasCompletedOnboarding) {
        const guest = readStoredLanguage();
        me = { ...me, settings: { ...me.settings, language: guest } };
      }
      const snap = readBoardSnapshot();
      if (snap?.userId && me.user?.id && snap.userId !== me.user.id) {
        clearBoardSnapshot();
        setDashboard(EMPTY_DASHBOARD);
        setSummary(null);
        setDashboardLoading(true);
        setSummaryState({ loading: true, error: null, refreshing: false });
      }
      setSession({ status: 'authed', ...me });
      if (me.settings?.language) setGuestLanguage(normalizeLanguage(me.settings.language));
    };

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const ticket = params.get('login');
      if (ticket) {
        try {
          const { token } = await api.claimSession(ticket, { signal });
          if (signal.aborted) return;
          setAuthToken(token);
          params.delete('login');
          const query = params.toString();
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
          );
        } catch (error) {
          if (isAbortError(error)) return;
          setAuthToken(null);
        }
      }
      if (signal.aborted) return;

      const meP = api.me({ signal });
      const dashP = api.dashboard({ signal, fast: true }).catch((error) => ({ __error: error }));

      meP
        .then((me) => {
          if (signal.aborted) return;
          applyMe(me);
        })
        .catch((error) => {
          if (isAbortError(error)) return;
          setSession(error.needsLogin ? { status: 'anon' } : { status: 'error', kind: errorKind(error) });
        });

      dashP.then((data) => {
        if (signal.aborted || data?.__error) return;
        const current = sessionRef.current;
        if (current.status === 'anon' || current.status === 'error') return;
        if (
          current.status === 'authed' &&
          (!current.hasCompletedOnboarding || !placesReady(current.settings))
        ) {
          return;
        }
        const next = mergeDashboard(dashboardRef.current, data);
        setDashboard(next);
        setDashboardLoading(false);
        const userId = current.user?.id;
        if (userId) writeBoardSnapshot({ userId, dashboard: next, summary: summaryRef.current });
      });
    }

    void boot();
    return () => controller.abort();
  }, []);

  const dataSettingsKey =
    session.status === 'authed'
      ? JSON.stringify({
          tz: session.settings?.timeZone,
          weather: session.settings?.weather,
          places: session.settings?.places,
          goal: session.settings?.weeklyGoalKm,
          fx: session.settings?.fx,
          enabled: enabledWidgetsKey(session.settings?.layout),
          notion: session.notion,
          connected: session.connected,
        })
      : '';

  useEffect(() => {
    if (session.status !== 'authed') return;
    if (!session.hasCompletedOnboarding) return;
    if (!placesReady(session.settings)) return;
    const controller = new AbortController();
    void loadDashboard(controller.signal, {
      silent: dashboardLooksReady(dashboardRef.current),
    });
    void loadSummary(false, controller.signal);
    return () => controller.abort();
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

  const handleBoardChange = useCallback(async () => {
    const dashboardPromise = loadDashboard();
    if (briefingSyncTimer.current) clearTimeout(briefingSyncTimer.current);
    briefingSyncTimer.current = setTimeout(() => {
      briefingSyncTimer.current = null;
      void loadSummary(true);
    }, 1400);
    await dashboardPromise;
  }, [loadDashboard, loadSummary]);

  useEffect(() => {
    const minAwayMs = 2 * 60 * 1000;
    let lastSync = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const current = sessionRef.current;
      if (current.status !== 'authed' || !current.hasCompletedOnboarding) return;
      if (!placesReady(current.settings)) return;
      if (Date.now() - lastSync < minAwayMs) return;
      lastSync = Date.now();
      void Promise.all([loadSummary(true), loadDashboard()]);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (briefingSyncTimer.current) clearTimeout(briefingSyncTimer.current);
    };
  }, [loadDashboard, loadSummary]);

  const handleLogout = useCallback(async () => {
    setAuthToken(null);
    await api.logout().catch(() => {});
    clearBoardSnapshot();
    setDashboard(EMPTY_DASHBOARD);
    setSummary(null);
    setDashboardLoading(true);
    setSummaryState({ loading: true, error: null, refreshing: false });
    signOut();
  }, [signOut]);

  const onLanguageChange = useCallback(
    (next) => {
      const language = storeLanguage(next);
      setGuestLanguage(language);
      setSession((prev) => {
        if (prev.status !== 'authed') return prev;
        return { ...prev, settings: { ...prev.settings, language } };
      });

      const current = sessionRef.current;
      if (current.status !== 'authed') return;

      if (current.hasCompletedOnboarding && placesReady(current.settings)) {
        void loadSummary(false, undefined, { keepVisible: true, language });
      }
      void api
        .updateSettings({ language })
        .then((updated) => applyAccount(updated))
        .catch(() => {
          /* Keep the optimistic language; widgets already use the new copy. */
        });
    },
    [applyAccount, loadSummary],
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
        handleBoardChange={handleBoardChange}
        handleLogout={handleLogout}
        signOut={signOut}
        onLanguageChange={onLanguageChange}
      />
    </LanguageProvider>
  );
}
