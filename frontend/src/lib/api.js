export const LOGIN_URL = '/auth/google';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `Request failed with ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error;
  }

  get needsLogin() {
    return this.status === 401;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    // Fastify rejects a JSON content-type with an empty body, so the header is only
    // declared when there is actually something to parse.
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : null),
      ...options.headers,
    },
  });

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body);
  return body;
}

export const NOTION_CONNECT_URL = '/auth/notion';
export const STRAVA_CONNECT_URL = '/auth/strava';

export const api = {
  me: () => request('/api/me'),
  settings: () => request('/api/settings'),
  updateSettings: (patch) =>
    request('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
  notionDataSources: () => request('/api/notion/data-sources'),
  selectNotionDataSource: (kind, dataSourceId) =>
    request('/api/notion/selection', {
      method: 'PUT',
      body: JSON.stringify({ kind, dataSourceId }),
    }),
  disconnect: (provider) => request(`/auth/${provider}`, { method: 'DELETE' }),
  deleteAccount: () => request('/auth/account', { method: 'DELETE' }),
  dashboard: () => request('/api/dashboard'),
  createTask: (body) => request('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  createEvent: (body) => request('/api/events', { method: 'POST', body: JSON.stringify(body) }),
  deleteEvent: (eventId) =>
    request(`/api/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' }),
  completeTask: (listId, taskId) =>
    request(`/api/tasks/${encodeURIComponent(listId)}/${encodeURIComponent(taskId)}/complete`, {
      method: 'POST',
    }),
  reopenTask: (listId, taskId) =>
    request(`/api/tasks/${encodeURIComponent(listId)}/${encodeURIComponent(taskId)}/reopen`, {
      method: 'POST',
    }),
  deleteTask: (listId, taskId) =>
    request(`/api/tasks/${encodeURIComponent(listId)}/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    }),
  summary: () => request('/api/summary'),
  refreshSummary: () => request('/api/summary/refresh', { method: 'POST' }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  suggestPlaces: (q, bias) => {
    const params = new URLSearchParams({ q });
    if (Number.isFinite(bias?.lat) && Number.isFinite(bias?.lon)) {
      params.set('lat', String(bias.lat));
      params.set('lon', String(bias.lon));
    }
    return request(`/api/places/suggest?${params}`);
  },
  placeEta: (origin) => {
    const params = new URLSearchParams();
    if (Number.isFinite(origin?.lat) && Number.isFinite(origin?.lon)) {
      params.set('lat', String(origin.lat));
      params.set('lon', String(origin.lon));
    }
    const query = params.toString();
    return request(`/api/places/eta${query ? `?${query}` : ''}`);
  },
  searchQuotes: (q) => request(`/api/quotes/search?${new URLSearchParams({ q })}`),
  quote: (symbol) => request(`/api/quotes/one?${new URLSearchParams({ symbol })}`),
  addWatchlistItem: (body) =>
    request('/api/watchlist/items', { method: 'POST', body: JSON.stringify(body) }),
  removeWatchlistItem: (itemId) =>
    request(`/api/watchlist/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
  addWatchlistAlert: (itemId, body) =>
    request(`/api/watchlist/items/${encodeURIComponent(itemId)}/alerts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeWatchlistAlert: (itemId, alertId) =>
    request(
      `/api/watchlist/items/${encodeURIComponent(itemId)}/alerts/${encodeURIComponent(alertId)}`,
      { method: 'DELETE' },
    ),
  ackWatchlistAlerts: (ids) =>
    request('/api/watchlist/ack', { method: 'POST', body: JSON.stringify({ ids }) }),
  completeOnboarding: (body) =>
    request('/api/user/onboarding', { method: 'POST', body: JSON.stringify(body) }),
  saveCustomPrompt: (customAIPrompt) =>
    request('/api/user/custom-prompt', {
      method: 'PATCH',
      body: JSON.stringify({ customAIPrompt }),
    }),
  searchNutrition: (q) => request(`/api/nutrition/search?${new URLSearchParams({ q })}`),
  nutritionBarcode: (code) => request(`/api/nutrition/barcode/${encodeURIComponent(code)}`),
  estimateNutrition: (query) =>
    request('/api/nutrition/estimate', { method: 'POST', body: JSON.stringify({ query }) }),
  analyzeMeal: (image) =>
    request('/api/nutrition/analyze-meal', { method: 'POST', body: JSON.stringify({ image }) }),
  addNutritionEntry: (body) =>
    request('/api/nutrition/log', { method: 'POST', body: JSON.stringify(body) }),
  removeNutritionEntry: (entryId) =>
    request(`/api/nutrition/log/${encodeURIComponent(entryId)}`, { method: 'DELETE' }),
};
