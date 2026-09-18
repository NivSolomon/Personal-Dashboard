import OpenAI from 'openai';
import { config, isOpenAiConfigured } from '../config.js';
import { composeFallbackTip, dayLoadGuidance, measureDayLoad } from '../lib/busyness.js';
import { parseJsonObject } from '../lib/json.js';
import { formatLongDate, formatTime } from '../lib/time.js';
import { isWidgetEnabled } from '../lib/widgets.js';
import { displayCurrency } from '../lib/watchlist.js';

let client = null;

function getClient() {
  if (!client) client = new OpenAI({ apiKey: config.openai.apiKey });
  return client;
}

/**
 * Built per call so the language is a hard rule in the system message, not just a
 * line in the user message — models otherwise drift back to English mid-briefing.
 */
function systemPrompt(language, customAIPrompt = '') {
  const base = `You are the user's personal morning assistant.
Reply with a single JSON object and nothing else — no markdown, no fences.

JSON shape:
{
  "briefing": "3 to 5 sentences they can read in under 30 seconds",
  "DailyTip": "one short inspiring or productivity-focused sentence, tailored to today's load"
}

Rules for "briefing":
- Write every word in ${language}. Never answer in English unless ${language} is English.
- Keep personal names, brand names and email subjects exactly as given, even when they are in another script.
- 3 to 5 sentences, no bullet lists, no markdown headings.
- Open with a friendly greeting that uses their first name.
- Mention the first commitment of the day and its time, then what deserves attention in tasks and mail — but only when those sections appear in the data.
- Only mention calendar, tasks, mail, weather, training, deadlines, the USD rate, or watched stocks/funds when that section is present. If a section is absent, skip it entirely.
- When a USD/ILS rate is given, mention it in one short clause, and only dwell on it if it moved.
- When a watchlist is given, mention a price alert that has fired, or one notable move, in one short clause. Do not list every symbol.
- Call out real pressure only: overdue tasks, back-to-back meetings, a mail that clearly needs a reply.
- Never invent an event, task, or sender that is not in the data. If a section is empty, say so briefly and positively.
- The "note:" fragments are raw, possibly truncated context. Use them to judge what is urgent; do not quote them at length.
- When weather is given, treat it as outdoor training conditions for a run or a ride, not a general weather report. If sport.verdict is skip or there are no good windows, tell them to train indoors and say why (heat, rain, wind). Never call a hot or wet hour a pleasant time outside.
- If a good training window is listed, name that hour and whether it suits a run or a ride. Pick it from the list rather than inventing an hour.
- When training data is given, mention this week's progress in one short clause, encouraging rather than judging. Never imply they are behind if there is no goal.
- Treat Notion entries as deadlines: mention the ones due today first, and only flag later ones if they are close.
- Do not put the daily tip inside the briefing; that belongs only in DailyTip.

Rules for "DailyTip":
- One sentence in ${language}, max ~25 words.
- Tailor it to the Day load section: packed days get a high-energy time-management tip; light days get deep-work or genuine rest; moderate days get a practical focus note.
- Do not invent meetings or tasks. Speak to the load, not to fictional details.
- Do not repeat the briefing.`;

  const extra = String(customAIPrompt || '').trim();
  if (!extra) return base;
  return `${base}

Personal instructions from the user. Follow them for tone, emphasis and structure, but never break the rules above — especially language, length, and never inventing data:
${extra}`;
}

/**
 * Notes, descriptions and mail snippets arrive as multi-line text padded with
 * conferencing boilerplate and links. The prompt is one line per item, so each
 * value is flattened, stripped of URLs and cut at a word boundary before use.
 */
function compact(text, limit) {
  if (!text) return null;
  const flat = text
    // Kept as a marker rather than deleted, so sentences do not lose their object.
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= limit) return flat || null;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Calendar descriptions usually end in a wall of joining instructions. Everything
 * from the first such marker onwards is dropped so the agenda keeps the budget.
 */
const CONFERENCING = /-::-|join with google meet|join zoom meeting|(join )?microsoft teams meeting|or dial|more phone numbers|meeting id:|passcode:|pin:\s*\d/i;

function agenda(description) {
  if (!description) return null;
  const marker = description.search(CONFERENCING);
  return compact(marker === -1 ? description : description.slice(0, marker), 200);
}

/**
 * The user message sent to the model. Exported because its hash is what tells us
 * whether anything worth re-summarising has changed since the last briefing —
 * hashing the prompt itself means the check stays correct if this text evolves.
 */
