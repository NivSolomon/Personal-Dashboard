import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { Spinner } from './BusyStatus.jsx';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import EventForm from './EventForm.jsx';
import ConfirmDelete from './ConfirmDelete.jsx';
import {
  CalendarIcon,
  ClockIcon,
  DumbbellIcon,
  FileIcon,
  PlusIcon,
  TrashIcon,
  VideoIcon,
} from './icons.jsx';
import { api, LOGIN_URL } from '../lib/api.js';
import { safeHttpUrl } from '../lib/urls.js';
import {
  applyMove,
  axisPct,
  chipLabelSide,
  clockFromMinutes,
  hourMarks,
  visibleRange,
  withConflicts,
} from '../lib/dayplan.js';
import { citedItemClass, isSourceActive, useHighlight } from '../lib/highlight.jsx';
import { useT } from '../lib/i18n.jsx';
import { SCAN_PREVIEW } from '../lib/widgets.js';

const CALENDAR_ROW = 52;
const SLIM_ROW = 40;

function localDateKey(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function nowMinutes(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function durationMin(block) {
  return Math.max(1, Math.round((block.endMin || 0) - (block.startMin || 0)));
}

function assignTracks(items) {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );
  const ends = [];
  const placed = sorted.map((item) => {
    let track = ends.findIndex((end) => end <= item.startMin);
    if (track === -1) {
      track = ends.length;
      ends.push(item.endMin);
    } else {
      ends[track] = item.endMin;
    }
    return { ...item, track };
  });
  const tracks = Math.max(1, ends.length);
  return placed.map((item) => ({ ...item, tracks }));
}

function BlockTip({ open, onOpenChange, title, lines, children }) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: 'top',
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { move: false, delay: { open: 70, close: 80 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <>
      {children(refs.setReference, getReferenceProps)}
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="border-border bg-surface text-foreground z-50 max-w-56 rounded-xl border px-3 py-2 text-xs shadow-lg"
          >
            <p className="font-semibold">{title}</p>
            {lines.map((line) => (
              <p key={line} className="text-muted mt-0.5">
                {line}
              </p>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

function EventChip({
  block,
  label,
  lines,
  left,
  width,
  top,
  height,
  conflict,
  cited,
  focused,
  dragging,
  labelSide,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onHover,
}) {
  const [open, setOpen] = useState(false);
  const weather = block.kind === 'weather';
  const outside = labelSide === 'before' || labelSide === 'after';
  const toneText = conflict
    ? 'text-rose-600 dark:text-rose-300'
    : weather
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-indigo-700 dark:text-indigo-300';

  return (
    <BlockTip
      open={open && !dragging}
      onOpenChange={setOpen}
      title={label}
      lines={lines}
    >
      {(setRef, getProps) => (
        <button
          ref={setRef}
          type="button"
          data-source-id={block.sourceId}
          {...getProps({
            onPointerDown: (event) => onPointerDown(event, block),
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            onMouseEnter: () => onHover(block.sourceId),
            onMouseLeave: () => onHover(null),
          })}
          className={`absolute rounded-lg px-2 py-1 text-start text-[11px] font-medium shadow-sm transition ${
            outside ? 'overflow-visible' : 'overflow-hidden'
          } ${
            block.movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
          } ${
            conflict
              ? 'bg-rose-600 text-white'
              : weather
                ? 'bg-emerald-600/85 text-white'
                : 'bg-indigo-600 text-white dark:bg-indigo-500'
          } ${cited || focused ? 'ring-2 ring-white' : ''} ${dragging ? 'opacity-90' : ''}`}
          style={{
            left: `${left}%`,
            width: `${width}%`,
            top,
            height,
          }}
        >
          {outside ? (
            <span
              className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold leading-tight ${toneText} ${
                labelSide === 'before' ? 'end-full me-1.5 text-end' : 'start-full ms-1.5 text-start'
              }`}
            >
              {label}
            </span>
          ) : (
            <>
              <span className="block truncate leading-tight">{label}</span>
              {width > 16 && (
                <span className="block truncate text-[10px] font-normal opacity-85">
                  {clockFromMinutes(block.startMin)}–{clockFromMinutes(block.endMin)}
                </span>
              )}
            </>
          )}
        </button>
      )}
    </BlockTip>
  );
}

function labelOf(block, t) {
  if (block.kind === 'weather') return t('timeline.train');
  return block.title;
}

function detailLines(block, t) {
  const range = `${clockFromMinutes(block.startMin)}–${clockFromMinutes(block.endMin)}`;
  const mins = t('timeline.minutes', { n: durationMin(block) });
  const lines = [range, mins];
  if (block.location) lines.push(block.location);
  lines.push(block.movable ? t('timeline.movable') : t('timeline.locked'));
  return lines;
}

function TimelineCard({ plan, events: calendarEvents = [], timeZone, loading, error, onChanged, places }) {
  const { t } = useT();
  const { hover, active } = useHighlight();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [removedIds, setRemovedIds] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [, setClock] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const drag = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => {
    setDraft(null);
    setActionError(null);
    setRemovedIds([]);
  }, [plan]);

  const eventById = useMemo(
    () => new Map((calendarEvents || []).map((item) => [item.id, item])),
    [calendarEvents],
  );

  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const live = draft || plan;
  const blocks = (live?.blocks || []).filter((block) => !removedIds.includes(block.id));
  const timed = blocks.filter(
    (block) => !block.allDay && Number.isFinite(block.startMin) && block.kind !== 'commute',
  );
  const allDay = blocks.filter((block) => block.allDay);
  const events = assignTracks(timed.filter((block) => block.kind === 'event'));
  const windows = timed.filter((block) => block.kind === 'weather');
  const needle = nowMinutes(timeZone);
  const view = visibleRange(timed, needle);
  const hours = hourMarks(view.start, view.end);
  const pct = (min) => axisPct(min, view.start, view.end);

  useEffect(() => {
    const node = trackRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => setTrackWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => observer.disconnect();
  }, [loading, timed.length]);

  const conflictIds = useMemo(() => {
    const ids = new Set();
    for (const row of live?.conflicts || []) {
      ids.add(row.a);
      ids.add(row.b);
    }
    return ids;
  }, [live?.conflicts]);

  const showNeedle = needle >= view.start && needle <= view.end;
  const needlePct = pct(needle);

  const toMin = (clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return view.start;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return view.start + ratio * (view.end - view.start);
  };

  const original = useMemo(
    () => new Map((plan?.blocks || []).map((block) => [block.id, block])),
    [plan],
  );
  const changed = timed.filter((block) => {
    if (!block.movable) return false;
    const prev = original.get(block.id);
    return prev && prev.startMin !== block.startMin;
  });

  const onHover = (sourceId) => {
    setFocusId(sourceId);
    hover(sourceId ? [sourceId] : []);
  };

  const onPointerDown = (event, block) => {
    if (!block.movable || saving) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: block.id, offset: toMin(event.clientX) - block.startMin };
    setDragging(true);
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    const nextStart = toMin(event.clientX) - drag.current.offset;
    setDraft((prev) => {
      const base = prev || plan;
      const nextBlocks = applyMove(base.blocks, drag.current.id, nextStart);
      return withConflicts({ ...base, blocks: nextBlocks });
    });
  };

  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const reset = () => {
    setDraft(null);
    setActionError(null);
  };

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
    } catch (err) {
      setActionError(err?.code === 'insufficient_scope' ? 'scope' : 'delete');
    } finally {
      setRemovingId(null);
    }
  };

  const apply = async () => {
    if (!changed.length || saving) return;
    const date = localDateKey(timeZone);
    const now = nowMinutes(timeZone);
    if (changed.some((block) => block.startMin < now)) {
      setActionError('past');
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      for (const block of changed) {
        await api.moveEvent(block.id, {
          date,
          startTime: clockFromMinutes(block.startMin),
          endTime: clockFromMinutes(block.endMin),
        });
      }
      setDraft(null);
      await onChanged?.();
    } catch (err) {
      setActionError(
        err?.code === 'time_in_past' || err?.code === 'date_in_past' ? 'past' : 'unavailable',
      );
    } finally {
      setSaving(false);
    }
  };

  const empty = !loading && !error && timed.length === 0 && allDay.length === 0;
  const overlapCount = (live?.conflicts || []).filter((row) => row.kind === 'overlap').length;
  const calendarH = CALENDAR_ROW * (events[0]?.tracks || 1);
  const showTrain = windows.length > 0;
  const agenda = [...timed].sort((a, b) => a.startMin - b.startMin);
  const upcoming = agenda.filter((block) => block.endMin > needle);
  const previewAgenda = (upcoming.length ? upcoming : agenda).slice(0, SCAN_PREVIEW);
  const extraAgenda = Math.max(0, agenda.length - previewAgenda.length);

  const hourGrid = (
    <>
      {hours.map((hour) => (
        <span
          key={hour}
          aria-hidden="true"
          className="border-border-subtle absolute inset-y-0 border-s"
          style={{ left: `${pct(hour * 60)}%` }}
        />
      ))}
      {showNeedle && (
        <>
          <span
            className="bg-background/55 dark:bg-background/45 pointer-events-none absolute inset-y-0"
            style={{ width: `${needlePct}%` }}
          />
          <span
            aria-hidden="true"
            className="bg-tone-rose-fg pointer-events-none absolute inset-y-0 z-20 w-0.5 rounded-full"
            style={{ left: `${needlePct}%` }}
          />
        </>
      )}
    </>
  );

  const deleteError =
    actionError === 'scope' || actionError === 'delete'
      ? actionError
      : null;

  return (
    <>
    <Card
      title={t('widget.timeline.title')}
      icon={<ClockIcon className="size-4.5" />}
      tone="indigo"
      layout="plain"
      skeleton="timeline"
      loading={loading}
      error={error}
      empty={empty}
      emptyText={t('timeline.empty')}
      badge={overlapCount ? String(overlapCount) : null}
      action={
        <div className="flex items-center gap-1.5">
          {!empty && !loading && (
            <button
              type="button"
              onClick={() => setDayOpen(true)}
              className="border-border text-foreground hover:bg-surface-hover rounded-lg border px-2.5 py-1.5 text-xs font-medium"
            >
              {t('timeline.openDay')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            title={t('schedule.new')}
            aria-label={t('schedule.new')}
            className="bg-tone-indigo text-tone-indigo-fg hover:opacity-90 grid size-8 place-items-center rounded-lg"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      }
      footer={
        deleteError ? (
          <p role="alert" className="text-tone-rose-fg text-sm">
            {deleteError === 'scope' ? (
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
        ) : extraAgenda > 0 ? (
          <button
            type="button"
            onClick={() => setDayOpen(true)}
            className="text-muted hover:text-foreground text-xs font-medium"
          >
            {t('scan.moreItems', { n: extraAgenda })}
          </button>
        ) : null
      }
    >
      {previewAgenda.length > 0 && (
        <ul className="space-y-1" aria-label={t('timeline.agenda')}>
          {previewAgenda.map((block) => (
            <li key={block.id}>
              <button
                type="button"
                onClick={() => setDayOpen(true)}
                data-source-id={block.sourceId}
                className={`hover:bg-surface-hover flex w-full items-start gap-3 rounded-xl px-2 py-1.5 text-start ${citedItemClass(isSourceActive(active, block.sourceId))}`}
              >
                <span className="text-muted w-10 shrink-0 pt-1 text-xs font-medium tabular-nums">
                  {clockFromMinutes(block.startMin)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-sm font-medium">
                    {labelOf(block, t)}
                  </span>
                  <span className="text-muted block truncate text-[11px]">
                    {`${clockFromMinutes(block.startMin)}–${clockFromMinutes(block.endMin)} · ${t('timeline.minutes', { n: durationMin(block) })}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>

    <Modal
      open={dayOpen}
      size="xl"
      title={t('widget.timeline.title')}
      description={t('widget.timeline.desc')}
      onClose={() => setDayOpen(false)}
    >
      <div className="scroll-area max-h-[min(75vh,44rem)] space-y-3 overflow-y-auto">
      {allDay.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {allDay.map((block) => (
            <li
              key={block.id}
              data-source-id={block.sourceId}
              className={`text-tone-indigo-fg bg-tone-indigo inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${citedItemClass(isSourceActive(active, block.sourceId))}`}
            >
              {t('timeline.allDay')}: {block.title}
              <button
                type="button"
                title={t('schedule.deleteEvent')}
                aria-label={t('schedule.deleteNamed', { title: block.title })}
                disabled={removingId === block.id}
                onClick={() => setPendingDelete(block)}
                className="ms-0.5 grid size-4 place-items-center rounded-full hover:bg-white/20 disabled:opacity-50"
              >
                <TrashIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <li className="text-muted flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-indigo-600 dark:bg-indigo-500" />
          {t('timeline.legendEvent')}
        </li>
        {showTrain && (
          <li className="text-muted flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-emerald-600" />
            {t('timeline.legendTrain')}
          </li>
        )}
        {showNeedle && (
          <li className="text-tone-rose-fg flex items-center gap-1.5 font-medium">
            <span className="bg-tone-rose-fg h-3 w-0.5 rounded-full" />
            {t('timeline.legendNow')} · {clockFromMinutes(needle)}
          </li>
        )}
      </ul>

      <div dir="ltr" className="select-none">
        <div className="flex gap-3">
          <div
            className="text-muted flex w-[4.75rem] shrink-0 flex-col text-[11px] font-medium"
            style={{ paddingTop: 18 }}
          >
            <div className="flex items-center" style={{ height: calendarH }}>
              {t('timeline.laneCalendar')}
            </div>
            {showTrain && (
              <div className="flex items-center" style={{ height: SLIM_ROW }}>
                {t('timeline.laneTrain')}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-subtle relative mb-1 h-[18px] text-[10px] tabular-nums">
              {hours.map((hour) => (
                <span
                  key={hour}
                  className={`absolute tabular-nums ${
                    hour * 60 === view.start ? 'translate-x-0' : '-translate-x-1/2'
                  }`}
                  style={{ left: `${pct(hour * 60)}%` }}
                >
                  {String(hour).padStart(2, '0')}
                </span>
              ))}
              {showNeedle && (
                <span
                  className="bg-tone-rose text-tone-rose-fg absolute z-30 -translate-x-1/2 rounded-full px-1.5 py-px text-[9px] font-semibold"
                  style={{ left: `${needlePct}%` }}
                >
                  {clockFromMinutes(needle)}
                </span>
              )}
            </div>

            <div
              ref={trackRef}
              className="bg-tone-neutral/80 relative overflow-visible rounded-xl"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div className="relative overflow-visible" style={{ height: calendarH }}>
                {hourGrid}
                {events.map((block) => {
                  const left = pct(block.startMin);
                  const width = Math.max(2, pct(block.endMin) - left);
                  const rowH = 100 / block.tracks;
                  const title = labelOf(block, t);
                  return (
                    <EventChip
                      key={block.id}
                      block={block}
                      label={title}
                      lines={detailLines(block, t)}
                      left={left}
                      width={width}
                      top={`calc(${block.track * rowH}% + 4px)`}
                      height={`calc(${rowH}% - 8px)`}
                      conflict={conflictIds.has(block.id)}
                      cited={isSourceActive(active, block.sourceId)}
                      focused={focusId === block.sourceId}
                      dragging={dragging}
                      labelSide={chipLabelSide(
                        block,
                        events,
                        view.start,
                        view.end,
                        trackWidth,
                        title,
                      )}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onHover={onHover}
                    />
                  );
                })}
              </div>

              {showTrain && (
                <div className="border-border-subtle relative border-t" style={{ height: SLIM_ROW }}>
                  {hourGrid}
                  {windows.map((block) => (
                    <EventChip
                      key={block.id}
                      block={block}
                      label={labelOf(block, t)}
                      lines={detailLines(block, t)}
                      left={pct(block.startMin)}
                      width={Math.max(2, pct(block.endMin) - pct(block.startMin))}
                      top="6px"
                      height="calc(100% - 12px)"
                      conflict={false}
                      cited={isSourceActive(active, block.sourceId)}
                      focused={focusId === block.sourceId}
                      dragging={dragging}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onHover={onHover}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {overlapCount > 0 && (
        <p className="text-tone-rose-fg mt-2 text-xs">
          {t('timeline.conflict', { n: overlapCount })}
        </p>
      )}

      {agenda.length > 0 && (
        <ul className="mt-4 space-y-1" aria-label={t('timeline.agenda')}>
          {agenda.map((block) => {
            const focused = focusId === block.sourceId || isSourceActive(active, block.sourceId);
            const event = block.kind === 'event' ? eventById.get(block.id) : null;
            const Icon = block.kind === 'weather' ? DumbbellIcon : CalendarIcon;
            const meetingUrl = safeHttpUrl(event?.meetingUrl);
            const files = event?.attachments?.slice(0, 2) || [];
            const meta = [
              `${clockFromMinutes(block.startMin)}–${clockFromMinutes(block.endMin)}`,
              t('timeline.minutes', { n: durationMin(block) }),
            ];
            if (event?.location) meta.push(event.location);
            else if (meetingUrl) meta.push(t('videoCall'));
            if (event?.attendees > 0) meta.push(t('attendees', { n: event.attendees }));
            return (
              <li key={block.id}>
                <div
                  data-source-id={block.sourceId}
                  onMouseEnter={() => onHover(block.sourceId)}
                  onMouseLeave={() => onHover(null)}
                  className={`flex items-start gap-3 rounded-xl px-2 py-1.5 transition ${
                    focused ? 'bg-surface-hover' : ''
                  } ${citedItemClass(isSourceActive(active, block.sourceId))}`}
                >
                  <span className="text-muted w-10 shrink-0 pt-1 text-xs font-medium tabular-nums">
                    {clockFromMinutes(block.startMin)}
                  </span>
                  <span
                    className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${
                      block.kind === 'weather'
                        ? 'bg-tone-green text-tone-green-fg'
                        : conflictIds.has(block.id)
                          ? 'bg-tone-rose text-tone-rose-fg'
                          : 'bg-tone-indigo text-tone-indigo-fg'
                    }`}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate text-sm font-medium">
                      {labelOf(block, t)}
                    </span>
                    <span className="text-muted block truncate text-[11px]">{meta.join(' · ')}</span>
                    {meetingUrl && (
                      <a
                        href={meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-tone-indigo-fg mt-1 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
                      >
                        <VideoIcon className="size-3.5" />
                        {t('joinCall')}
                      </a>
                    )}
                    {files.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {files.map((file) => (
                          <li key={file.url || file.title} className="truncate">
                            <a
                              href={safeHttpUrl(file.url) || undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-tone-blue-fg inline-flex items-center gap-1.5 text-xs hover:underline"
                            >
                              <FileIcon className="size-3.5 shrink-0" />
                              {file.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </span>
                  {block.kind === 'event' && (
                    <button
                      type="button"
                      title={t('schedule.deleteEvent')}
                      aria-label={t('schedule.deleteNamed', { title: block.title })}
                      disabled={removingId === block.id}
                      onClick={() => setPendingDelete(block)}
                      className="text-muted hover:text-tone-rose-fg mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg disabled:opacity-50"
                    >
                      {removingId === block.id ? <Spinner className="size-3.5" /> : <TrashIcon className="size-3.5" />}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!empty && !loading && (
        <div className="border-border-subtle flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          {changed.length > 0 ? (
            <>
              <p className="text-muted text-xs">{t('timeline.dragHint')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  disabled={saving}
                  className="border-border text-foreground hover:bg-surface-hover rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {t('timeline.reset')}
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={saving}
                  className="bg-tone-indigo text-tone-indigo-fg inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {saving && <Spinner className="size-3.5" />}
                  {saving ? t('timeline.saving') : t('timeline.apply')}
                </button>
              </div>
            </>
          ) : actionError ? (
            <p role="alert" className="text-tone-rose-fg text-sm">
              {actionError === 'past' ? t('timeline.cannotPast') : t('timeline.applyFail')}
            </p>
          ) : (
            <p className="text-muted text-xs">{t('timeline.dragHint')}</p>
          )}
        </div>
      )}
      </div>
    </Modal>
    <EventForm
      open={formOpen}
      onClose={() => setFormOpen(false)}
      timeZone={timeZone}
      places={places}
      onCreated={onChanged}
    />
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

export default memo(TimelineCard);
