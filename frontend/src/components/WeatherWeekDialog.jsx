import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { DropletIcon, SunIcon, WindIcon } from './icons.jsx';
import { localeOf, useT } from '../lib/i18n.jsx';
import { playUi } from '../lib/sounds.js';
import { conditionKeyFor, paletteFor, weatherGlyphFor } from '../lib/weatherGlyph.js';

const TONE = {
  blue: 'bg-tone-blue text-tone-blue-fg',
  amber: 'bg-tone-amber text-tone-amber-fg',
  indigo: 'bg-tone-indigo text-tone-indigo-fg',
};

function localDateKey(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function hourInZone(timeZone) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  return Number.isFinite(hour) ? hour % 24 : 0;
}

function shiftDateKey(ymd, days) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function daylightHours(day) {
  const hours = day?.hours || [];
  const visible = hours.filter((row) => row.hour >= 6 && row.hour <= 22);
  return visible.length ? visible : hours;
}

function pickHour(hours, preferHour) {
  if (!hours.length) return null;
  if (preferHour == null) {
    return hours.find((row) => row.hour === 12) || hours[Math.floor(hours.length / 2)];
  }
  return hours.reduce((best, row) =>
    Math.abs(row.hour - preferHour) < Math.abs(best.hour - preferHour) ? row : best,
  );
}

function dayLabel(date, today, t, locale) {
  if (date === today) return t('forecast.today');
  if (date === shiftDateKey(today, 1)) return t('forecast.tomorrow');
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
}

