import { config } from '../config.js';

// One Call 3.0 needs a paid subscription; these two are on the free tier.
const CURRENT_URL = 'https://api.openweathermap.org/data/2.5/weather';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';

/** Rain, snow, thunderstorm and drizzle all sit below 700 in OpenWeather's ids. */
function isWet(slot) {
  const id = slot.weather?.[0]?.id ?? 0;
  return id < 700 || (slot.pop ?? 0) >= 0.4;
}

async function get(url, { lat, lon }) {
  const query = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: config.weather.apiKey,
    units: 'metric',
    lang: 'he',
  });
  const response = await fetch(`${url}?${query}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenWeather ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

function heatFelt({ temp, feelsLike }) {
  const air = temp ?? 0;
  const felt = feelsLike ?? air;
  return Math.max(air, felt);
}

/**
 * Score a slot for outdoor endurance sport. Comfort peaks around 13°C — typical
 * run weather — and heat is penalised harder than a "nice day outside" would be.
 * 32°C with a light breeze is still a skip, not a recommendation.
 */
function scoreKind(conditions, kind) {
  const heat = heatFelt(conditions);
  const windKmh = conditions.windKmh ?? 0;
  const humidity = conditions.humidity;
  const rainChance = conditions.rainChance ?? 0;

  let value = 100 - Math.abs(heat - 13) * 4.5;
  if (heat >= 26) value -= (heat - 26) * 5;
  if (heat >= 31) value -= (heat - 31) * 8;
  if (humidity != null && heat >= 22) {
    value -= Math.max(0, humidity - 50) * 0.35;
  }

  const windTol = kind === 'ride' ? 14 : 22;
  value -= Math.max(0, windKmh - windTol) * (kind === 'ride' ? 2.2 : 1.2);

  if (conditions.wet || rainChance >= 50) value -= 50;
  else if (rainChance >= 30) value -= 22;

  if (kind === 'run' && heat >= 8 && heat <= 16) value += 6;
  if (kind === 'ride' && heat >= 16 && heat <= 24 && windKmh < 18) value += 4;

  return Math.round(Math.max(0, Math.min(100, value)));
}

function sportFlags(conditions) {
  const heat = heatFelt(conditions);
  const flags = [];
  if (conditions.wet || (conditions.rainChance ?? 0) >= 40) flags.push('rain');
  if (heat >= 27) flags.push('heat');
  else if (heat <= 6) flags.push('cold');
  if ((conditions.windKmh ?? 0) >= 28) flags.push('wind');
  if (conditions.humidity != null && conditions.humidity >= 70 && heat >= 22) {
    flags.push('humid');
  }
  return flags;
}

function assessSport(conditions) {
  const run = scoreKind(conditions, 'run');
  const ride = scoreKind(conditions, 'ride');
  const outdoor = Math.max(run, ride);
  const flags = sportFlags(conditions);
  const heat = heatFelt(conditions);

  let verdict = 'go';
  if (outdoor < 42 || flags.includes('rain') || heat >= 31) verdict = 'skip';
  else if (outdoor < 68 || flags.length > 0) verdict = 'caution';

  let bestFor = 'run';
  if (verdict === 'skip') bestFor = 'indoor';
  else if (ride >= run + 6) bestFor = 'ride';

  return {
    score: outdoor,
    run,
    ride,
    verdict,
    bestFor,
    flags,
  };
}

function shapeSlot(slot, timeZone) {
  const at = new Date(slot.dt * 1000);
  const conditions = {
    temp: Math.round(slot.main?.temp ?? 0),
    feelsLike: Math.round(slot.main?.feels_like ?? 0),
    windKmh: Math.round((slot.wind?.speed ?? 0) * 3.6),
    humidity: slot.main?.humidity ?? null,
    rainChance: Math.round((slot.pop ?? 0) * 100),
    wet: isWet(slot),
  };
  const sport = assessSport(conditions);
  return {
    at: at.toISOString(),
    hour: Number(
      new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(at),
    ),
    ...conditions,
    description: slot.weather?.[0]?.description || '',
    icon: slot.weather?.[0]?.icon || null,
    score: sport.score,
    sport,
  };
}

function hourInZone(timeZone) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(new Date()),
  );
}

function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);
}

/** Map Open-Meteo WMO codes onto the OpenWeather icon ids the UI already knows. */
function wmoToIcon(code, night = false) {
  const n = night ? 'n' : 'd';
  const id = Number(code) || 0;
  if (id === 0) return `01${n}`;
  if (id === 1 || id === 2) return `02${n}`;
  if (id === 3) return `04${n}`;
  if (id === 45 || id === 48) return `50${n}`;
  if (id >= 51 && id <= 57) return `09${n}`;
  if (id >= 61 && id <= 67) return `10${n}`;
  if (id >= 71 && id <= 77) return `13${n}`;
  if (id >= 80 && id <= 82) return `09${n}`;
  if (id >= 85 && id <= 86) return `13${n}`;
  if (id >= 95) return `11${n}`;
  return `03${n}`;
}

function isNightHour(hour) {
  return hour < 6 || hour >= 19;
}

function hourFromIso(value) {
  const match = String(value || '').match(/T(\d{2})/);
  return match ? Number(match[1]) : 0;
}

function weekFromOwm(list, timeZone) {
  const byDay = new Map();
  for (const raw of list || []) {
    const slot = shapeSlot(raw, timeZone);
    const date = dayKey(new Date(slot.at), timeZone);
    const hours = byDay.get(date) || [];
    hours.push({
      hour: slot.hour,
      temp: slot.temp,
      feelsLike: slot.feelsLike,
      rainChance: slot.rainChance,
      windKmh: slot.windKmh,
      humidity: slot.humidity,
      icon: slot.icon,
      wet: slot.wet,
      weatherCode: null,
    });
    byDay.set(date, hours);
  }

  return [...byDay.entries()].map(([date, hours]) => {
    const midday = hours.find((row) => row.hour >= 12) || hours[Math.floor(hours.length / 2)] || hours[0];
    return {
      date,
      high: Math.max(...hours.map((row) => row.temp)),
      low: Math.min(...hours.map((row) => row.temp)),
      rainChance: Math.max(...hours.map((row) => row.rainChance || 0)),
      windKmh: Math.max(...hours.map((row) => row.windKmh || 0)),
      humidity: Math.round(
        hours.reduce((sum, row) => sum + (row.humidity || 0), 0) / Math.max(hours.length, 1),
      ),
      uv: null,
      wet: hours.some((row) => row.wet),
      icon: midday?.icon || null,
      weatherCode: null,
      hours,
    };
  });
}

function weekFromOpenMeteo(payload) {
  const daily = payload?.daily;
  const hourly = payload?.hourly;
  if (!daily?.time?.length) return [];

  const hoursByDay = new Map();
  (hourly?.time || []).forEach((stamp, index) => {
    const date = String(stamp).slice(0, 10);
    const hour = hourFromIso(stamp);
    const code = hourly.weather_code?.[index];
    const rainChance = Math.round(hourly.precipitation_probability?.[index] ?? 0);
    const row = {
      hour,
      temp: Math.round(hourly.temperature_2m?.[index] ?? 0),
      feelsLike: Math.round(hourly.apparent_temperature?.[index] ?? hourly.temperature_2m?.[index] ?? 0),
      rainChance,
      windKmh: Math.round(hourly.wind_speed_10m?.[index] ?? 0),
      humidity: hourly.relative_humidity_2m?.[index] ?? null,
      icon: wmoToIcon(code, isNightHour(hour)),
      wet: rainChance >= 40 || (Number(code) >= 51 && Number(code) < 90) || Number(code) >= 95,
      weatherCode: Number(code) || 0,
    };
    const list = hoursByDay.get(date) || [];
    list.push(row);
    hoursByDay.set(date, list);
  });

  return daily.time.map((date, index) => {
    const hours = hoursByDay.get(date) || [];
    const code = daily.weather_code?.[index];
    return {
      date,
      high: Math.round(daily.temperature_2m_max?.[index] ?? 0),
      low: Math.round(daily.temperature_2m_min?.[index] ?? 0),
      rainChance: Math.round(daily.precipitation_probability_max?.[index] ?? 0),
      windKmh: Math.round(daily.wind_speed_10m_max?.[index] ?? 0),
      humidity:
        hours.length > 0
          ? Math.round(hours.reduce((sum, row) => sum + (row.humidity || 0), 0) / hours.length)
          : null,
      uv: daily.uv_index_max?.[index] != null ? Math.round(daily.uv_index_max[index]) : null,
      wet: (daily.precipitation_probability_max?.[index] ?? 0) >= 40 || Number(code) >= 51,
      icon: wmoToIcon(code, false),
      weatherCode: Number(code) || 0,
      hours,
    };
  });
}

async function fetchOpenMeteoWeek({ lat, lon, timeZone }) {
  const query = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: timeZone || 'auto',
    forecast_days: '7',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
    hourly:
      'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,relative_humidity_2m',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status}`);
  }
  return weekFromOpenMeteo(await response.json());
}

