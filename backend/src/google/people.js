import { google } from 'googleapis';

function formatAddress(addr) {
  if (addr.formattedValue) return addr.formattedValue.trim();
  return [addr.streetAddress, addr.extendedAddress, addr.city, addr.region, addr.postalCode, addr.country]
    .filter(Boolean)
    .join(', ')
    .trim();
}

/**
 * Home/Work from Google Maps "Your places" are not exposed to third-party apps.
 * The People API can still return addresses the user saved on their Google
 * profile (About → Home / Work), which is the closest official source.
 */
export async function fetchProfileAddresses(auth) {
  const people = google.people({ version: 'v1', auth });
  const { data } = await people.people.get({
    resourceName: 'people/me',
    personFields: 'addresses',
  });

  const places = { home: '', work: '' };
  for (const addr of data.addresses || []) {
    const text = formatAddress(addr);
    if (!text) continue;
    const type = String(addr.type || '').toLowerCase();
    if (type === 'home' && !places.home) places.home = text;
    else if (type === 'work' && !places.work) places.work = text;
  }
  return places;
}
