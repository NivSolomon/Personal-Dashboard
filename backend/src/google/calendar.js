import { google } from 'googleapis';
import { config } from '../config.js';
import { dayRange } from '../lib/time.js';

function shapeEvent(event) {
  return {
    id: event.id,
    title: event.summary || '(no title)',
    description: event.description || null,
    allDay: Boolean(event.start?.date),
    start: event.start?.dateTime || event.start?.date || null,
    end: event.end?.dateTime || event.end?.date || null,
    location: event.location || null,
    meetingUrl: event.hangoutLink || null,
    attendees: (event.attendees || []).length,
    attachments: (event.attachments || []).map((file) => ({
      title: file.title || '(untitled)',
      url: file.fileUrl || null,
    })),
    isSelfOrganized: Boolean(event.organizer?.self),
    htmlLink: event.htmlLink || null,
  };
}

function nextDate(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Today's events from the primary calendar, ordered by start time. */
export async function fetchTodayEvents(auth, { timeZone = config.timeZone, now = new Date() } = {}) {
  const { start, end } = dayRange(timeZone, now);
  const calendar = google.calendar({ version: 'v3', auth });

  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
    timeZone,
  });

  return (data.items || [])
    .filter((event) => event.status !== 'cancelled')
    .map(shapeEvent);
}

/** Events in `[start, end)` on the primary calendar, used by week Q&A. */
export async function fetchEventsInRange(
  auth,
  { timeZone = config.timeZone, start, end, maxResults = 80 } = {},
) {
  const calendar = google.calendar({ version: 'v3', auth });
  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults,
    timeZone,
  });

  return (data.items || [])
    .filter((event) => event.status !== 'cancelled')
    .map(shapeEvent);
}

/**
 * Moves a timed event. Title and location stay as they are — the timeline
 * what-if only changes wall-clock bounds.
 */
export async function updateCalendarEvent(auth, eventId, { date, startTime, endTime, timeZone }) {
  const calendar = google.calendar({ version: 'v3', auth });
  const { data } = await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: {
      start: { dateTime: `${date}T${startTime}:00`, timeZone },
      end: { dateTime: `${date}T${endTime}:00`, timeZone },
    },
  });
  return shapeEvent(data);
}

/**
 * Creates an event on the primary calendar. Timed events carry the user's
 * timezone so Google stores the wall-clock time they typed.
 */
export async function createCalendarEvent(
  auth,
  { title, date, startTime, endTime, allDay, location, description, timeZone },
) {
  const calendar = google.calendar({ version: 'v3', auth });
  const start = allDay ? { date } : { dateTime: `${date}T${startTime}:00`, timeZone };
  const end = allDay
    ? { date: nextDate(date) }
    : { dateTime: `${date}T${endTime}:00`, timeZone };

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      location: location || undefined,
      description: description || undefined,
      start,
      end,
    },
  });

  return shapeEvent(data);
}

export async function deleteCalendarEvent(auth, eventId) {
  const calendar = google.calendar({ version: 'v3', auth });
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'none',
    });
  } catch (error) {
    const status = error?.response?.status || error?.code;
    if (status === 404 || status === 410) return;
    throw error;
  }
}
