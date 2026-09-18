import { localDateKey } from './time.js';

const ALL_DAY_WEIGHT = 2;
const MINUTES_PER_POINT = 30;
const TASK_POINT = 1;
const DUE_TODAY_EXTRA = 1;
const OVERDUE_EXTRA = 2;
const UNKNOWN_TIMED_MINUTES = 30;
const MAX_EVENT_MINUTES = 12 * 60;

function eventMinutes(event) {
  if (event?.allDay) return 0;
  const start = Date.parse(event?.start);
  const end = Date.parse(event?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return UNKNOWN_TIMED_MINUTES;
  }
  return Math.min(MAX_EVENT_MINUTES, Math.round((end - start) / 60000));
}

function taskDueKey(task) {
  return task?.due ? String(task.due).slice(0, 10) : null;
}

/**
 * How loaded today looks, from calendar density plus the open-task pile.
 * Used to steer the DailyTip — packed days get time-management, light days
 * get deep-work or rest, never the other way around.
 */
export function measureDayLoad({ events = [], tasks = [], timeZone, now = new Date() } = {}) {
  const today = localDateKey(timeZone, now);
  const list = Array.isArray(events) ? events : [];
  const openTasks = Array.isArray(tasks) ? tasks : [];

  let timedMinutes = 0;
  let allDayCount = 0;
  for (const event of list) {
    if (event?.allDay) allDayCount += 1;
    else timedMinutes += eventMinutes(event);
  }

  let dueToday = 0;
  let overdue = 0;
  for (const task of openTasks) {
    const due = taskDueKey(task);
    if (!due) continue;
    if (due === today) dueToday += 1;
    else if (due < today) overdue += 1;
  }

  const score =
    list.length +
    allDayCount * ALL_DAY_WEIGHT +
    timedMinutes / MINUTES_PER_POINT +
    openTasks.length * TASK_POINT +
    dueToday * DUE_TODAY_EXTRA +
    overdue * OVERDUE_EXTRA;

  let level = 'light';
  if (score >= 14) level = 'packed';
  else if (score >= 6) level = 'moderate';

  return {
    level,
    score: Math.round(score * 10) / 10,
    eventCount: list.length,
    eventMinutes: timedMinutes,
    allDayCount,
    taskCount: openTasks.length,
    dueToday,
    overdue,
  };
}

const TIPS = {
  Hebrew: {
    packed:
      'היום עמוס — קבצו פגישות דומות, השאירו מרווח קצר ביניהן, וסמנו משימה אחת שחייבת להסתיים.',
    moderate: 'יש לכם יום מאוזן — התחילו במשימה החשובה ביותר לפני הפגישה הראשונה.',
    light: 'היומן רגוע — זה יום מצוין לעבודה עמוקה, או למנוחה מודעת בלי להרגיש אשמה.',
  },
  English: {
    packed:
      'It is a packed day — batch similar meetings, leave a short buffer between them, and pick one task that must ship.',
    moderate: 'A balanced day — start with the most important task before the first meeting.',
    light: 'The calendar is light — a good day for deep work, or for genuine rest without guilt.',
  },
};

export function composeFallbackTip(load, language) {
  const pack = String(language || '').toLowerCase() === 'english' ? TIPS.English : TIPS.Hebrew;
  return pack[load?.level] || pack.moderate;
}

export function dayLoadGuidance(level) {
  if (level === 'packed') {
    return 'high-energy time-management: batching, buffers between meetings, or protecting one must-finish task.';
  }
  if (level === 'light') {
    return 'deep work, one meaningful push, or genuine rest — not a fake busy-day pep talk.';
  }
  return 'a practical, encouraging productivity note that fits a normal, balanced day.';
}
