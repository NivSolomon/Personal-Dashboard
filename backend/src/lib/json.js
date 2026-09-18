/**
 * Models sometimes wrap JSON in fences or chatter around the object.
 * Pull out the first {...} so a slightly messy completion still parses.
 */
export function parseJsonObject(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(candidate.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