/**
 * Today's conditions scored for a run or a ride, plus the daylight slots that
 * are actually suitable for training outdoors. `week` is a 7-day forecast for
 * the header popup (Open-Meteo, with the 5-day OpenWeather list as fallback).
 */
export async function fetchWeather({ lat, lon, timeZone }) {
  if (lat === null || lon === null || lat === undefined || lon === undefined) return null;

  const at = { lat, lon };
  const [current, forecast, openMeteoWeek] = await Promise.all([
    get(CURRENT_URL, at),
    get(FORECAST_URL, at),
    fetchOpenMeteoWeek({ lat, lon, timeZone }).catch(() => null),
  ]);

  const today = dayKey(new Date(), timeZone);
  const forecastSlots = (forecast.list || []).map((slot) => shapeSlot(slot, timeZone));
  const slots = forecastSlots.filter((slot) => dayKey(new Date(slot.at), timeZone) === today);

  const daylight = slots.filter((slot) => slot.hour >= 6 && slot.hour <= 21);
  const nowHour = hourInZone(timeZone);
  const remaining = daylight.filter((slot) => slot.hour >= nowHour);

  const suitable = remaining
    .filter((slot) => slot.sport.verdict !== 'skip')
    .sort((a, b) => b.sport.score - a.sport.score)
    .slice(0, 2)
    .sort((a, b) => a.hour - b.hour);

  const coolest = [...remaining].sort((a, b) => a.temp - b.temp).slice(0, 2);

  const temps = slots.map((slot) => slot.temp);
  const currentConditions = {
    temp: Math.round(current.main?.temp ?? 0),
    feelsLike: Math.round(current.main?.feels_like ?? 0),
    windKmh: Math.round((current.wind?.speed ?? 0) * 3.6),
    humidity: current.main?.humidity ?? null,
    rainChance: 0,
    wet: isWet(current),
  };

  const week =
    openMeteoWeek?.length > 0 ? openMeteoWeek : weekFromOwm(forecast.list || [], timeZone);

  return {
    location: current.name || null,
    current: {
      ...currentConditions,
      description: current.weather?.[0]?.description || '',
      icon: current.weather?.[0]?.icon || null,
      sport: assessSport(currentConditions),
    },
    high: temps.length > 0 ? Math.max(...temps) : null,
    low: temps.length > 0 ? Math.min(...temps) : null,
    rainExpected: slots.some((slot) => slot.wet),
    slots: daylight,
    week,
    // Only hours that are actually ok to train in. Empty means stay inside.
    bestWindows: suitable,
    // Coolest remaining hours, for context when nothing is truly suitable.
    coolestWindows: coolest,
  };
}
