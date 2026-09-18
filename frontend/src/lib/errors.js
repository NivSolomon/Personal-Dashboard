/**
 * Every string here is shown to people who are not developers. Never pass
 * through API bodies, HTTP statuses, or Google error text.
 */

import { loginMessage, tr } from './i18n.jsx';

export function loginErrorText(code) {
  return loginMessage(code);
}

/** What kind of failure this is, without exposing the original message. */
export function errorKind(error) {
  if (!error) return 'unavailable';
  if (error.status === 429) return 'busy';
  const message = String(error.message || '');
  if (error.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(message)) {
    return 'offline';
  }
  return 'unavailable';
}

export function sessionErrorCopy(kind) {
  if (kind === 'offline') {
    return {
      title: tr('error.offline.title'),
      body: tr('error.offline.body'),
    };
  }
  return {
    title: tr('error.session.title'),
    body: tr('error.session.body'),
  };
}

export function summaryErrorText(kind) {
  if (kind === 'offline') return tr('error.summary.offline');
  if (kind === 'busy') return tr('error.summary.busy');
  return tr('error.summary.generic');
}

export function summaryThrottleText(seconds) {
  return tr('error.summary.throttle', { seconds });
}

/**
 * Copy for a dashboard card. `reconnect` means the person needs to approve
 * access in Google again — a retry will not help.
 */
export function cardErrorCopy(error) {
  if (!error) return null;
  const source = error.source || 'all';
  if (error.code === 'insufficient_scope') {
    const key = `error.scope.${source}`;
    const text = tr(key);
    return {
      text: text === key ? tr('error.scope.all') : text,
      reconnect: true,
    };
  }
  if (error.code === 'offline') {
    return { text: tr('error.card.offline') };
  }
  const key = `error.card.${source}`;
  const text = tr(key);
  return { text: text === key ? tr('error.card.all') : text };
}

export function watchlistErrorText(code) {
  const key = `error.watch.${code}`;
  const text = tr(key);
  return text === key ? tr('error.save') : text;
}

export function onboardingErrorText(code) {
  const key = `error.onboard.${code}`;
  const text = tr(key);
  return text === key ? tr('error.save') : text;
}

export function formIssueText(code) {
  if (code === 'required') return tr('form.required');
  if (code === 'too_long') return tr('form.too_long');
  if (code === 'invalid') return tr('form.date_invalid');
  if (code === 'before_start') return tr('form.before_start');
  if (code === 'no_room') return tr('form.no_room');
  if (code === 'time_without_due') return tr('form.time_without_due');
  if (code === 'pair') return tr('form.coords_pair');
  const key = `form.${code}`;
  const text = tr(key);
  return text === key ? tr('form.required') : text;
}

export function eventIssueText(field, code) {
  if (field === 'title' && code === 'required') return tr('form.title_required');
  if (field === 'startTime' || field === 'endTime' || field === 'dueTime') {
    if (code === 'invalid') return tr('form.time_invalid');
  }
  if (field === 'weeklyGoalKm') return tr('form.goal_invalid');
  if (field === 'calorieGoal') return tr('form.calorie_invalid');
  if (field === 'coords' && code === 'invalid') return tr('form.coords_invalid');
  if (field === 'home' || field === 'work') return tr('form.place_required');
  return formIssueText(code);
}
