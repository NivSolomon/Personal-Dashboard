import { config, isOpenAiConfigured } from '../config.js';
import { getOpenAiClient } from '../ai/client.js';
import { parseJsonObject } from '../lib/json.js';
import { catalogFromDashboard, filterSources, sourceId, widgetOfSource } from '../lib/sources.js';
import { aroundDaysRange, formatLongDate, formatTime, localDateKey, shiftDateKey } from '../lib/time.js';
import { normalizeLanguage } from '../lib/validate.js';
import { getAuthedClient } from '../google/client.js';
import { fetchEventsInRange } from '../google/calendar.js';
import { fetchImportantEmails } from '../google/gmail.js';
import { listBriefingLogs } from '../store/db.js';
import { collectDashboardData } from './dashboard.js';

const EMBED_MODEL = 'text-embedding-3-small';
const TOP_CHUNKS = 10;
const QUESTION_MAX = 500;
const PAST_DAYS = 7;
const FUTURE_DAYS = 7;

function eventDateKey(event, timeZone) {
  if (!event?.start) return '';
  if (event.allDay) return String(event.start).slice(0, 10);
  const date = new Date(event.start);
  if (Number.isNaN(date.getTime())) return String(event.start).slice(0, 10);
  return localDateKey(timeZone, date);
}

function relativeLabel(dateKey, todayKey) {
  if (!dateKey || !todayKey) return '';
  if (dateKey === todayKey) return 'today היום';
  if (dateKey === shiftDateKey(todayKey, 1)) return 'tomorrow מחר למחר';
  if (dateKey === shiftDateKey(todayKey, -1)) return 'yesterday אתמול';
  return '';
}

function weekdayOf(dateKey, timeZone) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function eventLine(event, timeZone, todayKey) {
  const dateKey = eventDateKey(event, timeZone);
  const when = event.allDay
    ? 'all day'
    : `${formatTime(event.start, timeZone) || ''}–${formatTime(event.end, timeZone) || ''}`;
  const relative = relativeLabel(dateKey, todayKey);
  const weekday = weekdayOf(dateKey, timeZone);
  return {
    dateKey,
    text: [dateKey, weekday, relative, when, event.title, event.location || '']
      .filter(Boolean)
      .join(' '),
  };
}

function scheduleQuestion(question) {
  return /מחר|היום|השבוע|לו.?ז|יומן|לוח|פגיש|שיעור|tomorrow|today|schedule|calendar|week|agenda|meeting|class/i.test(
    String(question || ''),
  );
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);
}

