import { google } from 'googleapis';

const QUERY = '(is:unread OR is:important) newer_than:1d -in:chats';
const SHIPPING_QUERY =
  'newer_than:45d (from:amazon OR from:aliexpress OR from:ebay OR "דואר ישראל" OR subject:shipped OR subject:shipping OR subject:"out for delivery" OR subject:"מעקב" OR subject:"נשלח" OR subject:"המשלוח") -in:chats';

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

/** Unread or Important mail received in the last 24 hours. */
export async function fetchImportantEmails(auth, { maxResults = 15 } = {}) {
  const gmail = google.gmail({ version: 'v1', auth });

  const { data: list } = await gmail.users.messages.list({
    userId: 'me',
    q: QUERY,
    maxResults,
  });

  const messages = await Promise.all(
    (list.messages || []).map(async ({ id }) => {
      // `metadata` keeps the payload small: we only need envelope headers and the snippet.
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const labels = data.labelIds || [];
      return {
        id: data.id,
        threadId: data.threadId,
        subject: header(data, 'Subject') || '(no subject)',
        from: parseSender(header(data, 'From')),
        receivedAt: data.internalDate
          ? new Date(Number(data.internalDate)).toISOString()
          : header(data, 'Date'),
        snippet: (data.snippet || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        unread: labels.includes('UNREAD'),
        important: labels.includes('IMPORTANT'),
        webViewLink: `https://mail.google.com/mail/u/0/#inbox/${data.threadId}`,
      };
    }),
  );

  return messages.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
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
export async function fetchShippingEmails(auth, { maxResults = 12 } = {}) {
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