function TempChart({ hours, selectedHour, onSelect }) {
  const temps = hours.map((row) => row.temp);
  const min = Math.min(...temps) - 1;
  const max = Math.max(...temps) + 1;
  const W = 100;
  const H = 38;
  const xAt = (index) => (index / Math.max(hours.length - 1, 1)) * W;
  const yAt = (temp) => 5 + (1 - (temp - min) / (max - min || 1)) * 26;
  const line = hours
    .map((row, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(2)} ${yAt(row.temp).toFixed(2)}`)
    .join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  const pick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (hours.length - 1));
    onSelect(hours[index]);
  };

  if (hours.length < 2) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="text-indigo-500 h-28 w-full cursor-pointer"
      role="img"
      onPointerDown={pick}
      onPointerMove={(event) => {
        if (event.buttons) pick(event);
      }}
    >
      <path d={area} className="fill-indigo-500/15 dark:fill-indigo-400/20" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {hours.map((row, index) => {
        const active = selectedHour === row.hour;
        return (
          <circle
            key={row.hour}
            cx={xAt(index)}
            cy={yAt(row.temp)}
            r={active ? 1.8 : 0.85}
            className={active ? 'fill-indigo-600 dark:fill-indigo-300' : 'fill-indigo-400'}
          />
        );
      })}
    </svg>
  );
}

export default function WeatherWeekDialog({ open, weather, timeZone, onClose }) {
  const { t, language } = useT();
  const locale = localeOf(language);
  const today = localDateKey(timeZone);
  const nowHour = hourInZone(timeZone);
  const days = useMemo(() => {
    if (weather?.week?.length) return weather.week;
    if (weather?.slots?.length) {
      return [
        {
          date: today,
          high: weather.high,
          low: weather.low,
          rainChance: Math.max(0, ...weather.slots.map((slot) => slot.rainChance || 0)),
          windKmh: weather.current?.windKmh,
          humidity: weather.current?.humidity,
          uv: null,
          wet: weather.rainExpected,
          icon: weather.current?.icon,
          weatherCode: null,
          hours: weather.slots,
        },
      ];
    }
    return [];
  }, [weather, today]);

  const [date, setDate] = useState(today);
  const [hour, setHour] = useState(null);

  const selectedDay = useMemo(
    () => days.find((day) => day.date === date) || days[0] || null,
    [days, date],
  );
  const hours = daylightHours(selectedDay);
  const selectedHourRow = hours.find((row) => row.hour === hour) || pickHour(hours, date === today ? nowHour : 12);

  useEffect(() => {
    if (!open) return;
    const start = days.find((day) => day.date === today) || days[0];
    setDate(start?.date || today);
    setHour(pickHour(daylightHours(start), nowHour)?.hour ?? null);
  }, [open]);

  const chooseDay = (next) => {
    setDate(next.date);
    setHour(pickHour(daylightHours(next), next.date === today ? nowHour : 12)?.hour ?? null);
    playUi('toggle');
  };

  const chooseHour = (next) => {
    setHour(next.hour);
  };

  const hero = selectedHourRow || selectedDay;
  const Glyph = weatherGlyphFor({
    temp: hero?.temp ?? selectedDay?.high,
    icon: hero?.icon || selectedDay?.icon,
    wet: hero?.wet ?? selectedDay?.wet,
  });
  const tone = TONE[paletteFor({ temp: hero?.temp ?? selectedDay?.high, icon: hero?.icon, wet: hero?.wet })];
  const condition = t(
    `forecast.cond.${conditionKeyFor({
      icon: hero?.icon || selectedDay?.icon,
      weatherCode: hero?.weatherCode ?? selectedDay?.weatherCode,
      wet: hero?.wet ?? selectedDay?.wet,
    })}`,
  );

  return (
    <Modal
      open={open}
      size="xl"
      title={t('forecast.title')}
      description={weather?.location || undefined}
      onClose={onClose}
    >
      {!selectedDay ? (
        <p className="text-muted text-sm">{t('forecast.empty')}</p>
      ) : (
        <div className="scroll-area max-h-[min(72vh,36rem)] space-y-4 overflow-y-auto pe-1">
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-4 ${tone}`}>
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/45 dark:bg-black/20">
              <Glyph className="size-7" />
            </span>
            <div className="min-w-0">
              <p className="text-3xl font-bold tabular-nums leading-none">
                {selectedHourRow ? `${selectedHourRow.temp}°` : `${selectedDay.high}°`}
              </p>
              <p className="mt-1 text-sm font-medium">{condition}</p>
              {selectedHourRow?.feelsLike != null && (
                <p className="mt-0.5 text-xs opacity-80">
                  {t('feelsLike', { temp: selectedHourRow.feelsLike })}
                  {selectedHourRow.hour != null
                    ? ` · ${t('forecast.hour', { hour: String(selectedHourRow.hour).padStart(2, '0') })}`
                    : ''}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t('forecast.high')} value={`${selectedDay.high}°`} />
            <Stat label={t('forecast.low')} value={`${selectedDay.low}°`} />
            <Stat
              icon={<DropletIcon className="size-3.5" />}
              value={t('weather.rainChance', { n: selectedHourRow?.rainChance ?? selectedDay.rainChance ?? 0 })}
            />
            <Stat
              icon={<WindIcon className="size-3.5" />}
              value={t('weather.windKmh', { n: selectedHourRow?.windKmh ?? selectedDay.windKmh ?? 0 })}
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {(selectedHourRow?.humidity ?? selectedDay.humidity) != null && (
              <span className="bg-tone-neutral text-tone-neutral-fg rounded-full px-2.5 py-1">
                {t('forecast.humidity', { n: selectedHourRow?.humidity ?? selectedDay.humidity })}
              </span>
            )}
            {selectedDay.uv != null && (
              <span className="bg-tone-neutral text-tone-neutral-fg inline-flex items-center gap-1 rounded-full px-2.5 py-1">
                <SunIcon className="size-3.5" />
                {t('forecast.uv', { n: selectedDay.uv })}
              </span>
            )}
          </div>

          <div>
            <p className="text-muted mb-2 text-xs font-semibold">{t('forecast.pickDay')}</p>
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {days.map((day) => {
                const DayGlyph = weatherGlyphFor({
                  temp: day.high,
                  icon: day.icon,
                  wet: day.wet,
                });
                const active = day.date === selectedDay.date;
                return (
                  <li key={day.date} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => chooseDay(day)}
                      aria-pressed={active}
                      className={`w-[4.6rem] rounded-2xl border px-2 py-2.5 text-center transition ${
                        active
                          ? 'border-ring bg-tone-indigo text-tone-indigo-fg ring-ring/30 ring-2'
                          : 'border-border bg-surface hover:bg-surface-hover text-foreground'
                      }`}
                    >
                      <span className="block text-[11px] font-semibold">
                        {dayLabel(day.date, today, t, locale)}
                      </span>
                      <DayGlyph className="mx-auto mt-1.5 size-5" />
                      <span className="mt-1.5 block text-sm font-semibold tabular-nums">
                        {day.high}°
                      </span>
                      <span className="text-muted block text-[11px] tabular-nums">{day.low}°</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {hours.length > 0 && (
            <div>
              <p className="text-muted mb-1 text-xs font-semibold">{t('forecast.pickHour')}</p>
              <div dir="ltr">
                <TempChart
                  hours={hours}
                  selectedHour={selectedHourRow?.hour}
                  onSelect={chooseHour}
                />
              </div>
              <ul className="mt-1 flex gap-1.5 overflow-x-auto pb-1" dir="ltr">
                {hours.filter((_, index) => index % 2 === 0 || hours.length < 10).map((row) => {
                  const active = selectedHourRow?.hour === row.hour;
                  return (
                    <li key={row.hour}>
                      <button
                        type="button"
                        onClick={() => chooseHour(row)}
                        className={`rounded-xl px-2 py-1.5 text-center text-[11px] tabular-nums transition ${
                          active
                            ? 'bg-tone-indigo text-tone-indigo-fg'
                            : 'text-muted hover:bg-surface-hover'
                        }`}
                      >
                        <span className="block font-semibold">
                          {String(row.hour).padStart(2, '0')}
                        </span>
                        <span className="block">{row.temp}°</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div className="border-border-subtle bg-tone-neutral/70 rounded-xl border px-3 py-2">
      {label && <p className="text-muted text-[11px] font-medium">{label}</p>}
      <p className="text-foreground mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {value}
      </p>
    </div>
  );
}
