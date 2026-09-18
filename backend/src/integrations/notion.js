import { Client } from '@notionhq/client';
import { localDateKey, weekRange } from '../lib/time.js';

// From this version Notion splits a database (container) from its data sources,
// and queries must target a data source id rather than a database id.
export const NOTION_VERSION = '2025-09-03';

// Page properties expose a status name but not its group, so completion is matched
// by name. Extend this list if a workspace uses different wording.
const DONE_NAMES = new Set(['done', 'complete', 'completed', 'archived', 'הושלם', 'בוצע']);

/** One short-lived client per call: the token belongs to a specific user. */
function clientFor(token) {
  return new Client({ auth: token, notionVersion: NOTION_VERSION });
}

function titleOf(page) {
  const property = Object.values(page.properties || {}).find((value) => value.type === 'title');
  const text = (property?.title || []).map((part) => part.plain_text).join('').trim();
  return text || '(ללא כותרת)';
}

function isDone(page) {
  return Object.values(page.properties || {}).some((property) => {
    if (property.type === 'checkbox') return property.checkbox === true;
    const name = property.status?.name || property.select?.name;
    return name ? DONE_NAMES.has(name.toLowerCase()) : false;
  });
}

function dateOf(page, name) {
  return page.properties?.[name]?.date?.start || null;
}

function numberOf(page, name) {
  const property = page.properties?.[name];
  // Rollups and formulas are common on logged data, so unwrap those too.
  return property?.number ?? property?.rollup?.number ?? property?.formula?.number ?? 0;
}

/**
 * Dated, unfinished entries from today up to `days` ahead, read from the data
 * source this user chose in Settings.
 */
export async function fetchNotionDeadlines({ token, selection, timeZone, days = 7 }) {
  const dateProperty = selection?.dateProperty;
  if (!selection?.dataSourceId || !dateProperty) return [];

  const today = localDateKey(timeZone);
  const horizon = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const response = await clientFor(token).dataSources.query({
    data_source_id: selection.dataSourceId,
    page_size: 25,
    filter: {
      and: [
        { property: dateProperty, date: { on_or_after: today } },
        { property: dateProperty, date: { on_or_before: horizon } },
      ],
    },
    sorts: [{ property: dateProperty, direction: 'ascending' }],
  });

  return (response.results || [])
    .filter((page) => page.object === 'page' && !page.archived && !isDone(page))
    .map((page) => ({
      id: page.id,
      title: titleOf(page),
      due: dateOf(page, dateProperty),
      dueToday: dateOf(page, dateProperty)?.slice(0, 10) === today,
      url: page.url || null,
    }));
}

/**
 * This week's logged workouts, totalled. Stands in for a fitness provider: the
 * Fit REST API is closed to new projects, and Strava's terms bar sending its data
 * to a language model, which is exactly what the briefing does.
 */
export async function fetchNotionActivity({ token, selection, timeZone, weeklyGoalKm = 0 }) {
  const { dataSourceId, dateProperty, distanceProperty, durationProperty, sportProperty } =
    selection || {};
  if (!dataSourceId || !dateProperty) return null;

  const { start } = weekRange(timeZone);

  const response = await clientFor(token).dataSources.query({
    data_source_id: dataSourceId,
    page_size: 100,
    filter: {
      and: [
        { property: dateProperty, date: { on_or_after: localDateKey(timeZone, start) } },
        { property: dateProperty, date: { on_or_before: localDateKey(timeZone) } },
      ],
    },
    sorts: [{ property: dateProperty, direction: 'descending' }],
  });

  const pages = (response.results || []).filter(
    (page) => page.object === 'page' && !page.archived,
  );

  const bySport = new Map();
  let distanceKm = 0;
  let minutes = 0;

  for (const page of pages) {
    const distance = distanceProperty ? numberOf(page, distanceProperty) : 0;
    const duration = durationProperty ? numberOf(page, durationProperty) : 0;
    distanceKm += distance;
    minutes += duration;

    // Free text in Notion, so the label is shown as written rather than mapped.
    const sport = (sportProperty && page.properties?.[sportProperty]?.select?.name) || 'אחר';
    const entry = bySport.get(sport) || { sport, count: 0, distanceKm: 0, movingMinutes: 0 };
    entry.count += 1;
    entry.distanceKm += distance;
    entry.movingMinutes += duration;
    bySport.set(sport, entry);
  }

  const round = (value) => Math.round(value * 10) / 10;
  const [newest] = pages;

  return {
    source: 'notion',
    weekStart: start.toISOString(),
    count: pages.length,
    distanceKm: round(distanceKm),
    movingMinutes: Math.round(minutes),
    goalKm: weeklyGoalKm || null,
    goalPercent: weeklyGoalKm > 0 ? Math.round((distanceKm / weeklyGoalKm) * 100) : null,
    bySport: [...bySport.values()]
      .map((entry) => ({ ...entry, distanceKm: round(entry.distanceKm) }))
      .sort((a, b) => b.distanceKm - a.distanceKm),
    latest: newest
      ? {
          name: titleOf(newest),
          distanceKm: distanceProperty ? round(numberOf(newest, distanceProperty)) : 0,
          movingMinutes: durationProperty ? Math.round(numberOf(newest, durationProperty)) : 0,
          at: dateOf(newest, dateProperty),
        }
      : null,
  };
}
