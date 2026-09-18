import { Client } from '@notionhq/client';
import { config } from '../config.js';
import { NOTION_VERSION } from './notion.js';

const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

export function getNotionAuthUrl(state) {
  const query = new URLSearchParams({
    client_id: config.notion.clientId,
    redirect_uri: config.notion.redirectUri,
    response_type: 'code',
    owner: 'user',
    state,
  });
  return `${AUTHORIZE_URL}?${query}`;
}

/**
 * Notion's token endpoint authenticates the *app* with HTTP Basic rather than by
 * posting the client secret, which is easy to miss and fails with 401 otherwise.
 */
export async function exchangeNotionCode(code) {
  const basic = Buffer.from(`${config.notion.clientId}:${config.notion.clientSecret}`).toString(
    'base64',
  );

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.notion.redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Notion token exchange failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const body = await response.json();
  return {
    accessToken: body.access_token,
    workspaceName: body.workspace_name || null,
    workspaceIcon: body.workspace_icon || null,
    botId: body.bot_id || null,
  };
}

const propertyNames = (schema, type) =>
  Object.entries(schema || {})
    .filter(([, value]) => value.type === type)
    .map(([name]) => name);

/** First name matching the hint, else the first of that type, else null. */
function pick(schema, type, hint) {
  const names = propertyNames(schema, type);
  return names.find((name) => hint.test(name)) || names[0] || null;
}

/**
 * Property names differ per workspace, so rather than asking people to type them
 * they are inferred from the data source schema when they choose it.
 */
export function inferProperties(schema, kind) {
  if (kind === 'workouts') {
    const numbers = propertyNames(schema, 'number');
    const distance = numbers.find((n) => /dist|km|ק"?מ|קילומ/i.test(n)) || numbers[0] || null;
    const duration =
      numbers.find((n) => /dur|time|min|דק|זמן/i.test(n) && n !== distance) ||
      numbers.find((n) => n !== distance) ||
      null;
    return {
      dateProperty: pick(schema, 'date', /date|day|תאריך/i),
      distanceProperty: distance,
      durationProperty: duration,
      sportProperty: pick(schema, 'select', /sport|type|סוג|אימון/i),
    };
  }
  return { dateProperty: pick(schema, 'date', /due|deadline|date|תאריך|יעד/i) };
}

/**
 * Every data source the user shared with this integration, so Settings can offer
 * a concrete list instead of asking for an id.
 */
export async function listNotionDataSources(token) {
  const notion = new Client({ auth: token, notionVersion: NOTION_VERSION });
  const response = await notion.search({
    filter: { property: 'object', value: 'data_source' },
    page_size: 50,
  });

  return (response.results || []).map((source) => ({
    id: source.id,
    title: (source.title || []).map((part) => part.plain_text).join('') || '(ללא שם)',
    properties: Object.keys(source.properties || {}),
    inferred: {
      deadlines: inferProperties(source.properties, 'deadlines'),
      workouts: inferProperties(source.properties, 'workouts'),
    },
  }));
}

/** Resolves one choice into the stored shape, inferring its property names. */
export async function describeSelection(token, dataSourceId, kind) {
  const notion = new Client({ auth: token, notionVersion: NOTION_VERSION });
  const source = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const title = (source.title || []).map((part) => part.plain_text).join('') || '(ללא שם)';
  return { dataSourceId, title, ...inferProperties(source.properties, kind) };
}
