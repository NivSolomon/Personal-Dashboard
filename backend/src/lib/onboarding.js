import { WIDGET_IDS, normalizeLayout } from './widgets.js';

export const PRIMARY_FOCUSES = ['academic', 'software', 'productivity'];
export const HOBBIES = ['running', 'mountain_biking', 'drone'];
export const DAILY_ROUTINES = ['outdoor', 'briefing', 'work'];
export const CUSTOM_PROMPT_MAX = 2000;

const ROUTINE_HOUR = {
  outdoor: 6,
  briefing: 7,
  work: 8,
};

/**
 * Widget order and visibility from the three onboarding answers.
 * Unknown catalog ids are ignored by normalizeLayout, so a later tile
 * still appears with its default rather than crashing an old payload.
 */
export function layoutFromOnboarding({ primaryFocus, hobbies = [], dailyRoutine }) {
  const enabled = new Set(['summary', 'tip', 'timeline', 'tasks', 'emails']);
  const hobbySet = new Set(hobbies);

  if (primaryFocus === 'academic') enabled.add('notion');

  if (hobbySet.has('running') || hobbySet.has('mountain_biking')) {
    enabled.add('weather');
    enabled.add('activity');
  }
  if (hobbySet.has('drone') || dailyRoutine === 'outdoor') enabled.add('weather');

  const rest = WIDGET_IDS.filter((id) => id !== 'summary');
  let order = ['summary', ...rest];

  if (dailyRoutine === 'outdoor') {
    order = uniqueOrder(['summary', 'weather', 'activity', ...rest]);
  } else if (dailyRoutine === 'work') {
    order = uniqueOrder(['summary', 'timeline', 'emails', 'tasks', 'ask', 'notion', ...rest]);
  } else {
    order = uniqueOrder(['summary', 'tip', 'ask', 'weather', 'timeline', ...rest]);
  }

  return normalizeLayout({
    widgets: order.map((id) => ({ id, enabled: enabled.has(id) })),
  });
}

/**
 * First-time accounts get the tailored layout. Anyone who already arranged
 * tiles keeps their order; answers only turn on extra widgets, never off.
 */
export function applyOnboardingLayout(savedLayout, preferences) {
  const suggested = layoutFromOnboarding(preferences);
  const incoming = Array.isArray(savedLayout?.widgets) ? savedLayout.widgets : [];
  if (incoming.length === 0) return suggested;

  const current = normalizeLayout(savedLayout);
  const turnOn = new Set(suggested.widgets.filter((widget) => widget.enabled).map((widget) => widget.id));
  return {
    widgets: current.widgets.map((widget) => ({
      id: widget.id,
      enabled: widget.enabled || turnOn.has(widget.id),
    })),
  };
}

function uniqueOrder(ids) {
  const seen = new Set();
  return ids.filter((id) => {
    if (!WIDGET_IDS.includes(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function summaryHourFromRoutine(dailyRoutine) {
  return ROUTINE_HOUR[dailyRoutine] ?? null;
}

export function suggestedCustomPrompt({ primaryFocus, hobbies = [], dailyRoutine }, language) {
  const he = String(language || '').toLowerCase() !== 'english';
  const parts = [];

  if (primaryFocus === 'academic') {
    parts.push(
      he
        ? 'תעדף דדליינים אקדמיים ומשימות לימוד.'
        : 'Prioritize academic deadlines and study tasks.',
    );
  } else if (primaryFocus === 'software') {
    parts.push(
      he
        ? 'סכם כמו מנהל פרויקט בפיתוח תוכנה, ותעדף דדליינים הנדסיים.'
        : 'Summarize like a software project manager and prioritize engineering deadlines.',
    );
  } else {
    parts.push(
      he
        ? 'שמור על סיכום קצר ומעשי לתחילת היום.'
        : 'Keep the briefing short and practical for the start of the day.',
    );
  }

  if (hobbies.includes('running')) {
    parts.push(he ? 'בדוק אם מזג האוויר מתאים לריצה.' : 'Check if the weather is good for running.');
  }
  if (hobbies.includes('mountain_biking')) {
    parts.push(
      he ? 'ציין אם כדאי לצאת לרכיבת שטח.' : 'Note whether it is a good day for a mountain bike ride.',
    );
  }
  if (hobbies.includes('drone')) {
    parts.push(
      he
        ? 'ציין אם התנאים בחוץ מתאימים להטסת רחפן (רוח, גשם, ראות).'
        : 'Say whether outdoor conditions suit drone flying (wind, rain, visibility).',
    );
  }

  if (dailyRoutine === 'outdoor') {
    parts.push(
      he
        ? 'פתח באימון בחוץ, ואחר כך עבור ליומן ולמשימות.'
        : 'Lead with outdoor training, then the calendar and tasks.',
    );
  } else if (dailyRoutine === 'work') {
    parts.push(
      he
        ? 'פתח ביומן ובדואר, ורק אחר כך במזג האוויר.'
        : 'Lead with calendar and mail, then weather.',
    );
  }

  return parts.join(' ');
}

export function parseOnboarding(body = {}) {
  const primaryFocus = String(body.primaryFocus || '').trim();
  if (!PRIMARY_FOCUSES.includes(primaryFocus)) return { error: 'invalid_focus' };

  const raw = Array.isArray(body.hobbies) ? body.hobbies : [];
  const hobbies = [...new Set(raw.map((item) => String(item).trim()).filter((item) => HOBBIES.includes(item)))];

  const dailyRoutine = String(body.dailyRoutine || '').trim();
  if (!DAILY_ROUTINES.includes(dailyRoutine)) return { error: 'invalid_routine' };

  return { value: { primaryFocus, hobbies, dailyRoutine } };
}

export function parseCustomPrompt(body = {}) {
  const text = String(body.customAIPrompt ?? body.prompt ?? '');
  if (text.length > CUSTOM_PROMPT_MAX) return { error: 'invalid_prompt' };
  return { value: text.trim() };
}
