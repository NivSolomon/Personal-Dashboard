/** True when both Waze destinations are on file. */
export function placesReady(settings) {
  return Boolean(settings?.places?.home?.trim() && settings?.places?.work?.trim());
}

/** Opens Waze (app on the phone, website on desktop) and starts navigation. */
export function wazeNavigateUrl(address) {
  const q = encodeURIComponent(String(address || '').trim());
  return `https://waze.com/ul?q=${q}&navigate=yes`;
}
