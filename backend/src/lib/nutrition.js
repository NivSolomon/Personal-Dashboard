import { localDateKey } from './time.js';

export const DEFAULT_CALORIE_GOAL = 2000;
export const GOAL_MAX_KCAL = 10000;
export const LOG_MAX_ENTRIES = 80;
export const NAME_MAX = 200;

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

export function emptyLog(date) {
  return { date, entries: [] };
}

export function calorieGoalOf(settings) {
  const goal = Number(settings?.calorieGoal);
  if (Number.isFinite(goal) && goal > 0) return Math.min(GOAL_MAX_KCAL, Math.round(goal));
  return DEFAULT_CALORIE_GOAL;
}

export function logForDate(log, date) {
  if (!log || log.date !== date || !Array.isArray(log.entries)) return emptyLog(date);
  return { date, entries: log.entries };
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
  const current = logForDate(log, date);
  const entries = [entry, ...current.entries].slice(0, LOG_MAX_ENTRIES);
  return { date, entries };
}

export function removeEntryFromLog(log, entryId, date) {
  const current = logForDate(log, date);
  return {
    date,
    entries: current.entries.filter((item) => item.id !== entryId),
  };
}
