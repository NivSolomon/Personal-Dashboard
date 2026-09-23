const AVATAR_TONES = [
  'bg-tone-indigo text-tone-indigo-fg',
  'bg-tone-blue text-tone-blue-fg',
  'bg-tone-green text-tone-green-fg',
  'bg-tone-amber text-tone-amber-fg',
  'bg-tone-rose text-tone-rose-fg',
];

export function senderKey(email) {
  return String(email?.from?.email || email?.from?.name || email?.id || '')
    .trim()
    .toLowerCase();
}

export function senderInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  const lettersOf = (part) => [...part].filter((ch) => /\p{L}/u.test(ch));
  if (parts.length === 1) {
    const chars = lettersOf(parts[0]);
    return chars.slice(0, 2).join('').toUpperCase() || '?';
  }
  const first = lettersOf(parts[0])[0];
  const last = lettersOf(parts[parts.length - 1])[0];
  return `${first || ''}${last || ''}`.toUpperCase() || '?';
}

export function avatarTone(key) {
  const text = String(key || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function groupMail(emails, { limit = 7 } = {}) {
  const groups = [];
  const indexByKey = new Map();
  for (const email of emails || []) {
    const key = senderKey(email);
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, groups.length);
      groups.push({
        ...email,
        count: 1,
        unreadCount: email.unread ? 1 : 0,
      });
      continue;
    }
    const row = groups[existing];
    row.count += 1;
    if (email.unread) row.unreadCount += 1;
    if (email.unread && !row.unread) {
      groups[existing] = {
        ...email,
        count: row.count,
        unreadCount: row.unreadCount,
      };
    }
  }
  return groups.slice(0, limit);
}

export function filterMail(groups, tab) {
  if (tab === 'unread') return groups.filter((row) => row.unreadCount > 0 || row.unread);
  if (tab === 'needs') {
    return groups.filter((row) => {
      if (!(row.unreadCount > 0 || row.unread)) return false;
      if (row.person || row.needsMe) return true;
      return row.why === 'reply' || row.why === 'question' || row.why === 'meeting';
    });
  }
  return groups;
}