export function buildSummaryPrompt({ user, data, timeZone, language }) {
  const wants = (id) => isWidgetEnabled(user?.settings?.layout, id);
  const lines = [];
  // Repeated here as well as in the system prompt, deliberately: this text is what
  // gets hashed, so a user changing their language invalidates their cached briefing.
  lines.push(`Write the briefing in ${language}.`, '');
  lines.push(`Name: ${user?.name?.split(' ')[0] || 'there'}`);
  lines.push(`Date: ${formatLongDate(timeZone)} (timezone ${timeZone})`);

  const load = measureDayLoad({
    events: data.events || [],
    tasks: data.tasks || [],
    timeZone,
  });
  lines.push('', 'Day load (steer DailyTip from this; do not narrate the score):');
  lines.push(`- level: ${load.level}`);
  lines.push(
    `- events today: ${load.eventCount} (${load.eventMinutes} minutes of timed meetings, ${load.allDayCount} all-day)`,
  );
  lines.push(
    `- open tasks: ${load.taskCount} (${load.dueToday} due today, ${load.overdue} overdue)`,
  );
  lines.push(`- DailyTip guidance: ${dayLoadGuidance(load.level)}`);

  const prefs = user?.preferences || {};
  if (prefs.primaryFocus || prefs.hobbies?.length || prefs.dailyRoutine) {
    lines.push('', 'User profile:');
    if (prefs.primaryFocus) lines.push(`- primary focus: ${prefs.primaryFocus}`);
    if (prefs.hobbies?.length) lines.push(`- hobbies: ${prefs.hobbies.join(', ')}`);
    if (prefs.dailyRoutine) lines.push(`- morning routine: ${prefs.dailyRoutine}`);
  }
  const custom = String(user?.customAIPrompt || '').trim();
  if (custom) {
    lines.push('', 'User instructions for this briefing:', custom);
  }

  if (wants('schedule')) {
    lines.push('', `Calendar events today (${data.events.length}):`);
    if (data.events.length === 0) {
      lines.push('- none');
    } else {
      for (const event of data.events) {
        const when = event.allDay
          ? 'all day'
          : `${formatTime(event.start, timeZone)}-${formatTime(event.end, timeZone)}`;
        const where = event.meetingUrl ? 'video call' : event.location || 'no location';
        const role = event.isSelfOrganized ? 'you organize' : 'you attend';
        const note = agenda(event.description);
        const docs = (event.attachments || [])
          .map((file) => file.title)
          .filter(Boolean)
          .slice(0, 3);
        lines.push(
          `- ${when} | ${event.title} | ${where} | ${event.attendees} attendees | ${role}` +
            (docs.length > 0 ? ` | docs: ${docs.join(', ')}` : '') +
            (note ? ` | note: ${note}` : ''),
        );
      }
    }
  }

  if (wants('tasks')) {
    lines.push('', `Open tasks (${data.tasks.length}):`);
    if (data.tasks.length === 0) {
      lines.push('- none');
    } else {
      for (const task of data.tasks.slice(0, 15)) {
        const note = compact(task.notes, 150);
        lines.push(
          `- ${task.title}${task.due ? ` | due ${task.due.slice(0, 10)}` : ' | no due date'}` +
            (note ? ` | note: ${note}` : ''),
        );
      }
    }
  }

  if (wants('emails')) {
    lines.push('', `Unread or important email, last 24h (${data.emails.length}):`);
    if (data.emails.length === 0) {
      lines.push('- none');
    } else {
      for (const email of data.emails.slice(0, 10)) {
        const flags = [email.unread && 'unread', email.important && 'important']
          .filter(Boolean)
          .join('+');
        const note = compact(email.snippet, 200);
        lines.push(
          `- ${email.from.name}: ${email.subject} (${flags})` + (note ? ` | note: ${note}` : ''),
        );
      }
    }
  }

  const weather = data.weather;
  if (wants('weather') && weather) {
    const nowSport = weather.current.sport;
    lines.push('', 'Outdoor training conditions (run/ride only, not general weather):');
    lines.push(
      `- now: ${weather.current.temp}°C (feels ${weather.current.feelsLike}°C), ` +
        `wind ${weather.current.windKmh} km/h, humidity ${weather.current.humidity ?? 'n/a'}%, ${weather.current.description}`,
    );
    if (nowSport) {
      lines.push(
        `- sport now: ${nowSport.verdict} | best for: ${nowSport.bestFor}` +
          (nowSport.flags?.length ? ` | flags: ${nowSport.flags.join(', ')}` : ''),
      );
    }
    if (weather.high !== null) {
      lines.push(`- range: ${weather.low}°C to ${weather.high}°C`);
    }
    lines.push(`- rain expected today: ${weather.rainExpected ? 'yes' : 'no'}`);
    for (const slot of weather.slots) {
      const sport = slot.sport;
      lines.push(
        `- ${String(slot.hour).padStart(2, '0')}:00 | ${slot.temp}°C | wind ${slot.windKmh} km/h | ` +
          `rain ${slot.rainChance}% | ${sport ? `${sport.verdict}/${sport.bestFor}` : slot.description}`,
      );
    }
    const windows = weather.bestWindows
      .map((slot) => {
        const sport = slot.sport?.bestFor || 'run';
        return `${String(slot.hour).padStart(2, '0')}:00 (${sport})`;
      })
      .join(', ');
    lines.push(`- suitable training windows: ${windows || 'none — recommend indoor training'}`);
  }

  if (wants('notion')) {
    const deadlines = data.notion || [];
    lines.push('', `Notion deadlines, next 7 days (${deadlines.length}):`);
    if (deadlines.length === 0) {
      lines.push('- none');
    } else {
      for (const item of deadlines.slice(0, 15)) {
        lines.push(`- ${item.due?.slice(0, 10) || 'no date'}${item.dueToday ? ' (today)' : ''} | ${item.title}`);
      }
    }
  }

  const activity = data.activity;
  if (wants('activity') && activity) {
    lines.push('', 'Training this week:');
    lines.push(
      `- ${activity.count} activities | ${activity.distanceKm} km | ${activity.movingMinutes} minutes moving`,
    );
    for (const sport of activity.bySport) {
      lines.push(`- ${sport.sport}: ${sport.count}x | ${sport.distanceKm} km`);
    }
    if (activity.goalKm) {
      lines.push(`- weekly goal: ${activity.goalKm} km (${activity.goalPercent}% done)`);
    } else {
      lines.push('- no weekly goal set, so do not imply they are behind');
    }
  }

  if (wants('usd') && data.fx) {
    const fx = data.fx;
    lines.push('', 'USD/ILS:');
    lines.push(`- 1 USD = ${fx.rate} ILS as of ${fx.asOf}`);
    if (fx.change != null) {
      lines.push(`- change vs previous close: ${fx.change > 0 ? '+' : ''}${fx.change} (${fx.changePct}%)`);
    }
  }

  const watchlist = data.watchlist;
  if (wants('watchlist') && watchlist?.items?.length) {
    lines.push('', `Watched stocks and funds (${watchlist.items.length}):`);
    for (const item of watchlist.items.slice(0, 12)) {
      const quote = item.quote;
      const move =
        quote?.changePct != null ? `${quote.changePct > 0 ? '+' : ''}${quote.changePct}%` : 'n/a';
      lines.push(
        `- ${item.symbol} (${item.kind}) ${item.name}: ${quote?.price ?? 'n/a'} ${displayCurrency(quote?.currency) || ''} (${move})`,
      );
      for (const alert of item.alerts || []) {
        if (!alert.enabled) continue;
        lines.push(
          `  alert ${alert.op} ${alert.price}${alert.triggered ? ' TRIGGERED' : ''}${alert.firedAt && !alert.seenAt ? ' unseen' : ''}`,
        );
      }
    }
    if (watchlist.fired?.length) {
      lines.push(`- unseen price alerts: ${watchlist.fired.length}`);
    }
  }

  return lines.join('\n');
}

