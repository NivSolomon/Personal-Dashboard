import OpenAI from 'openai';
import { config, isOpenAiConfigured } from '../config.js';
import { parseJsonObject } from '../lib/json.js';
import { localDateKey } from '../lib/time.js';

let client = null;

function getClient() {
  if (!client) client = new OpenAI({ apiKey: config.openai.apiKey });
  return client;
}

function compact(text, limit) {
  if (!text) return '';
  const flat = String(text)
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function tomorrowKey(today) {
  const [year, month, day] = String(today).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function padClock(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function normalizeTimeWindow(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const range = text.match(/(\d{1,2}:\d{2})\s*(?:-|–|—|עד|to)\s*(\d{1,2}:\d{2})/i);
  if (range) {
    const start = padClock(range[1]);
    const end = padClock(range[2]);
    if (start && end) return `${start}-${end}`;
  }
  const until = text.match(/(?:עד|by)\s*(\d{1,2}:\d{2})/i);
  if (until) {
    const clock = padClock(until[1]);
    return clock ? `עד ${clock}` : null;
  }
  const one = padClock(text);
  return one || (text.length <= 24 ? text : null);
}

function normalizeDate(raw, today) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  if (/^(היום|today)$/i.test(text)) return today || null;
  if (/^(מחר|tomorrow)$/i.test(text)) return tomorrowKey(today);
  return /^20\d{2}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function inferArrival(email, today) {
  const blobs = (email.arrivalHints || []).filter(Boolean).join(' · ');
  if (!blobs) return { estimatedDeliveryDate: null, estimatedDeliveryTime: null };

  const dateMatch = blobs.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  let estimatedDeliveryDate = dateMatch?.[1] || null;
  if (!estimatedDeliveryDate && /היום|today/i.test(blobs)) estimatedDeliveryDate = today || null;
  if (!estimatedDeliveryDate && /מחר|tomorrow/i.test(blobs)) estimatedDeliveryDate = tomorrowKey(today);

  return {
    estimatedDeliveryDate,
    estimatedDeliveryTime: normalizeTimeWindow(blobs),
  };
}

function systemPrompt(language, today) {
  return `You extract pending parcel deliveries from shipping emails.
Reply with a single JSON object and nothing else.

Today's date is ${today}.

JSON shape:
{
  "packages": [
    {
      "storeName": "Amazon",
      "trackingNumber": "TBA123 or null",
      "status": "short status in ${language}",
      "estimatedDeliveryDate": "YYYY-MM-DD or null",
      "estimatedDeliveryTime": "HH:mm, HH:mm-HH:mm, or a short phrase like עד 21:00, or null",
      "estimatedArrivalText": "the original arrival phrase from the email, or null",
      "sourceMessageId": "the email id this came from"
    }
  ]
}

Rules:
- Include only shipments that still look pending: ordered, shipped, in transit, out for delivery, arriving soon, delayed.
- Exclude delivered, cancelled, refunded, and pure marketing mail.
- Deduplicate by tracking number, or by store + estimated date when there is no tracking number.
- storeName is the merchant or carrier (Amazon, AliExpress, דואר ישראל, and so on). Keep known brand names.
- Look hard for an arrival estimate: "estimated delivery", "arriving by", "delivery window", "הגעה צפויה", "מועד אספקה", "יגיע עד", "בין השעות", "חלון חלוקה".
- If the email says today or tomorrow, convert that to YYYY-MM-DD using today's date above.
- If a time window is given (e.g. 14:00-18:00), put it in estimatedDeliveryTime. Do not invent a clock time.
- status is one short phrase in ${language}. Do not invent a tracking number, date, or time.
- If a field is unknown, use null.
- If nothing pending is in the emails, return {"packages": []}.`;
}

function buildPrompt(emails) {
  const lines = ['Shipping emails to extract pending packages from:', ''];
  for (const email of emails) {
    lines.push(`id: ${email.id}`);
    lines.push(`from: ${email.from?.name || ''} <${email.from?.email || ''}>`);
    lines.push(`subject: ${email.subject}`);
    lines.push(`received: ${email.receivedAt || ''}`);
    if (email.arrivalHints?.length) {
      lines.push(`arrival hints: ${email.arrivalHints.join(' | ')}`);
    }
    const body = compact(email.bodyPreview || email.snippet, 1100);
    if (body) lines.push(`body: ${body}`);
    lines.push('');
  }
  return lines.join('\n');
}

function byId(emails) {
  return new Map((emails || []).map((email) => [email.id, email]));
}

function cleanPackage(item, emailsById, today) {
  if (!item || typeof item !== 'object') return null;
  const storeName = String(item.storeName || item.store || '').trim();
  if (!storeName) return null;
  const trackingNumber = String(item.trackingNumber || item.tracking || '').trim() || null;
  const status = String(item.status || '').trim() || null;
  const sourceMessageId = String(item.sourceMessageId || item.messageId || '').trim() || null;
  const email = sourceMessageId ? emailsById.get(sourceMessageId) : null;
  const inferred = email ? inferArrival(email, today) : {};

  const estimatedDeliveryDate =
    normalizeDate(item.estimatedDeliveryDate || item.eta || item.date, today) ||
    inferred.estimatedDeliveryDate ||
    null;
  const estimatedDeliveryTime =
    normalizeTimeWindow(item.estimatedDeliveryTime || item.deliveryWindow || item.time) ||
    inferred.estimatedDeliveryTime ||
    null;
  const estimatedArrivalText =
    String(item.estimatedArrivalText || item.arrivalText || '').trim() || null;

  return {
    storeName,
    trackingNumber,
    status,
    estimatedDeliveryDate,
    estimatedDeliveryTime,
    estimatedArrivalText,
    sourceMessageId,
    webViewLink: email?.webViewLink || null,
    receivedAt: email?.receivedAt || null,
  };
}

function dedupePackages(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = item.trackingNumber
      ? `t:${item.trackingNumber.toLowerCase()}`
      : `s:${item.storeName.toLowerCase()}|${item.estimatedDeliveryDate || ''}|${item.status || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Turns shipping-mail snippets into the structured list the parcels widget shows.
 * Returns [] when there is nothing to parse, no key, or the model fails — the
 * dashboard still renders, just empty.
 */
export async function extractPackages({
  emails = [],
  language = 'Hebrew',
  timeZone,
  logger,
} = {}) {
  if (!emails.length) return [];
  if (!isOpenAiConfigured()) {
    logger?.warn('OPENAI_API_KEY is not set; skipping parcel extraction');
    return [];
  }

  const today = localDateKey(timeZone || config.timeZone);

  try {
    const response = await getClient().chat.completions.create({
      model: config.openai.model,
      temperature: 0.1,
      max_tokens: 1100,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt(language, today) },
        { role: 'user', content: buildPrompt(emails) },
      ],
    });

    const parsed = parseJsonObject(response.choices[0]?.message?.content);
    const raw = Array.isArray(parsed?.packages)
      ? parsed.packages
      : Array.isArray(parsed?.parcels)
        ? parsed.parcels
        : [];
    const emailsById = byId(emails);
    return dedupePackages(
      raw.map((item) => cleanPackage(item, emailsById, today)).filter(Boolean),
    );
  } catch (error) {
    logger?.error({ err: error }, 'OpenAI parcel extraction failed');
    return [];
  }
}
