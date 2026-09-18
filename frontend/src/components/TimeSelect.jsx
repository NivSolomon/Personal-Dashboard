import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDownIcon, ClockIcon } from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

export const MINUTE_STEP = 15;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const MINUTES = [0, 15, 30, 45];

export function padTime(value) {
  return String(value).padStart(2, '0');
}

export function formatClock(hour, minute) {
  return `${padTime(hour)}:${padTime(minute)}`;
}

export function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  const hour = match ? Math.min(23, Number(match[1])) : 9;
  const minute = match ? Number(match[2]) : 0;
  const snapped = Math.round(minute / MINUTE_STEP) * MINUTE_STEP;
  if (snapped === 60) return { hour: Math.min(23, hour + 1), minute: 0 };
  return { hour, minute: snapped };
}

export function addClockMinutes(value, minutes) {
  const { hour, minute } = parseClock(value);
  const max = 23 * 60 + (60 - MINUTE_STEP);
  const total = Math.max(0, Math.min(max, hour * 60 + minute + minutes));
  const snapped = Math.round(total / MINUTE_STEP) * MINUTE_STEP;
  return formatClock(Math.floor(snapped / 60), snapped % 60);
}

/** Next 15-minute wall-clock slot in the user's timezone, with room for a one-hour event. */
export function nextClockSlot(timeZone, extraMinutes = 60) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 9) % 24;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  let start = addClockMinutes(formatClock(hour, minute), extraMinutes);
  if (parseClock(start).hour >= 23) start = '22:00';
  return { start, end: addClockMinutes(start, 60) };
}

function ClockMenu({ id, labelledBy, describedBy, name, value, onChange, disabled, required, options, invalid = false }) {
  const listId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      {name && <input type="hidden" name={name} value={value} required={required && value !== ''} />}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-controls={listId}
        className="text-foreground hover:bg-surface-hover w-full cursor-pointer rounded-md py-1.5 pe-6 ps-1.5 text-center text-sm font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setOpen((next) => !next)}
      >
        {selected?.label || value || '—'}
      </button>
      <ChevronDownIcon className="text-muted pointer-events-none absolute top-1/2 end-1 size-3.5 -translate-y-1/2" />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelledBy}
          className="border-border bg-surface absolute inset-x-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border py-1 shadow-lg"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value === '' ? 'empty' : option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={`w-full px-2 py-1.5 text-center text-sm font-medium tabular-nums ${
                    option.disabled
                      ? 'text-subtle cursor-not-allowed'
                      : isSelected
                        ? 'bg-surface-hover text-foreground'
                        : 'text-foreground hover:bg-surface-hover'
                  }`}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Two short native lists (hour + 15-minute steps) instead of a 1-minute time spinner.
 * Times stay LTR so 09:15 reads in the usual order inside the RTL form.
 */
export default function TimeSelect({
  id,
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  name,
  emptyLabel = null,
  minTime = null,
  invalid = false,
  describedBy,
}) {
  const autoId = useId();
  const { t } = useT();
  const baseId = id || autoId;
  const labelId = `${baseId}-label`;
  const hourId = `${baseId}-hour`;
  const minuteId = `${baseId}-minute`;
  const hourLabelId = `${baseId}-hour-label`;
  const minuteLabelId = `${baseId}-minute-label`;
  const isEmpty = !value && Boolean(emptyLabel);
  const { hour, minute } = isEmpty ? { hour: 0, minute: 0 } : parseClock(value);

  const afterMin = (nextHour, nextMinute) =>
    !minTime || formatClock(nextHour, nextMinute) > minTime;
  const hourBlocked = (nextHour) => MINUTES.every((item) => !afterMin(nextHour, item));

  const emit = (nextHour, nextMinute) => {
    const validMinute =
      MINUTES.find((item) => afterMin(nextHour, item) && item === nextMinute) ??
      MINUTES.find((item) => afterMin(nextHour, item));
    if (validMinute == null) return;
    onChange(formatClock(nextHour, validMinute));
  };

  return (
    <fieldset disabled={disabled} className="min-w-0" aria-describedby={describedBy}>
      <legend id={labelId} className="text-muted mb-1.5 text-sm font-medium">
        {label}
      </legend>
      <div
        dir="ltr"
        className={`bg-background focus-within:border-ring flex min-h-11 items-center gap-1 rounded-lg border px-2 ${
          invalid ? 'border-tone-rose-fg' : 'border-border'
        }`}
      >
        <ClockIcon className="text-muted size-4 shrink-0" />
        <span id={hourLabelId} className="sr-only">
          {t('time.hour', { label })}
        </span>
        <ClockMenu
          id={hourId}
          name={name ? `${name}Hour` : undefined}
          labelledBy={`${labelId} ${hourLabelId}`}
          describedBy={describedBy}
          invalid={invalid}
          value={isEmpty ? '' : padTime(hour)}
          required={required && !emptyLabel}
          disabled={disabled}
          options={[
            ...(emptyLabel ? [{ value: '', label: emptyLabel }] : []),
            ...HOURS.map((item) => ({
              value: padTime(item),
              label: padTime(item),
              disabled: hourBlocked(item),
            })),
          ]}
          onChange={(next) => {
            if (next === '') onChange('');
            else emit(Number(next), isEmpty ? 0 : minute);
          }}
        />
        <span className="text-muted px-0.5 text-sm font-semibold" aria-hidden="true">
          :
        </span>
        <span id={minuteLabelId} className="sr-only">
          {t('time.minutes', { label })}
        </span>
        <ClockMenu
          id={minuteId}
          name={name ? `${name}Minute` : undefined}
          labelledBy={`${labelId} ${minuteLabelId}`}
          describedBy={describedBy}
          invalid={invalid}
          value={isEmpty ? '' : padTime(minute)}
          required={required && !emptyLabel}
          disabled={disabled || isEmpty}
          options={[
            ...(isEmpty ? [{ value: '', label: '—' }] : []),
            ...MINUTES.map((item) => ({
              value: padTime(item),
              label: padTime(item),
              disabled: !afterMin(hour, item),
            })),
          ]}
          onChange={(next) => emit(hour, Number(next))}
        />
      </div>
    </fieldset>
  );
}