/** A deterministic briefing, used when no OpenAI key is configured or the API fails. */
export function composeFallbackSummary({ user, data, timeZone = config.timeZone }) {
  const firstName = user?.name?.split(' ')[0] || '';
  const wants = (id) => isWidgetEnabled(user?.settings?.layout, id);
  const parts = [firstName ? `בוקר טוב, ${firstName}.` : 'בוקר טוב.'];

  if (wants('schedule')) {
    const [next] = data.events;
    if (next) {
      const when = next.allDay ? 'לכל היום' : `בשעה ${formatTime(next.start, timeZone)}`;
      parts.push(
        data.events.length === 1
          ? `יש לך אירוע אחד היום: "${next.title}" ${when}.`
          : `יש לך ${data.events.length} אירועים היום, הראשון הוא "${next.title}" ${when}.`,
      );
    } else {
      parts.push('היומן שלך פנוי היום.');
    }
  }

  if (wants('tasks')) {
    parts.push(
      data.tasks.length === 0
        ? 'אין משימות פתוחות ברשימות שלך.'
        : data.tasks.length === 1
          ? `משימה פתוחה אחת ממתינה לך: "${data.tasks[0].title}".`
          : `${data.tasks.length} משימות פתוחות ממתינות לך, בהן "${data.tasks[0].title}".`,
    );
  }
  if (wants('emails')) {
    parts.push(
      data.emails.length === 0
        ? 'תיבת הדואר שקטה.'
        : data.emails.length === 1
          ? 'הודעה אחת מהיממה האחרונה ממתינה לעיון.'
          : `${data.emails.length} הודעות מהיממה האחרונה ממתינות לעיון.`,
    );
  }

  if (wants('weather') && data.weather) {
    const sport = data.weather.current.sport;
    const window = data.weather.bestWindows?.[0];
    const hour = window ? `${String(window.hour).padStart(2, '0')}:00` : null;
    const sportName = window?.sport?.bestFor === 'ride' ? 'רכיבה' : 'ריצה';
    if (sport?.verdict === 'skip' && !hour) {
      parts.push(
        `בחוץ ${data.weather.current.temp}°C — לא מתאים לריצה או לרכיבה. עדיף אימון בפנים.`,
      );
    } else if (hour) {
      parts.push(
        `בחוץ ${data.weather.current.temp}°C.` +
          (sport?.verdict === 'skip' ? ` עכשיו עדיף בפנים;` : '') +
          ` חלון נוח ל${sportName} סביב ${hour}.`,
      );
    } else {
      parts.push(`בחוץ ${data.weather.current.temp}°C, תנאים סבירים לאימון בחוץ.`);
    }
  }

  if (wants('notion')) {
    const dueToday = (data.notion || []).filter((item) => item.dueToday);
    if (dueToday.length > 0) {
      parts.push(
        dueToday.length === 1
          ? `דדליין להיום: "${dueToday[0].title}".`
          : `${dueToday.length} דדליינים להיום, בהם "${dueToday[0].title}".`,
      );
    }
  }

  if (wants('activity') && data.activity?.count > 0) {
    parts.push(`השבוע השלמת ${data.activity.count} אימונים ו-${data.activity.distanceKm} ק"מ.`);
  }

  if (wants('usd') && data.fx?.rate) {
    parts.push(`הדולר עומד על ${data.fx.rate} ₪.`);
  }

  if (wants('watchlist') && data.watchlist?.fired?.length) {
    const hit = data.watchlist.fired[0];
    const op = hit.op === 'below' ? 'מתחת ל' : 'מעל';
    const unit = displayCurrency(hit.currency) ? ` ${displayCurrency(hit.currency)}` : '';
    parts.push(
      `${hit.symbol} חצה את הקו שסימנת (${op}${hit.target}${unit}).`,
    );
  } else if (wants('watchlist') && data.watchlist?.items?.length) {
    const item = data.watchlist.items.find((entry) => entry.quote?.price != null);
    if (item) {
      const unit = displayCurrency(item.quote.currency);
      parts.push(`${item.symbol} עומד על ${item.quote.price}${unit ? ` ${unit}` : ''}.`);
    }
  }

  parts.push('שיהיה יום מוצלח.');

  return parts.join(' ');
}