function keywordScore(question, chunk) {
  const terms = tokenize(question);
  if (terms.length === 0) return 0;
  const hay = `${chunk.title || ''} ${chunk.text || ''}`.toLowerCase();
  let hits = 0;
  for (const term of terms) if (hay.includes(term)) hits += 1;
  return hits / terms.length;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

function compact(text, limit = 400) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function pushChunk(chunks, seen, { id, title, text, date }) {
  if (!id || seen.has(id)) return;
  const body = compact(text);
  const label = String(title || '').trim().slice(0, 120);
  if (!body && !label) return;
  seen.add(id);
  chunks.push({
    sourceId: id,
    title: label,
    text: body,
    date: date || '',
    widget: widgetOfSource(id),
  });
}

function corpusFromDashboard(data, chunks, seen, timeZone, todayKey) {
  for (const event of data.events || []) {
    const { dateKey, text } = eventLine(event, timeZone, todayKey);
    pushChunk(chunks, seen, {
      id: sourceId('event', event.id),
      title: event.title,
      date: dateKey,
      text,
    });
  }
  for (const task of data.tasks || []) {
    pushChunk(chunks, seen, {
      id: sourceId('task', task.id),
      title: task.title,
      date: task.due ? String(task.due).slice(0, 10) : '',
      text: `${task.title}${task.due ? ` due ${String(task.due).slice(0, 10)}` : ''} ${task.notes || ''}`,
    });
  }
  for (const email of data.emails || []) {
    pushChunk(chunks, seen, {
      id: sourceId('email', email.id),
      title: email.subject,
      date: String(email.receivedAt || '').slice(0, 10),
      text: `${email.from?.name || ''}: ${email.subject}. ${email.snippet || ''}`,
    });
  }
  for (const item of data.notion || []) {
    pushChunk(chunks, seen, {
      id: sourceId('notion', item.id),
      title: item.title,
      date: item.due ? String(item.due).slice(0, 10) : '',
      text: `deadline ${item.due ? String(item.due).slice(0, 10) : ''} ${item.title}`,
    });
  }
  if (data.weather) {
    const windows = (data.weather.bestWindows || [])
      .map((slot) => `${String(slot.hour).padStart(2, '0')}:00`)
      .join(', ');
    pushChunk(chunks, seen, {
      id: 'weather',
      title: 'weather',
      text: `${data.weather.current?.temp}°C ${data.weather.current?.description || ''} windows ${windows || 'none'}`,
    });
  }
  if (data.activity) {
    pushChunk(chunks, seen, {
      id: 'activity',
      title: 'training',
      text: `${data.activity.count} activities ${data.activity.distanceKm} km ${data.activity.movingMinutes} min`,
    });
  }
  if (data.fx?.quotes?.length) {
    const home = data.fx.base || 'ILS';
    pushChunk(chunks, seen, {
      id: 'usd',
      title: `FX/${home}`,
      text: data.fx.quotes.map((row) => `1 ${row.code} = ${row.rate} ${home}`).join('; '),
    });
  }
  for (const item of data.watchlist?.items || []) {
    pushChunk(chunks, seen, {
      id: sourceId('watch', item.symbol),
      title: item.symbol,
      text: `${item.symbol} ${item.name || ''} ${item.quote?.price ?? ''} ${item.quote?.changePct ?? ''}%`,
    });
  }
  if (data.commute?.toWorkMinutes) {
    pushChunk(chunks, seen, {
      id: 'commute:work',
      title: 'commute to work',
      text: `drive to work about ${data.commute.toWorkMinutes} minutes`,
    });
  }
  if (data.commute?.toHomeMinutes) {
    pushChunk(chunks, seen, {
      id: 'commute:home',
      title: 'commute home',
      text: `drive home about ${data.commute.toHomeMinutes} minutes`,
    });
  }
}

async function rankChunks(question, chunks, logger) {
  if (chunks.length === 0) return [];
  const keyed = chunks.map((chunk, index) => ({
    ...chunk,
    keyword: keywordScore(question, chunk),
    index,
  }));

  if (!isOpenAiConfigured()) {
    return keyed
      .map((chunk) => ({
        ...chunk,
        score:
          chunk.keyword +
          (scheduleQuestion(question) && String(chunk.sourceId).startsWith('event:') ? 0.2 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
  }

  try {
    const inputs = [
      question,
      ...chunks.map((chunk) => compact(`${chunk.title || ''}. ${chunk.text || ''}`, 600)),
    ];
    const response = await getOpenAiClient().embeddings.create({
      model: EMBED_MODEL,
      input: inputs,
    });
    const vectors = [...response.data]
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding);
    const [qVec, ...cVecs] = vectors;
    return keyed
      .map((chunk, i) => {
        const semantic = cosine(qVec, cVecs[i]) * 0.7 + chunk.keyword * 0.3;
        const ahead = scheduleQuestion(question) && String(chunk.sourceId).startsWith('event:');
        return { ...chunk, score: semantic + (ahead ? 0.15 : 0) };
      })
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    logger?.warn({ err: error }, 'week embeddings failed; using keyword rank');
    return keyed
      .map((chunk) => ({
        ...chunk,
        score:
          chunk.keyword +
          (scheduleQuestion(question) && String(chunk.sourceId).startsWith('event:') ? 0.2 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
  }
}

function composeFallbackAnswer(top, language) {
  const english = normalizeLanguage(language) === 'English';
  if (top.length === 0) {
    return english
      ? 'I do not have enough of this week on file to answer that.'
      : 'אין לי מספיק מהשבוע הזה כדי לענות על זה.';
  }
  const titles = top
    .slice(0, 4)
    .map((chunk) => chunk.title)
    .filter(Boolean);
  return english
    ? `From this week: ${titles.join('; ')}.`
    : `מהשבוע הזה: ${titles.join('; ')}.`;
}

function citationPayload(ids, chunks) {
  const byId = new Map(chunks.map((chunk) => [chunk.sourceId, chunk]));
  return ids.map((id) => {
    const chunk = byId.get(id);
    return {
      id,
      label: chunk?.title || id,
      widget: widgetOfSource(id),
    };
  });
}

function askSystem(language, { today, tomorrow, timeZone } = {}) {
  return `You answer questions about the user's week: recent days and upcoming calendar events.
Today is ${today} in timezone ${timeZone}. Tomorrow is ${tomorrow}.
Reply with a single JSON object and nothing else:
{ "answer": "2 to 5 sentences", "citations": ["event:ID"] }

Rules:
- Write every word in ${language}. Never answer in English unless ${language} is English.
- Use only the CONTEXT chunks. Never invent events, mail, tasks, or numbers.
- "citations" must be copied from the [id:…] tags you used. Never invent an id.
- When asked about tomorrow, tonight, or later this week, use events whose date is tomorrow or later. Chunks tagged "tomorrow" / "מחר" are tomorrow.
- If the context does not contain the answer, say so briefly and cite nothing.
- Keep personal names, brand names and email subjects exactly as given.`;
}

/**
 * Grounded Q&A over ~7 days. Citations are filtered to chunks that were
 * actually retrieved, so the model cannot point at a widget it did not see.
 */
export async function askWeek(userId, question, { logger } = {}) {
  const asked = String(question || '').trim().slice(0, QUESTION_MAX);
  if (asked.length < 3) {
    const error = new Error('invalid_question');
    error.statusCode = 400;
    error.code = 'invalid_question';
    throw error;
  }

  const data = await collectDashboardData(userId, { logger });
  const timeZone = data.timeZone || config.defaults.timeZone;
  const language = data.settings?.language || config.defaults.language;
  const todayKey = localDateKey(timeZone);
  const tomorrowKey = shiftDateKey(todayKey, 1);
  const { start, end } = aroundDaysRange(timeZone, { past: PAST_DAYS, future: FUTURE_DAYS });
  const sinceDate = localDateKey(timeZone, start);

  const chunks = [];
  const seen = new Set();

  const logs = await listBriefingLogs(userId, { sinceDate, limit: 8 });
  for (const log of logs) {
    pushChunk(chunks, seen, {
      id: sourceId('briefing', log.date),
      title: log.date,
      date: log.date,
      text: `${log.date} ${log.text}${log.dailyTip ? ` Tip: ${log.dailyTip}` : ''}`,
    });
  }

  corpusFromDashboard(data, chunks, seen, timeZone, todayKey);

  try {
    const auth = await getAuthedClient(userId);
    const [weekEvents, weekMail] = await Promise.all([
      fetchEventsInRange(auth, { timeZone, start, end, maxResults: 120 }),
      fetchImportantEmails(auth, { newerThan: '7d', maxResults: 20 }),
    ]);
    for (const event of weekEvents) {
      const { dateKey, text } = eventLine(event, timeZone, todayKey);
      pushChunk(chunks, seen, {
        id: sourceId('event', event.id),
        title: event.title,
        date: dateKey,
        text,
      });
    }
    for (const email of weekMail) {
      pushChunk(chunks, seen, {
        id: sourceId('email', email.id),
        title: email.subject,
        date: String(email.receivedAt || '').slice(0, 10),
        text: `${email.from?.name || ''}: ${email.subject}. ${email.snippet || ''}`,
      });
    }
  } catch (error) {
    logger?.warn({ err: error }, 'week ask extra Google reads failed');
  }

  const ranked = await rankChunks(asked, chunks, logger);
  const top = ranked.slice(0, TOP_CHUNKS);
  const allowed = new Set([
    ...catalogFromDashboard(data),
    ...chunks.map((chunk) => chunk.sourceId),
  ]);

  if (!isOpenAiConfigured() || top.length === 0) {
    const citations = filterSources(
      top.filter((chunk) => (chunk.score ?? chunk.keyword) > 0).map((chunk) => chunk.sourceId),
      allowed,
    ).slice(0, 5);
    return {
      answer: composeFallbackAnswer(top, language),
      citations: citationPayload(citations, top),
      model: isOpenAiConfigured() ? 'fallback' : 'offline',
    };
  }

  const context = top
    .map(
      (chunk) =>
        `[id:${chunk.sourceId}] ${chunk.date ? `${chunk.date} · ` : ''}${chunk.title}\n${chunk.text}`,
    )
    .join('\n\n');

  try {
    const response = await getOpenAiClient().chat.completions.create({
      model: config.openai.model,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: askSystem(language, { today: todayKey, tomorrow: tomorrowKey, timeZone }) },
        {
          role: 'user',
          content:
            `Today is ${todayKey} (${formatLongDate(timeZone)}). Tomorrow is ${tomorrowKey}.\n\n` +
            `CONTEXT:\n${context}\n\nQuestion: ${asked}`,
        },
      ],
    });
    const parsed = parseJsonObject(response.choices[0]?.message?.content);
    const answer = String(parsed?.answer || parsed?.text || '').trim();
    if (!answer) throw new Error('empty week answer');
    const citations = filterSources(parsed?.citations, new Set(top.map((chunk) => chunk.sourceId)));
    return {
      answer,
      citations: citationPayload(citations, top),
      model: response.model,
    };
  } catch (error) {
    logger?.warn({ err: error }, 'week ask completion failed; using retrieval fallback');
    const citations = filterSources(
      top.map((chunk) => chunk.sourceId),
      allowed,
    ).slice(0, 4);
    return {
      answer: composeFallbackAnswer(top, language),
      citations: citationPayload(citations, top),
      model: 'fallback',
    };
  }
}
