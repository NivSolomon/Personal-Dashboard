import { createTtlCache } from '../lib/ttlCache.js';
import { suggestPlaces } from './places.js';

const WAZE_ORIGIN = 'https://www.waze.com/';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; UserDashboard/1.0)',
  Referer: WAZE_ORIGIN,
};

const SEARCH = {
  IL: `${WAZE_ORIGIN}il-SearchServer/mozi`,
  ROW: `${WAZE_ORIGIN}row-SearchServer/mozi`,
};

const ROUTING = {
  IL: 'https://routing-livemap-il.waze.com/RoutingManager/routingRequest',
  ROW: 'https://routing-livemap-row.waze.com/RoutingManager/routingRequest',
};

const IL_BIAS = { lat: 31.768, lon: 35.214 };
const NEARBY_METERS = 150;

const geocodeCache = createTtlCache({ ttlMs: 12 * 60 * 60 * 1000, maxEntries: 200 });
const routeCache = createTtlCache({ ttlMs: 90_000, maxEntries: 200 });

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function isIsrael(lat, lon) {
  return lat >= 29.4 && lat <= 33.5 && lon >= 34.15 && lon <= 35.95;
}

function regionFor(point) {
  return isIsrael(point.lat, point.lon) ? 'IL' : 'ROW';
}

function haversineMeters(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

async function wazeJson(url) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`waze ${response.status}`);
  return response.json();
}

function pickSearchHit(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const hit =
    rows.find((row) => row?.location && (row.city || row.street || row.name)) ||
    rows.find((row) => row?.location);
  const lat = Number(hit?.location?.lat);
  const lon = Number(hit?.location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocodeWithWaze(address, bias) {
  const params = new URLSearchParams({
    q: address,
    lang: 'he',
    origin: 'livemap',
    lat: String(bias.lat),
    lon: String(bias.lon),
  });
  const region = regionFor(bias);
  const first = pickSearchHit(await wazeJson(`${SEARCH[region]}?${params}`));
  if (first) return first;
  const other = region === 'IL' ? 'ROW' : 'IL';
  return pickSearchHit(await wazeJson(`${SEARCH[other]}?${params}`));
}

async function geocodeWithPhoton(address, bias) {
  const places = await suggestPlaces(address, bias);
  const hit = places.find((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
  if (!hit) return null;
  return { lat: hit.lat, lon: hit.lon };
}

/** Resolve a saved home/work address to coordinates, preferring Waze's own search. */
export async function geocodeAddress(address, bias = IL_BIAS) {
  const q = String(address || '').trim().slice(0, 200);
  if (q.length < 2) return null;

  const key = `${q.toLowerCase()}|${round(bias.lat, 2)}|${round(bias.lon, 2)}`;
  const { value } = await geocodeCache.wrap(
    key,
    async () => {
      try {
        return (await geocodeWithWaze(q, bias)) || (await geocodeWithPhoton(q, bias));
      } catch {
        try {
          return await geocodeWithPhoton(q, bias);
        } catch {
          return null;
        }
      }
    },
    { shouldCache: (coords) => Boolean(coords) },
  );
  return value;
}

function sumRoute(payload) {
  const response = payload?.response || payload?.alternatives?.[0]?.response;
  const segments = response?.results || response?.result || [];
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const seconds = segments.reduce(
    (total, segment) => total + Number(segment.crossTime || segment.cross_time || 0),
    0,
  );
  const meters = segments.reduce((total, segment) => total + Number(segment.length || 0), 0);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return {
    seconds: Math.round(seconds),
    minutes: Math.max(1, Math.round(seconds / 60)),
    meters: Math.round(meters),
  };
}

async function routeOnce(from, to, region) {
  const params = new URLSearchParams({
    from: `x:${from.lon} y:${from.lat}`,
    to: `x:${to.lon} y:${to.lat}`,
    at: '0',
    returnJSON: 'true',
    returnGeometries: 'false',
    returnInstructions: 'false',
    timeout: '60000',
    nPaths: '1',
    options: 'AVOID_TRAILS:t',
  });
  return sumRoute(await wazeJson(`${ROUTING[region]}?${params}`));
}

export async function estimateDrive(from, to) {
  if (!from || !to) return null;
  const meters = haversineMeters(from, to);
  if (meters < NEARBY_METERS) {
    return { minutes: 0, seconds: 0, meters: Math.round(meters), nearby: true };
  }

  const key = `${round(from.lat, 3)},${round(from.lon, 3)}->${round(to.lat, 4)},${round(to.lon, 4)}`;
  const { value } = await routeCache.wrap(
    key,
    async () => {
      const preferred = regionFor(from) === 'IL' || regionFor(to) === 'IL' ? 'IL' : 'ROW';
      try {
        const hit = await routeOnce(from, to, preferred);
        if (hit) return hit;
      } catch {
        /* Try the other live-map cluster. */
      }
      const other = preferred === 'IL' ? 'ROW' : 'IL';
      return routeOnce(from, to, other);
    },
    { shouldCache: (drive) => Boolean(drive) },
  );
  return value;
}

function arrivalPayload(drive, now = new Date()) {
  if (!drive) return null;
  const arriveAt = new Date(now.getTime() + drive.seconds * 1000).toISOString();
  return {
    minutes: drive.nearby ? 0 : drive.minutes,
    meters: drive.meters,
    arriveAt,
    nearby: Boolean(drive.nearby),
  };
}

/**
 * Drive times from the user's current point to saved home and work, using
 * Waze live-map routing (real-time traffic when the cluster has it).
 */
export async function estimateArrivals({ origin, home, work, logger } = {}) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) {
    return { home: null, work: null };
  }

  const dests = [
    ['home', home],
    ['work', work],
  ];

  const settled = await Promise.allSettled(
    dests.map(async ([key, address]) => {
      const dest = await geocodeAddress(address);
      if (!dest) return [key, null];
      const drive = await estimateDrive(origin, dest);
      return [key, arrivalPayload(drive)];
    }),
  );

  const result = { home: null, work: null };
  settled.forEach((entry, index) => {
    const key = dests[index][0];
    if (entry.status === 'fulfilled') {
      result[key] = entry.value[1];
      return;
    }
    logger?.warn({ err: entry.reason, dest: key }, 'waze eta failed');
  });
  return result;
}
