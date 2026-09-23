/** Only http(s) URLs belong in hrefs that come from APIs or user content. */
export function safeHttpUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return null;
  }
  return null;
}
