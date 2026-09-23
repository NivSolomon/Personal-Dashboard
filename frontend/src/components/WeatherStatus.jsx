import { useState } from 'react';
import { playUi } from '../lib/sounds.js';
import { paletteFor, weatherGlyphFor } from '../lib/weatherGlyph.js';
import { useT } from '../lib/i18n.jsx';
import WeatherWeekDialog from './WeatherWeekDialog.jsx';

const TONE = {
  blue: 'bg-tone-blue text-tone-blue-fg',
  amber: 'bg-tone-amber text-tone-amber-fg',
  indigo: 'bg-tone-indigo text-tone-indigo-fg',
};

/** Compact live conditions for the page header: icon + degrees, tap for the week. */
export default function WeatherStatus({ weather, loading, timeZone }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

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
  const palette = TONE[paletteFor({ temp, icon, wet })];
  const detail = `${temp}°, ${description}${feelsLike != null ? ` · ${t('feelsLike', { temp: feelsLike })}` : ''}`;

  return (
    <>
      <button
        type="button"
        title={detail}
        aria-label={`${t('weatherNow', { temp, description })}. ${t('forecast.open')}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          playUi('tap');
          setOpen(true);
        }}
        className={`${palette} inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 transition hover:opacity-90`}
      >
        <Glyph className="size-5" />
        <span className="text-sm font-semibold tabular-nums">{temp}°</span>
      </button>
      <WeatherWeekDialog
        open={open}
        weather={weather}
        timeZone={timeZone}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
