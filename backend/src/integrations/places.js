const PHOTON_URL = 'https://photon.komoot.io/api/';
const CACHE_MS = 60_000;
const cache = new Map();

function formatLabel(props) {
  const street = [props.housenumber, props.street].filter(Boolean).join(' ').trim();
  const locality = props.city || props.town || props.village || props.district || props.county || '';
  const parts = [];
  if (props.name && props.name !== street && props.name !== locality) parts.push(props.name);
  if (street) parts.push(street);
  if (locality && locality !== props.name) parts.push(locality);
  if (props.country && props.country !== locality) parts.push(props.country);
  return [...new Set(parts.filter(Boolean))].join(', ');
}

function shapeFeature(feature, index) {
  const props = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [];
  const label = formatLabel(props);
  if (!label) return null;
  return {
    id: String(props.osm_id || `${label}-${index}`),
    label: label.slice(0, 200),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

/**
 * Address suggestions for the type-ahead fields. Photon is OSM-based and needs
 * no API key; results are cached briefly so typing does not hammer the service.
 */
export async function suggestPlaces(query, { lat = null, lon = null } = {}) {
  const q = String(query || '').trim().slice(0, 80);
  if (q.length < 2) return [];

  const cacheKey = `${q.toLowerCase()}|${lat ?? ''}|${lon ?? ''}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.places;

  const params = new URLSearchParams({ q, limit: '6' });
  const biasLat = Number.isFinite(lat) ? lat : 31.5;
  const biasLon = Number.isFinite(lon) ? lon : 34.85;
  params.set('lat', String(biasLat));
  params.set('lon', String(biasLon));

  const response = await fetch(`${PHOTON_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'UserDashboard/1.0 (personal dashboard address lookup)',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`place search ${response.status}`);
  }

  const payload = await response.json();
  const places = (payload.features || []).map(shapeFeature).filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const place of places) {
    const key = place.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(place);
  }

  cache.set(cacheKey, { at: Date.now(), places: unique });
  return unique;
}
