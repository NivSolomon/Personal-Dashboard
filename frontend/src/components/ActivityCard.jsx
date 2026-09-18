import Card from './Card.jsx';
import { ActivityIcon } from './icons.jsx';
import { relativeTime } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-foreground text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted text-xs">{label}</p>
    </div>
  );
}

export default function ActivityCard({ progress, connected = true, loading, error }) {
  const { t } = useT();
  const sportLabel = (sport) => {
    const key = `sport.${sport}`;
    const label = t(key);
    return label === key ? sport : label;
  };

  if (!connected) {
    return (
      <Card
        title={t('widget.activity.title')}
        icon={<ActivityIcon className="size-4.5" />}
        tone="amber"
        layout="plain"
        loading={loading}
        empty={false}
      >
        <div className="py-4 text-center">
          <p className="text-muted text-sm text-balance">
            {t('activity.connect')}
          </p>
          <a
            href="/auth/strava"
            className="bg-tone-amber text-tone-amber-fg mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition hover:opacity-90"
          >
            <ActivityIcon className="size-4" />
            {t('settings.connectStrava')}
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={t('widget.activity.title')}
      icon={<ActivityIcon className="size-4.5" />}
      tone="amber"
      badge={progress ? t('activity.kmBadge', { n: progress.distanceKm }) : null}
      loading={loading}
      error={error}
      layout="plain"
      empty={!progress}
      emptyText={t('activity.empty')}
    >
      {progress && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={progress.distanceKm} label={t('activity.kmWeek')} />
            <Stat value={progress.movingMinutes} label={t('activity.minutes')} />
            <Stat value={progress.count} label={t('activity.count')} />
          </div>

          {progress.goalKm && (
            <div>
              <div className="text-muted flex items-baseline justify-between text-xs">
                <span>{t('activity.goal')}</span>
                <span className="tabular-nums">
                  {t('activity.kmOf', { done: progress.distanceKm, goal: progress.goalKm })}
                </span>
              </div>
              <div className="bg-tone-neutral mt-1.5 h-2 overflow-hidden rounded-full">
                <div
                  className="bg-tone-amber-fg h-full rounded-full transition-[width]"
                  style={{ width: `${Math.min(100, progress.goalPercent)}%` }}
                />
              </div>
            </div>
          )}

          {progress.bySport.length > 0 && (
            <ul className="border-border-subtle space-y-1 border-t pt-3">
              {progress.bySport.map((sport) => (
                <li key={sport.sport} className="text-muted flex justify-between text-xs">
                  <span>{sportLabel(sport.sport)}</span>
                  <span className="tabular-nums">
                    {t('activity.kmCount', { km: sport.distanceKm, count: sport.count })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {progress.latest && (
            <p className="text-subtle truncate text-xs">
              {t('activity.latest', {
                name: progress.latest.name,
                when: relativeTime(progress.latest.at),
              })}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
