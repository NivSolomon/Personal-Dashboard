import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { api } from '../lib/api.js';
import { dragIds, useSortSensors } from '../lib/dnd.js';
import { AROUND_CAP, gridWidgets, isDayWidget, pinnedWidgets, reorderWidgets } from '../lib/widgets.js';
import { useT } from '../lib/i18n.jsx';
import SummaryBanner from './SummaryBanner.jsx';
import DailyTipBanner from './DailyTipBanner.jsx';
import TasksCard from './TasksCard.jsx';
import EmailsCard from './EmailsCard.jsx';
import ParcelsCard from './ParcelsCard.jsx';
import WeatherCard from './WeatherCard.jsx';
import NotionCard from './NotionCard.jsx';
import ActivityCard from './ActivityCard.jsx';
import UsdCard from './UsdCard.jsx';
import WatchlistCard from './WatchlistCard.jsx';
import NutritionCard from './NutritionCard.jsx';
import TimelineCard from './TimelineCard.jsx';
import AskWeekCard from './AskWeekCard.jsx';
import SortableTile from './SortableTile.jsx';
import { HighlightProvider } from '../lib/highlight.jsx';

const AROUND_STORAGE = 'dashboard-around-open';

function readAroundOpen() {
  try {
    return localStorage.getItem(AROUND_STORAGE) === '1';
  } catch {
    return false;
  }
}

function writeAroundOpen(open) {
  try {
    localStorage.setItem(AROUND_STORAGE, open ? '1' : '0');
  } catch {
    /* Ignore quota / private-mode failures. */
  }
}