function shapeSummaryResult({ text, dailyTip, model, load, language }) {
  const tip = String(dailyTip || '').trim() || composeFallbackTip(load, language);
  return { text, dailyTip: tip, model, busyness: load };
}

/**
 * Turns the collected Google data into the friendly briefing shown at the top of
 * the dashboard. Falls back to a locally composed summary if OpenAI is unusable,
 * so the dashboard always has something to show.
 */
export async function generateMorningSummary({ user, data, timeZone, language, prompt, logger }) {
  const load = measureDayLoad({
    events: data.events || [],
    tasks: data.tasks || [],
    timeZone,
  });

  if (!isOpenAiConfigured()) {
    logger?.warn('OPENAI_API_KEY is not set; using the offline summary');
    return shapeSummaryResult({
      text: composeFallbackSummary({ user, data, timeZone }),
      dailyTip: composeFallbackTip(load, language),
      model: 'fallback',
      load,
      language,
    });
  }

  try {
    const response = await getClient().chat.completions.create({
      model: config.openai.model,
      temperature: 0.7,
      // Non-Latin scripts cost several times more tokens per character than English,
      // so this ceiling is generous enough that a Hebrew briefing is not cut mid-sentence.
      max_tokens: 1100,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(language, user?.customAIPrompt) },
        { role: 'user', content: prompt || buildSummaryPrompt({ user, data, timeZone, language }) },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('OpenAI returned an empty completion');
    const parsed = parseJsonObject(raw);
    const briefing = String(parsed?.briefing || parsed?.text || parsed?.summary || '').trim();
    const tip = String(parsed?.DailyTip || parsed?.dailyTip || parsed?.tip || '').trim();
    if (!briefing) throw new Error('OpenAI JSON was missing a briefing');
    return shapeSummaryResult({
      text: briefing,
      dailyTip: tip,
      model: response.model,
      load,
      language,
    });
  } catch (error) {
    logger?.error({ err: error }, 'OpenAI summary failed; using the offline summary');
    return shapeSummaryResult({
      text: composeFallbackSummary({ user, data, timeZone }),
      dailyTip: composeFallbackTip(load, language),
      model: 'fallback',
      load,
      language,
    });
  }
}
