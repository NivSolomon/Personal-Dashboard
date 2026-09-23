import { localDateKey, shiftDateKey } from './time.js';

export const DEFAULT_CALORIE_GOAL = 2000;
export const GOAL_MAX_KCAL = 10000;
export const LOG_MAX_ENTRIES = 80;
export const NAME_MAX = 200;
export const HISTORY_DAYS = 21;
export const WEEK_DAYS = 7;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundKcal(value) {
  return Math.max(0, Math.round(num(value)));
}

function roundGrams(value) {
  return Math.max(0, Math.round(num(value) * 10) / 10);
}

function isDateKey(value) {
  return DATE_KEY.test(String(value || ''));
}

export function emptyLog(date) {
  return { date, entries: [] };
}

export function calorieGoalOf(settings) {
  const goal = Number(settings?.calorieGoal);
  if (Number.isFinite(goal) && goal > 0) return Math.min(GOAL_MAX_KCAL, Math.round(goal));
  return DEFAULT_CALORIE_GOAL;
}

/** Merge legacy `{ date, entries }` logs with the `{ days: { [date]: entries } }` map. */
export function daysOfLog(log) {
  const days = {};
  if (log?.days && typeof log.days === 'object' && !Array.isArray(log.days)) {
    for (const [date, entries] of Object.entries(log.days)) {
      if (isDateKey(date) && Array.isArray(entries)) days[date] = entries;
    }
  }
  if (isDateKey(log?.date) && Array.isArray(log.entries)) {
    days[log.date] = log.entries;
  }
  return days;
}

function pruneDays(days, today) {
  const keepFrom = shiftDateKey(today, -(HISTORY_DAYS - 1));
  const keep = {};
  for (const [date, entries] of Object.entries(days)) {
    if (date >= keepFrom && date <= today) keep[date] = entries;
  }
  return keep;
}

export function packLog(days, today) {
  const pruned = pruneDays(days, today);
  return {
    date: today,
    entries: pruned[today] || [],
    days: pruned,
  };
}

export function logForDate(log, date) {
  const entries = daysOfLog(log)[date];
  if (!Array.isArray(entries)) return emptyLog(date);
  return { date, entries };
}

export function totalsOf(entries) {
  return (entries || []).reduce(
    (acc, entry) => ({
      calories: acc.calories + roundKcal(entry.calories),
      protein: acc.protein + roundGrams(entry.protein),
      carbs: acc.carbs + roundGrams(entry.carbs),
      fat: acc.fat + roundGrams(entry.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function publicEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    source: entry.source,
    calories: roundKcal(entry.calories),
    protein: roundGrams(entry.protein),
    carbs: roundGrams(entry.carbs),
    fat: roundGrams(entry.fat),
    servingSize: entry.servingSize || null,
    barcode: entry.barcode || null,
    addedAt: entry.addedAt,
  };
}

function foldName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function weekDays(log, today) {
  const stored = daysOfLog(log);
  const days = [];
  for (let offset = WEEK_DAYS - 1; offset >= 0; offset -= 1) {
    const date = shiftDateKey(today, -offset);
    const entries = stored[date] || [];
    const totals = totalsOf(entries);
    days.push({
      date,
      calories: roundKcal(totals.calories),
      protein: roundGrams(totals.protein),
      carbs: roundGrams(totals.carbs),
      fat: roundGrams(totals.fat),
      meals: entries.length,
    });
  }
  return days;
}

function weekStats(log, today) {
  const stored = daysOfLog(log);
  const counts = new Map();
  let richest = null;

  for (let offset = WEEK_DAYS - 1; offset >= 0; offset -= 1) {
    const date = shiftDateKey(today, -offset);
    for (const entry of stored[date] || []) {
      const name = String(entry.name || '').trim();
      const key = foldName(name);
        if (key) {
          const row = counts.get(key) || { name, count: 0, calories: 0 };
          row.count += 1;
          row.calories += roundKcal(entry.calories);
          if (name && (row.name === row.name.toLowerCase() || name.length > row.name.length)) {
            row.name = name;
          }
          counts.set(key, row);
        }
      const protein = roundGrams(entry.protein);
      if (protein > 0 && (!richest || protein > richest.protein)) {
        richest = {
          name: name || '—',
          protein,
          calories: roundKcal(entry.calories),
          date,
        };
      }
    }
  }

  const favorite = [...counts.values()].sort((a, b) => b.count - a.count || b.calories - a.calories)[0] || null;

  return {
    favorite: favorite
      ? { name: favorite.name, count: favorite.count, calories: roundKcal(favorite.calories) }
      : null,
    richestProtein: richest,
  };
}

export function weekNutrition(user, today = localDateKey(user.settings?.timeZone)) {
  const days = weekDays(user.nutritionLog, today);
  const totalCalories = days.reduce((sum, day) => sum + day.calories, 0);
  const logged = days.filter((day) => day.meals > 0).length;
  const stats = weekStats(user.nutritionLog, today);
  return {
    days,
    totalCalories: roundKcal(totalCalories),
    avgCalories: roundKcal(logged ? totalCalories / logged : 0),
    ...stats,
  };
}

export function nutritionSummary(user) {
  const date = localDateKey(user.settings?.timeZone);
  const log = logForDate(user.nutritionLog, date);
  const totals = totalsOf(log.entries);
  const goal = calorieGoalOf(user.settings);
  return {
    date,
    goal,
    entries: log.entries.map(publicEntry),
    consumed: roundKcal(totals.calories),
    protein: roundGrams(totals.protein),
    carbs: roundGrams(totals.carbs),
    fat: roundGrams(totals.fat),
    goalPercent: goal > 0 ? Math.round((totals.calories / goal) * 100) : 0,
    week: weekNutrition(user, date),
  };
}

const SOURCES = new Set(['barcode', 'search', 'photo', 'text']);

export function parseLogEntry(body = {}) {
  const name = String(body.name || '').trim().slice(0, NAME_MAX);
  if (!name) return { error: 'invalid_name' };
  const calories = roundKcal(body.calories ?? body.estimatedCalories);
  const protein = roundGrams(body.protein);
  const carbs = roundGrams(body.carbs);
  const fat = roundGrams(body.fat);
  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) {
    return { error: 'invalid_macros' };
  }
  const source = SOURCES.has(body.source) ? body.source : 'search';
  return {
    value: {
      id: crypto.randomUUID(),
      name,
      source,
      calories,
      protein,
      carbs,
      fat,
      servingSize: String(body.servingSize || '').trim().slice(0, 80) || null,
      barcode: String(body.barcode || '').replace(/\D/g, '').slice(0, 14) || null,
      addedAt: new Date().toISOString(),
    },
  };
}

export function addEntryToLog(log, entry, date) {
  const days = daysOfLog(log);
  days[date] = [entry, ...(days[date] || [])].slice(0, LOG_MAX_ENTRIES);
  return packLog(days, date);
}

export function removeEntryFromLog(log, entryId, date) {
  const days = daysOfLog(log);
  days[date] = (days[date] || []).filter((item) => item.id !== entryId);
  return packLog(days, date);
}