function BoardColumn({ title, items, tiles, editing, footer = null }) {
  if (!items.length) return null;
  return (
    <section className="min-w-0">
      <h2 className="text-muted mb-3 text-sm font-semibold">{title}</h2>
      <SortableContext items={items.map((widget) => widget.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((widget) => (
            <SortableTile key={widget.id} id={widget.id} disabled={!editing}>
              {tiles[widget.id]}
            </SortableTile>
          ))}
        </div>
      </SortableContext>
      {footer}
    </section>
  );
}

export default function Dashboard({
  session,
  dashboard,
  dashboardLoading,
  summary,
  summaryState,
  onAccountChange,
  onLayoutChange,
  onNutritionChange,
  onReload,
  editing = false,
}) {
  const { t } = useT();
  const [aroundOpen, setAroundOpen] = useState(readAroundOpen);
  const saveGen = useRef(0);
  const sensors = useSortSensors();
  const pendingMail = Boolean(dashboard.partial);
  const errorFor = (source) => dashboard.errors?.find((e) => e.source === source) || null;
  const layout = session.settings?.layout;
  const shown = gridWidgets(session);
  const pinned = pinnedWidgets(session);
  const connected = session.connected || {};
  const hasWorkouts = connected.notion && session.notion?.workouts?.dataSourceId;

  const saveLayout = async (next) => {
    const gen = ++saveGen.current;
    if (onLayoutChange) onLayoutChange(next);
    else {
      onAccountChange({
        ...session,
        settings: { ...session.settings, layout: next },
      });
    }
    try {
      const updated = await api.updateSettings({ layout: next });
      if (gen !== saveGen.current) return;
      if (onLayoutChange) onLayoutChange(updated.settings?.layout || next);
      else onAccountChange(updated);
    } catch {
      if (gen !== saveGen.current) return;
      try {
        onAccountChange(await api.me());
      } catch {
        /* Keep the optimistic layout if we cannot reload. */
      }
    }
  };

  const patchWidget = (id, action) => {
    const current = layout || { widgets: [] };
    if (action.overId) {
      void saveLayout(reorderWidgets(current, id, action.overId));
    }
  };

  const handleGridDragEnd = (event) => {
    if (!editing) return;
    const ids = dragIds(event);
    if (ids) patchWidget(ids.fromId, { overId: ids.toId });
  };

  const places = session.settings?.places;
  const timeZone = session.timeZone;
  const tiles = useMemo(
    () => ({
      tip: (
        <DailyTipBanner
          tip={summary?.dailyTip}
          sources={summary?.tipSources}
          load={summary?.stats?.busyness?.level}
          loading={summaryState.loading}
          refreshing={summaryState.refreshing}
        />
      ),
      summary: (
        <SummaryBanner
          summary={summary}
          loading={summaryState.loading}
          refreshing={summaryState.refreshing}
          error={summaryState.error}
          onRetry={onReload}
        />
      ),
      weather: (
        <WeatherCard
          weather={dashboard.weather}
          loading={dashboardLoading}
          error={errorFor('weather') || errorFor('all')}
        />
      ),
      tasks: (
        <TasksCard
          tasks={dashboard.tasks}
          timeZone={timeZone}
          loading={dashboardLoading}
          error={errorFor('tasks') || errorFor('all')}
          onChanged={onReload}
          places={places}
        />
      ),
      emails: (
        <EmailsCard
          emails={dashboard.emails}
          timeZone={timeZone}
          loading={dashboardLoading || (pendingMail && !(dashboard.emails || []).length)}
          error={errorFor('emails') || errorFor('all')}
        />
      ),
      parcels: (
        <ParcelsCard
          parcels={dashboard.parcels}
          timeZone={timeZone}
          loading={dashboardLoading || (pendingMail && !(dashboard.parcels || []).length)}
          error={errorFor('parcels') || errorFor('all')}
        />
      ),
      nutrition: (
        <NutritionCard
          nutrition={dashboard.nutrition}
          calorieGoal={session.settings?.calorieGoal}
          timeZone={timeZone}
          loading={dashboardLoading}
          error={errorFor('nutrition') || errorFor('all')}
          onChange={onNutritionChange}
        />
      ),
      notion: (
        <NotionCard
          deadlines={dashboard.notion}
          timeZone={timeZone}
          loading={dashboardLoading}
          error={errorFor('notion') || errorFor('all')}
        />
      ),
      activity: (
        <ActivityCard
          progress={dashboard.activity}
          connected={hasWorkouts || connected.strava}
          loading={dashboardLoading}
          error={errorFor('activity') || errorFor('all')}
        />
      ),
      usd: (
        <UsdCard
          quote={dashboard.fx}
          settings={session.settings}
          loading={dashboardLoading}
          error={errorFor('fx') || errorFor('all')}
          onAccountChange={onAccountChange}
        />
      ),
      watchlist: (
        <WatchlistCard
          watchlist={dashboard.watchlist}
          loading={dashboardLoading}
          error={errorFor('watchlist') || errorFor('all')}
          onAccountChange={onAccountChange}
        />
      ),
      timeline: (
        <TimelineCard
          plan={dashboard.dayPlan}
          events={dashboard.events}
          timeZone={timeZone}
          loading={dashboardLoading}
          error={errorFor('events') || errorFor('all')}
          onChanged={onReload}
          places={places}
        />
      ),
      ask: <AskWeekCard />,
    }),
    [
      connected.strava,
      dashboard.activity,
      dashboard.emails,
      dashboard.errors,
      dashboard.events,
      dashboard.fx,
      dashboard.notion,
      dashboard.nutrition,
      dashboard.parcels,
      dashboard.tasks,
      dashboard.watchlist,
      dashboard.weather,
      dashboard.dayPlan,
      dashboard.events,
      dashboard.partial,
      summary?.dailyTip,
      summary?.tipSources,
      summary?.stats?.busyness?.level,
      dashboardLoading,
      hasWorkouts,
      onAccountChange,
      onNutritionChange,
      onReload,
      places,
      session.settings?.calorieGoal,
      session.settings?.fx,
      summary,
      summaryState.error,
      summaryState.loading,
      summaryState.refreshing,
      timeZone,
    ],
  );

  const day = shown.filter((widget) => isDayWidget(widget.id));
  const more = shown.filter((widget) => !isDayWidget(widget.id));
  const aroundHidden = Math.max(0, more.length - AROUND_CAP);
  const aroundItems = editing || aroundOpen ? more : more.slice(0, AROUND_CAP);
  const toggleAround = () => {
    setAroundOpen((current) => {
      const next = !current;
      writeAroundOpen(next);
      return next;
    });
  };

  return (
    <HighlightProvider>
      <div className="space-y-6">
        {pinned.map((widget) => (
          <div key={widget.id}>{tiles[widget.id]}</div>
        ))}
      </div>

      {editing && (
        <p className="text-muted mt-6 mb-4 text-sm">
          {t('dash.editingHint')}{' '}
          <Link to="/settings#layout" className="text-foreground font-medium underline-offset-2 hover:underline">
            {t('dash.editingSettings')}
          </Link>
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGridDragEnd}>
        <div
          className={`grid grid-cols-1 items-start gap-8 lg:grid-cols-2 ${
            editing ? 'pt-1' : 'mt-6'
          }`}
        >
          <BoardColumn title={t('dash.section.today')} items={day} tiles={tiles} editing={editing} />
          <BoardColumn
            title={t('dash.section.more')}
            items={aroundItems}
            tiles={tiles}
            editing={editing}
            footer={
              !editing && aroundHidden > 0 ? (
                <button
                  type="button"
                  onClick={toggleAround}
                  className="text-muted hover:text-foreground mt-3 text-sm font-medium"
                >
                  {aroundOpen
                    ? t('dash.lessAround')
                    : t('dash.moreAroundCount', { n: aroundHidden })}
                </button>
              ) : null
            }
          />
        </div>
      </DndContext>
    </HighlightProvider>
  );
}
