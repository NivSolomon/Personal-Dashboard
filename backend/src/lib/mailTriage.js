/** Rank and label mail so the board shows people who need you, not inbox noise. */

const MACHINE_LOCAL =
  /^(no-?reply|do[-.]?not[-.]?reply|donotreply|notifications?|notify|news|newsletter|digest|mailer|bounce|alerts?|updates?|info|hello|hi|team|support|billing|invoice|receipts?|noreply)@/i;

const WHY_NEEDS = new Set(['reply', 'question', 'meeting']);

export function decodeSnippet(value) {
  return String(value || '')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanPreview(snippet, limit = 88) {
  const text = decodeSnippet(snippet)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bunsubscribe\b[\s\S]*/i, '')
    .replace(/להסרה מהרשימה[\s\S]*/g, '')
    .replace(/On .{8,80}wrote:/i, '')
    .replace(/ב-\d{1,2}[\s\S]{0,40}כתב:/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function mailWhy(subject, snippet) {
  const title = String(subject || '');
  const body = `${title}\n${snippet || ''}`;
  if (/\b(otp|one[ -]?time(?: code)?|verification code|קוד אימות|קוד חד[־\-]פעמי|קוד סודי)\b/i.test(body)) {
    return 'otp';
  }
  if (/^\s*((fw|fwd)\s*:|הועבר\s*:)/i.test(title)) return 'forward';
  if (/^\s*(re\s*:|תשובה\s*:|re\s+)/i.test(title)) return 'reply';
  if (/\b(invoice|receipt|payment due|חשבונית|קבלה|תשלום)\b/i.test(body)) return 'invoice';
  if (/\b(meeting|invitation|invite|zoom|google meet|calendar|פגישה|זום|הזמנה ליומן)\b/i.test(body)) {
    return 'meeting';
  }
  if (/[?؟]|please confirm|can you|could you|נא לאשר|אפשר |האם /.test(body)) return 'question';
  return null;
}

export function categoryOf(labels = []) {
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'promotions';
  if (labels.includes('CATEGORY_SOCIAL')) return 'social';
  if (labels.includes('CATEGORY_FORUMS')) return 'forums';
  if (labels.includes('CATEGORY_UPDATES')) return 'updates';
  if (labels.includes('CATEGORY_PERSONAL')) return 'personal';
  return 'primary';
}

export function isNewsletter({ labels, listUnsubscribe, listId }) {
  const category = categoryOf(labels);
  if (category === 'promotions' || category === 'social' || category === 'forums') return true;
  if (listUnsubscribe || listId) return true;
  return false;
}

export function isPerson(email) {
  if (email.newsletter) return false;
  const address = String(email.from?.email || '');
  const local = address.split('@')[0] || '';
  if (MACHINE_LOCAL.test(`${local}@`)) return false;
  const name = String(email.from?.name || '');
  if (/unsubscribe|newsletter|no-?reply/i.test(name)) return false;
  return true;
}

export function isNeedsMe(email) {
  if (!email.unread) return false;
  if (email.person) return true;
  return WHY_NEEDS.has(email.why);
}

export function keepForBoard(email) {
  if (email.starred) return true;
  if (email.why === 'otp' || email.why === 'invoice') return true;
  if (email.newsletter) return false;
  if (email.category === 'promotions' || email.category === 'social' || email.category === 'forums') {
    return false;
  }
  return true;
}

export function mailScore(email, now = Date.now()) {
  const ageH = Math.max(0, (now - new Date(email.receivedAt || now).getTime()) / 3_600_000);
  let score = 0;
  if (email.unread && email.person) score += 100;
  else if (email.unread) score += 24;
  if (email.starred) score += 40;
  if (email.important && email.person) score += 12;
  if (WHY_NEEDS.has(email.why)) score += 14;
  if (email.why === 'invoice' || email.why === 'otp') score += 8;
  score -= Math.min(30, ageH * 0.35);
  return score;
}

export function triageMail(message) {
  const labels = message.labels || [];
  const snippet = decodeSnippet(message.snippet);
  const why = mailWhy(message.subject, snippet);
  const newsletter = isNewsletter(message);
  const email = {
    ...message,
    snippet,
    why,
    whyPreview: cleanPreview(snippet),
    newsletter,
    category: categoryOf(labels),
    unread: labels.includes('UNREAD') || Boolean(message.unread),
    starred: labels.includes('STARRED') || Boolean(message.starred),
    important: labels.includes('IMPORTANT') || Boolean(message.important),
  };
  email.person = isPerson(email);
  email.needsMe = isNeedsMe(email);
  email.score = mailScore(email);
  return email;
}

export function rankMail(messages, { limit = 12 } = {}) {
  return (messages || [])
    .map(triageMail)
    .filter(keepForBoard)
    .sort((a, b) => b.score - a.score || String(b.receivedAt).localeCompare(String(a.receivedAt)))
    .slice(0, limit);
}
