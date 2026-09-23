import { google } from 'googleapis';
import { rankMail } from '../lib/mailTriage.js';

const SHIPPING_QUERY =
  'newer_than:45d (from:amazon OR from:aliexpress OR from:ebay OR "דואר ישראל" OR subject:shipped OR subject:shipping OR subject:"out for delivery" OR subject:"מעקב" OR subject:"נשלח" OR subject:"המשלוח") -in:chats';

const MAIL_NOISE = '-in:chats -category:promotions -category:social -category:forums';

function header(message, name) {
  const match = (message.payload?.headers || []).find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  );
  return match?.value || null;
}

/** Splits `Ada Lovelace <ada@example.com>` into its parts. */
function parseSender(value) {
  if (!value) return { name: 'Unknown sender', email: null };
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!match) return { name: value.trim(), email: value.trim() };
  const [, name, email] = match;
  return { name: name.trim() || email.trim(), email: email.trim() };
}

async function listMessageIds(gmail, q, maxResults) {
  try {
    const { data } = await gmail.users.messages.list({ userId: 'me', q, maxResults });
    return data.messages || [];
  } catch {
    return [];
  }
}

function shapeMessage(data) {
  const labels = data.labelIds || [];
  return {
    id: data.id,
    threadId: data.threadId,
    subject: header(data, 'Subject') || '(no subject)',
    from: parseSender(header(data, 'From')),
    receivedAt: data.internalDate
      ? new Date(Number(data.internalDate)).toISOString()
      : header(data, 'Date'),
    snippet: data.snippet || '',
    labels,
    listUnsubscribe: header(data, 'List-Unsubscribe'),
    listId: header(data, 'List-Id'),
    webViewLink: `https://mail.google.com/mail/u/0/#inbox/${data.threadId}`,
  };
}

/**
 * Morning triage: unread people, starred threads, and a little important mail —
 * promotions and bulk lists are dropped before the card sees them.
 */
export async function fetchImportantEmails(auth, { maxResults = 12, newerThan = '2d' } = {}) {
  const gmail = google.gmail({ version: 'v1', auth });
  const listed = await Promise.all([
    listMessageIds(gmail, `is:unread newer_than:${newerThan} ${MAIL_NOISE}`, maxResults),
    listMessageIds(gmail, `is:starred newer_than:14d ${MAIL_NOISE}`, Math.min(8, maxResults)),
    listMessageIds(gmail, `is:important newer_than:1d ${MAIL_NOISE}`, Math.min(8, maxResults)),
  ]);

  const unique = [];
  const seen = new Set();
  for (const row of listed.flat()) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row.id);
    if (unique.length >= 20) break;
  }

  const messages = await Promise.all(
    unique.map(async (id) => {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date', 'List-Unsubscribe', 'List-Id'],
      });
      return shapeMessage(data);
    }),
  );

  return rankMail(messages, { limit: maxResults }).map((email) => ({
    id: email.id,
    threadId: email.threadId,
    subject: email.subject,
    from: email.from,
    receivedAt: email.receivedAt,
    snippet: email.snippet,
    why: email.why,
    whyPreview: email.whyPreview,
    unread: email.unread,
    starred: email.starred,
    important: email.important,
    person: email.person,
    needsMe: email.needsMe,
    newsletter: email.newsletter,
    category: email.category,
    webViewLink: email.webViewLink,
  }));
}

function decodeBody(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function collectBodies(payload, acc = []) {
  if (!payload) return acc;
  const mime = String(payload.mimeType || '').toLowerCase();
  if (payload.body?.data && (mime === 'text/plain' || mime === 'text/html')) {
    acc.push({ mime, text: decodeBody(payload.body.data) });
  }
  for (const part of payload.parts || []) collectBodies(part, acc);
  return acc;
}

function pickEtaSnippets(text, limit = 4) {
  const mark =
    /הגעה צפויה|מועד אספקה|מועד הגעה|חלון חלוקה|שעות חלוקה|יגיע ב|יגיע עד|יגיע אליכם|נמסר עד|בין השעות|estimated delivery|expected delivery|arriving (?:by|on|between)|delivery window|guaranteed delivery|out for delivery/i;
  const parts = String(text || '')
    .split(/(?<=[\n.!?]|:)\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 8 && mark.test(part));
  const unique = [];
  const seen = new Set();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part.slice(0, 180));
    if (unique.length >= limit) break;
  }
  return unique;
}

function bodyPreview(payload, snippet) {
  const parts = collectBodies(payload);
  const plain = parts.find((part) => part.mime === 'text/plain')?.text || '';
  const html = parts.find((part) => part.mime === 'text/html')?.text || '';
  let text = plain;
  if (!text && html) {
    text = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  }
  const flat = (text || snippet || '')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
  const arrivalHints = pickEtaSnippets(flat);
  if (flat.length <= 1600) return { bodyPreview: flat, arrivalHints };
  const cut = flat.slice(0, 1600);
  const lastSpace = cut.lastIndexOf(' ');
  return {
    bodyPreview: `${(lastSpace > 960 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`,
    arrivalHints,
  };
}

/**
 * Recent order and shipping mail used to build the Incoming Packages widget.
 * Full payload is fetched so tracking numbers that live in the body still reach the model.
 */
export async function fetchShippingEmails(auth, { maxResults = 8 } = {}) {
  const gmail = google.gmail({ version: 'v1', auth });

  const { data: list } = await gmail.users.messages.list({
    userId: 'me',
    q: SHIPPING_QUERY,
    maxResults,
  });

  const messages = await Promise.all(
    (list.messages || []).map(async ({ id }) => {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const snippet = (data.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const preview = bodyPreview(data.payload, snippet);
      return {
        id: data.id,
        threadId: data.threadId,
        subject: header(data, 'Subject') || '(no subject)',
        from: parseSender(header(data, 'From')),
        receivedAt: data.internalDate
          ? new Date(Number(data.internalDate)).toISOString()
          : header(data, 'Date'),
        snippet,
        bodyPreview: preview.bodyPreview,
        arrivalHints: preview.arrivalHints,
        webViewLink: `https://mail.google.com/mail/u/0/#inbox/${data.threadId}`,
      };
    }),
  );

  return messages.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
}
