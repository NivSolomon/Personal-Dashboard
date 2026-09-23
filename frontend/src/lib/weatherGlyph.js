import {
  BoltIcon,
  CloudIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  MoonIcon,
  SunIcon,
} from '../components/icons.jsx';

function isNight(code) {
  return String(code || '').endsWith('n');
}

export function conditionKind(code) {
  return String(code || '').slice(0, 2);
}

/**
 * Rain/snow/storm win over temperature. Otherwise hot → sun, cold → snow or
 * overcast, and mild clear/cloudy follows the OpenWeather code.
 */
export function weatherGlyphFor({ temp, icon, wet }) {
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

export function conditionKeyFor({ icon, weatherCode, wet }) {
  const hasCode = weatherCode != null && weatherCode !== '';
  const code = Number(weatherCode);
  if (hasCode && Number.isFinite(code)) {
    if (code === 0) return 'clear';
    if (code === 1) return 'mainlyClear';
    if (code === 2) return 'partlyCloudy';
    if (code === 3) return 'overcast';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if (code >= 61 && code <= 67) return 'rain';
    if (code >= 71 && code <= 77) return 'snow';
    if (code >= 80 && code <= 82) return 'showers';
    if (code >= 85 && code <= 86) return 'snow';
    if (code >= 95) return 'thunder';
  }

  const kind = conditionKind(icon);
  if (kind === '01') return 'clear';
  if (kind === '02') return 'partlyCloudy';
  if (kind === '03' || kind === '04') return 'overcast';
  if (kind === '09') return 'showers';
  if (kind === '10' || wet) return 'rain';
  if (kind === '11') return 'thunder';
  if (kind === '13') return 'snow';
  if (kind === '50') return 'fog';
  return 'overcast';
}

export function paletteFor({ temp, icon, wet }) {
  const kind = conditionKind(icon);
  const rainy = Boolean(wet) || ['09', '10', '11'].includes(kind);
  if (rainy) return 'blue';
  if (typeof temp === 'number' && temp >= 27) return 'amber';
  if (typeof temp === 'number' && temp <= 12) return 'indigo';
  return 'blue';
}
