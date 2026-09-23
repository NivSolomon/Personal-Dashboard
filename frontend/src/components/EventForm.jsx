import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import TimeSelect, { addClockMinutes, nextClockSlot } from './TimeSelect.jsx';
import AddressInput from './AddressInput.jsx';
import { api, LOGIN_URL } from '../lib/api.js';
import { eventIssueText } from '../lib/errors.js';
import { clockFloor, eventFormIssues, hasIssues, isClockRangeValid, localDateKey } from '../lib/validate.js';
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

export default function EventForm({ open, onClose, timeZone, places, onCreated }) {
  const { t } = useT();
  const rangeErrorId = useId();
  const startId = useId();
  const endId = useId();
  const [form, setForm] = useState(() => defaultForm(timeZone));
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(defaultForm(timeZone));
    setAttempted(false);
    setActionError(null);
  }, [open, timeZone]);

  const patch = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const close = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [onClose, saving]);

  const issues = useMemo(() => eventFormIssues(form, { timeZone }), [form, timeZone]);
  const canSubmit = !hasIssues(issues);
  const rangeIssue =
    !form.allDay && (issues.endTime === 'before_start' || issues.endTime === 'no_room')
      ? issues.endTime
      : null;
  const showIssue = (field) => (attempted || field === 'endTime' || field === 'startTime') && issues[field];
  const today = localDateKey(timeZone);
  const pastClock = form.date === today ? clockFloor(timeZone) : null;

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
      setForm(defaultForm(timeZone));
      setAttempted(false);
      onClose?.();
      await onCreated?.();
    } catch (error) {
      setActionError(
        error?.code === 'insufficient_scope'
          ? 'scope'
          : error?.code === 'invalid_range' || error?.code === 'invalid_time'
            ? 'range'
            : error?.code === 'invalid_title' ||
                error?.code === 'invalid_date' ||
                error?.code === 'date_in_past' ||
                error?.code === 'time_in_past'
              ? 'invalid'
              : 'unavailable',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('schedule.new')} description={t('schedule.newHint')}>
      <form
        className="space-y-3"
        onSubmit={submit}
        onReset={() => {
          setForm(defaultForm(timeZone));
          setAttempted(false);
          setActionError(null);
        }}
      >
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
            min={today}
            value={form.date}
            onChange={(event) => {
              const date = event.target.value;
              setForm((prev) => {
                const next = { ...prev, date };
                if (date === localDateKey(timeZone) && !prev.allDay && prev.startTime) {
                  const slot = nextClockSlot(timeZone);
                  const floor = clockFloor(timeZone);
                  if (prev.startTime <= floor) {
                    next.startTime = slot.start;
                    next.endTime = slot.end;
                  }
                }
                return next;
              });
            }}
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
                id={startId}
                name="start"
                label={t('schedule.start')}
                required
                value={form.startTime}
                minTime={pastClock}
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
                id={endId}
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
            {showIssue('startTime') && !rangeIssue && (
              <p role="alert" className="text-tone-rose-fg text-sm">
                {eventIssueText('startTime', issues.startTime)}
              </p>
            )}
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
        {showIssue('location') && (
          <p role="alert" className="text-tone-rose-fg -mt-2 text-xs">
            {eventIssueText('location', issues.location)}
          </p>
        )}
        <Field label={t('schedule.description')}>
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={form.description}
            onChange={(event) => patch('description', event.target.value)}
            maxLength={2000}
          />
          {showIssue('description') && (
            <p role="alert" className="text-tone-rose-fg mt-1 text-xs">
              {eventIssueText('description', issues.description)}
            </p>
          )}
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
  );
}
