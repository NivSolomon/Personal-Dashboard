import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { api } from '../lib/api.js';
import { dragIds, useSortSensors } from '../lib/dnd.js';
import { WIDGET_META, gridWidgets, pinnedWidgets, reorderWidgets } from '../lib/widgets.js';
import { useT } from '../lib/i18n.jsx';
import SummaryBanner from './SummaryBanner.jsx';
import DailyTipBanner from './DailyTipBanner.jsx';
import ScheduleCard from './ScheduleCard.jsx';
import TasksCard from './TasksCard.jsx';
import EmailsCard from './EmailsCard.jsx';
import ParcelsCard from './ParcelsCard.jsx';
import WeatherCard from './WeatherCard.jsx';
import NotionCard from './NotionCard.jsx';
import ActivityCard from './ActivityCard.jsx';
import UsdCard from './UsdCard.jsx';
import WatchlistCard from './WatchlistCard.jsx';
import NutritionCard from './NutritionCard.jsx';
import SortableTile from './SortableTile.jsx';

function spanClass(id) {
  return WIDGET_META[id]?.span === 2 ? 'sm:col-span-2 xl:col-span-2' : '';
}

export default function Dashboard({
  session,
  dashboard,
  dashboardLoading,
  summary,
  summaryState,
  onRefresh,
  onAccountChange,
  onLayoutChange,
  onNutritionChange,
  onReload,
  editing = false,
}) {
  const { t } = useT();
  const saveGen = useRef(0);
  const sensors = useSortSensors();
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
      summary: (
        <SummaryBanner
          summary={summary}
          loading={summaryState.loading}
          refreshing={summaryState.refreshing}
          error={summaryState.error}
          onRefresh={onRefresh}
        />
      ),
      weather: (
        <WeatherCard
          weather={dashboard.weather}
          loading={dashboardLoading}
          error={errorFor('weather') || errorFor('all')}
        />
      ),
      schedule: (
        <ScheduleCard
          events={dashboard.events}
          timeZone={timeZone}
          loading={dashboardLoading}
          error={errorFor('events') || errorFor('all')}
          onChanged={onReload}
          places={places}
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
          loading={dashboardLoading}
          error={errorFor('emails') || errorFor('all')}
        />
      ),
      parcels: (
        <ParcelsCard
          parcels={dashboard.parcels}
          timeZone={timeZone}
          loading={dashboardLoading}
          error={errorFor('parcels') || errorFor('all')}
        />
      ),
      nutrition: (
        <NutritionCard
          nutrition={dashboard.nutrition}
          calorieGoal={session.settings?.calorieGoal}
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
          loading={dashboardLoading}
          error={errorFor('fx') || errorFor('all')}
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
    }),
    [
      connected.strava,
      dashboard,
      dashboardLoading,
      hasWorkouts,
      onAccountChange,
      onNutritionChange,
      onRefresh,
      onReload,
      places,
      session.settings?.calorieGoal,
      summary,
      summaryState.error,
      summaryState.loading,
      summaryState.refreshing,
      timeZone,
    ],
  );

  return (
    <>
      {pinned.some((widget) => widget.id === 'tip') && (
        <DailyTipBanner
          tip={summary?.dailyTip}
          load={summary?.stats?.busyness?.level}
          loading={summaryState.loading}
        />
      )}

      {editing && (
        <p className="text-muted mb-4 text-sm">
          {t('dash.editingHint')}{' '}
          <Link to="/settings#layout" className="text-foreground font-medium underline-offset-2 hover:underline">
            {t('dash.editingSettings')}
          </Link>
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGridDragEnd}>
        <SortableContext items={shown.map((widget) => widget.id)} strategy={rectSortingStrategy}>
          <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 ${editing ? 'pt-3' : ''}`}>
            {shown.map((widget) => (
              <SortableTile
                key={widget.id}
                id={widget.id}
                disabled={!editing}
                className={spanClass(widget.id)}
              >
                {tiles[widget.id]}
              </SortableTile>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
