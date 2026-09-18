import {
  BoltIcon,
  CloudIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  MoonIcon,
  SunIcon,
} from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

function isNight(code) {
  return String(code || '').endsWith('n');
}

function conditionKind(code) {
  return String(code || '').slice(0, 2);
}

/**
 * Rain/snow/storm win over temperature. Otherwise hot → sun, cold → snow or
 * overcast, and mild clear/cloudy follows the OpenWeather code.
 */
function weatherGlyphFor({ temp, icon, wet }) {
  const kind = conditionKind(icon);
  const night = isNight(icon);

  if (kind === '11') return BoltIcon;
  if (kind === '13' || (typeof temp === 'number' && temp <= 2)) return CloudSnowIcon;
  if (kind === '09' || kind === '10' || wet) return CloudRainIcon;
  if (typeof temp === 'number' && temp >= 27) return SunIcon;
  if (typeof temp === 'number' && temp <= 12) return night ? MoonIcon : CloudIcon;
  if (kind === '01') return night ? MoonIcon : SunIcon;
  if (kind === '02') return CloudSunIcon;
  return CloudIcon;
}

/** Compact live conditions for the page header: icon + degrees, nothing else. */
export default function WeatherStatus({ weather, loading }) {
  const { t } = useT();
  if (loading && !weather) {
    return (
      <div
        className="border-border bg-surface flex size-9 items-center justify-center rounded-lg border"
        aria-hidden="true"
      >
        <span className="bg-skeleton size-4 animate-pulse rounded-full" />
      </div>
    );
  }

  if (!weather?.current) return null;

  const { temp, description, icon, wet, feelsLike } = weather.current;
  const Glyph = weatherGlyphFor({ temp, icon, wet });
  const hot = temp >= 27;
  const cold = temp <= 12;
  const rainy = Boolean(wet) || ['09', '10', '11'].includes(conditionKind(icon));
  const palette = rainy
    ? 'bg-tone-blue text-tone-blue-fg'
    : hot
      ? 'bg-tone-amber text-tone-amber-fg'
      : cold
        ? 'bg-tone-indigo text-tone-indigo-fg'
        : 'bg-tone-blue text-tone-blue-fg';

  return (
    <div
      title={`${temp}°, ${description}${feelsLike != null ? ` · ${t('feelsLike', { temp: feelsLike })}` : ''}`}
      aria-label={t('weatherNow', { temp, description })}
      className={`${palette} inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1`}
    >
      <Glyph className="size-5" />
      <span className="text-sm font-semibold tabular-nums">{temp}°</span>
    </div>
  );
}
