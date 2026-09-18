import { useCallback, useId, useMemo, useState } from 'react';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import ConfirmDelete from './ConfirmDelete.jsx';
import TimeSelect, { addClockMinutes, nextClockSlot } from './TimeSelect.jsx';
import AddressInput from './AddressInput.jsx';
import { CalendarIcon, FileIcon, PlusIcon, TrashIcon, VideoIcon } from './icons.jsx';
import { timeLabel } from '../lib/format.js';
import { api, LOGIN_URL } from '../lib/api.js';
import { eventIssueText } from '../lib/errors.js';
import { eventFormIssues, hasIssues, isClockRangeValid } from '../lib/validate.js';
import { useT } from '../lib/i18n.jsx';

const inputClass =
  'border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm';

function defaultForm(timeZone) {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const slot = nextClockSlot(timeZone);
  return {
    title: '',
    date,
    startTime: slot.start,
    endTime: slot.end,
    allDay: false,
    location: '',
    description: '',
  };
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-muted mb-1.5 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export default function ScheduleCard({ events = [], timeZone, loading, error, onChanged, places }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => defaultForm(timeZone));
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [removedIds, setRemovedIds] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [actionError, setActionError] = useState(null);
  const rangeErrorId = useId();
  const close = useCallback(() => setOpen(false), []);

  const patch = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const openForm = () => {
    setForm(defaultForm(timeZone));
    setActionError(null);
    setAttempted(false);
    setOpen(true);
  };

  const issues = useMemo(() => eventFormIssues(form), [form]);
  const canSubmit = !hasIssues(issues);
  const rangeIssue = !form.allDay && (issues.endTime === 'before_start' || issues.endTime === 'no_room')
    ? issues.endTime
    : null;
  const showIssue = (field) => (attempted || field === 'endTime' || field === 'startTime') && issues[field];

  const shown = events.filter((item) => !removedIds.includes(item.id));

  const removeEvent = async () => {
    const item = pendingDelete;
    if (!item || removingId) return;
    setRemovingId(item.id);
    setActionError(null);
    try {
      await api.deleteEvent(item.id);
      setRemovedIds((ids) => [...ids, item.id]);
      setPendingDelete(null);
      await onChanged?.();
    } catch (error) {
      setActionError(error?.code === 'insufficient_scope' ? 'scope' : 'unavailable');
    } finally {
      setRemovingId(null);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setAttempted(true);
    if (!canSubmit || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.createEvent({
        title: form.title.trim(),
        date: form.date,
        allDay: form.allDay,
        startTime: form.allDay ? undefined : form.startTime,
        endTime: form.allDay ? undefined : form.endTime,
        location: form.location.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      setOpen(false);
      await onChanged?.();
    } catch (error) {
      setActionError(
        error?.code === 'insufficient_scope'
          ? 'scope'
          : error?.code === 'invalid_range' || error?.code === 'invalid_time'
            ? 'range'
            : error?.code === 'invalid_title' || error?.code === 'invalid_date'
              ? 'invalid'
              : 'unavailable',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card
        title={t('widget.schedule.title')}
        icon={<CalendarIcon className="size-4.5" />}
        tone="indigo"
        count={shown.length}
        loading={loading}
        error={error}
        skeleton="timeline"
        emptyText={t('schedule.empty')}
        footer={
          actionError && !open ? (
            <p role="alert" className="text-tone-rose-fg text-sm">
              {actionError === 'scope' ? (
                <>
                  {t('schedule.needScopeDelete')}{' '}
                  <a href={LOGIN_URL} className="font-medium underline">
                    {t('grantAgain')}
                  </a>
                </>
              ) : (
                t('schedule.deleteFail')
              )}
            </p>
          ) : null
        }
        action={
          <button
            type="button"
            onClick={openForm}
            title={t('schedule.new')}
            aria-label={t('schedule.new')}
            className="bg-tone-indigo text-tone-indigo-fg hover:opacity-90 grid size-8 place-items-center rounded-lg"
          >
            <PlusIcon className="size-4" />
          </button>
        }
      >
        {shown.map((item) => (
          <li key={item.id} className="flex gap-3">
            <div className="w-14 shrink-0 pt-0.5 text-end">
              <span className="text-foreground text-sm font-semibold tabular-nums">
                {item.allDay ? t('allDay') : timeLabel(item.start, timeZone)}
              </span>
              {!item.allDay && (
                <span className="text-subtle block text-xs tabular-nums">
                  {timeLabel(item.end, timeZone)}
                </span>
              )}
            </div>
            <div className="border-tone-indigo min-w-0 flex-1 border-s-2 ps-3">
              <p className="text-foreground truncate font-medium">{item.title}</p>
              <p className="text-muted truncate text-xs">
                {item.location || (item.meetingUrl ? t('videoCall') : t('noLocation'))}
                {item.attendees > 0 && ` · ${t('attendees', { n: item.attendees })}`}
              </p>
              {item.meetingUrl && (
                <a
                  href={item.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-tone-indigo-fg mt-1 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                >
                  <VideoIcon className="size-3.5" />
                  {t('joinCall')}
                </a>
              )}
              {item.attachments?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {item.attachments.slice(0, 2).map((file) => (
                    <li key={file.url || file.title} className="truncate">
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-tone-blue-fg inline-flex items-center gap-1.5 text-xs hover:underline"
                      >
                        <FileIcon className="size-3.5 shrink-0" />
                        {file.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              title={t('schedule.deleteEvent')}
              aria-label={t('schedule.deleteNamed', { title: item.title })}
              disabled={removingId === item.id}
              onClick={() => setPendingDelete(item)}
              className="text-muted hover:text-tone-rose-fg mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg disabled:opacity-50"
            >
              <TrashIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </Card>

      <Modal
        open={open}
        onClose={close}
        title={t('schedule.new')}
        description={t('schedule.newHint')}
      >
        <form className="space-y-3" onSubmit={submit}>
          <Field label={t('schedule.title')}>
            <input
              className={inputClass}
              required
              maxLength={200}
              value={form.title}
              onChange={(event) => patch('title', event.target.value)}
              placeholder={t('schedule.titlePlaceholder')}
              autoFocus
              aria-invalid={showIssue('title') ? true : undefined}
            />
            {showIssue('title') && (
              <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('title', issues.title)}
              </p>
            )}
          </Field>
          <Field label={t('schedule.date')}>
            <input
              className={inputClass}
              type="date"
              required
              value={form.date}
              onChange={(event) => patch('date', event.target.value)}
              aria-invalid={showIssue('date') ? true : undefined}
            />
            {showIssue('date') && (
              <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
                {eventIssueText('date', issues.date)}
              </p>
            )}
          </Field>
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(event) => patch('allDay', event.target.checked)}
            />
            {t('allDay')}
          </label>
          {!form.allDay && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <TimeSelect
                  id="event-start"
                  name="start"
                  label={t('schedule.start')}
                  required
                  value={form.startTime}
                  invalid={Boolean(showIssue('startTime'))}
                  onChange={(startTime) => {
                    setForm((prev) => {
                      let endTime = prev.endTime;
                      if (!isClockRangeValid(startTime, endTime)) {
                        const hourLater = addClockMinutes(startTime, 60);
                        endTime = isClockRangeValid(startTime, hourLater)
                          ? hourLater
                          : addClockMinutes(startTime, 15);
                      }
                      return { ...prev, startTime, endTime };
                    });
                  }}
                />
                <TimeSelect
                  id="event-end"
                  name="end"
                  label={t('schedule.end')}
                  required
                  minTime={form.startTime}
                  value={form.endTime}
                  invalid={Boolean(rangeIssue || showIssue('endTime'))}
                  describedBy={rangeIssue ? rangeErrorId : undefined}
                  onChange={(endTime) => patch('endTime', endTime)}
                />
              </div>
              {rangeIssue && (
                <p id={rangeErrorId} role="alert" className="text-tone-rose-fg text-sm">
                  {eventIssueText('endTime', rangeIssue)}
                </p>
              )}
            </div>
          )}
          <AddressInput
            label={t('schedule.location')}
            value={form.location}
            onChange={(location) => patch('location', location)}
            placeholder={t('schedule.locationPlaceholder')}
            inputClassName={inputClass}
            savedPlaces={places}
          />
          <Field label={t('schedule.description')}>
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={form.description}
              onChange={(event) => patch('description', event.target.value)}
              maxLength={2000}
            />
          </Field>
          {actionError === 'scope' && (
            <p className="text-tone-rose-fg text-sm">
              {t('schedule.needScopeCreate')}{' '}
              <a href={LOGIN_URL} className="font-medium underline">
                {t('grantAgain')}
              </a>
            </p>
          )}
          {actionError === 'range' && (
            <p className="text-tone-rose-fg text-sm">{t('form.before_start')}</p>
          )}
          {actionError === 'invalid' && (
            <p className="text-tone-rose-fg text-sm">{t('form.checkFields')}</p>
          )}
          {actionError === 'unavailable' && (
            <p className="text-tone-rose-fg text-sm">{t('schedule.saveFail')}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              className="border-border text-foreground hover:bg-surface-hover rounded-lg border px-3 py-2 text-sm font-medium"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-tone-indigo text-tone-indigo-fg rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving ? t('onboard.saving') : t('schedule.save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDelete
        open={Boolean(pendingDelete)}
        title={t('schedule.deleteTitle')}
        description={
          pendingDelete ? t('schedule.deleteConfirm', { title: pendingDelete.title }) : ''
        }
        busy={Boolean(pendingDelete && removingId === pendingDelete.id)}
        onConfirm={removeEvent}
        onClose={() => {
          if (!removingId) setPendingDelete(null);
        }}
      />
    </>
  );
}
