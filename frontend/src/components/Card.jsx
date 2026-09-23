import { createContext, useContext, useEffect, useId, useState } from 'react';
import { AlertIcon, ChevronDownIcon } from './icons.jsx';
import { LOGIN_URL } from '../lib/api.js';
import { cardErrorCopy } from '../lib/errors.js';
import { citedItemClass, isSourceActive, useHighlight } from '../lib/highlight.jsx';
import { useT } from '../lib/i18n.jsx';

export const WidgetIdContext = createContext(null);

const OPEN_STORAGE_KEY = 'dashboard-card-open';
const NEVER_COLLAPSE = new Set(['summary', 'tip']);
const DEFAULT_OPEN = new Set(['timeline', 'tasks']);

function readOpenMap() {
  try {
    const raw = localStorage.getItem(OPEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeOpen(id, open) {
  try {
    localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify({ ...readOpenMap(), [id]: open }));
  } catch {
    /* Ignore quota / private-mode failures. */
  }
}

// Full class strings, not interpolated fragments, so Tailwind can see them.
const TONES = {
  indigo: 'bg-tone-indigo text-tone-indigo-fg',
  green: 'bg-tone-green text-tone-green-fg',
  amber: 'bg-tone-amber text-tone-amber-fg',
  blue: 'bg-tone-blue text-tone-blue-fg',
  rose: 'bg-tone-rose text-tone-rose-fg',
};

/**
 * Placeholders are shaped like the rows they stand in for, so the layout does not
 * jump when real data replaces them.
 */
function Skeleton({ variant }) {
  const rows = [0, 1, 2];

  if (variant === 'timeline') {
    return (
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row} className="flex animate-pulse gap-3">
            <div className="bg-skeleton h-3 w-12 shrink-0 rounded" />
            <div className="border-border-subtle flex-1 space-y-2 border-s-2 ps-3">
              <div className="bg-skeleton h-3 w-2/3 rounded" />
              <div className="bg-skeleton h-2.5 w-1/3 rounded" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (variant === 'checklist') {
    return (
      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row} className="flex animate-pulse items-start gap-3">
            <div className="bg-skeleton mt-1 size-3 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="bg-skeleton h-3 w-3/4 rounded" />
              <div className="bg-skeleton h-2.5 w-1/4 rounded" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row} className="animate-pulse space-y-2">
          <div className="flex justify-between gap-3">
            <div className="bg-skeleton h-3 w-1/3 rounded" />
            <div className="bg-skeleton h-2.5 w-10 rounded" />
          </div>
          <div className="bg-skeleton h-3 w-4/5 rounded" />
          <div className="bg-skeleton h-2.5 w-2/3 rounded" />
        </li>
      ))}
    </ul>
  );
}

function CardError({ error }) {
  const { t } = useT();
  const copy = cardErrorCopy(error);
  if (!copy) return null;

  return (
    <p className="bg-tone-rose text-tone-rose-fg flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>
        {copy.text}
        {copy.reconnect && (
          <>
            {' '}
            <a href={LOGIN_URL} className="font-medium underline">
              {t('reconnect')}
            </a>
          </>
        )}
      </span>
    </p>
  );
}

export default function Card({
  title,
  icon,
  count = null,
  // Replaces the count chip for cards that summarise rather than enumerate.
  badge = null,
  tone = 'indigo',
  loading = false,
  error = null,
  emptyText,
  skeleton = 'list',
  // 'plain' renders children as-is, for stat panels that are not lists.
  layout = 'list',
  empty,
  action = null,
  footer = null,
  overlay = null,
  sourceId = null,
  children,
}) {
  const { t } = useT();
  const { active, openedWidget } = useHighlight();
  const widgetId = useContext(WidgetIdContext);
  const collapsible = Boolean(widgetId) && !NEVER_COLLAPSE.has(widgetId);
  const bodyDomId = useId();
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true;
    const stored = readOpenMap()[widgetId];
    if (stored === true || stored === false) return stored;
    return DEFAULT_OPEN.has(widgetId);
  });

  useEffect(() => {
    if (!collapsible) return;
    if (openedWidget?.widget === widgetId) {
      setOpen(true);
      writeOpen(widgetId, true);
    }
  }, [collapsible, openedWidget, widgetId]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (widgetId) writeOpen(widgetId, next);
      return next;
    });
  };

  const isEmpty = !loading && !error && (empty ?? count === 0);
  const toneClasses = TONES[tone] ?? TONES.indigo;
  const emptyCopy = emptyText || t('empty');
  const chip = badge ?? (count === null ? null : count);
  const cited = sourceId && isSourceActive(active, sourceId);
  const showBody = !collapsible || open;

  return (
    <>
    <section className="border-border bg-surface flex flex-col overflow-hidden rounded-2xl border shadow-sm">
      <header
        className={`flex items-center gap-2 px-5 py-4 ${
          showBody ? 'border-border-subtle border-b' : ''
        }`}
      >
        {collapsible ? (
          <h2 className="min-w-0 flex-1">
            <button
              type="button"
              className="text-foreground flex w-full min-w-0 items-center gap-2.5 text-start text-sm font-semibold"
              aria-expanded={open}
              aria-controls={bodyDomId}
              aria-label={open ? t('card.collapse', { title }) : t('card.expand', { title })}
              onClick={toggle}
            >
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${toneClasses}`}>
                {icon}
              </span>
              <span className="min-w-0 truncate">{title}</span>
              <ChevronDownIcon
                className={`text-muted size-4 shrink-0 transition-transform duration-200 ${
                  open ? 'rotate-180' : ''
                }`}
              />
            </button>
          </h2>
        ) : (
          <h2 className="text-foreground flex min-w-0 flex-1 items-center gap-2.5 text-sm font-semibold">
            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${toneClasses}`}>
              {icon}
            </span>
            {title}
          </h2>
        )}
        <div
          className="relative z-10 flex shrink-0 items-center gap-2"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {chip !== null && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${toneClasses}`}
            >
              {loading ? '—' : chip}
            </span>
          )}
          {action}
        </div>
      </header>

      {/* Capped so one long list cannot stretch its grid row past the others. */}
      <div
        id={collapsible ? bodyDomId : undefined}
        hidden={!showBody}
        data-source-id={sourceId || undefined}
        className={`scroll-area max-h-112 flex-1 overflow-y-auto px-5 py-4 ${citedItemClass(cited)}`}
      >
        {loading && <Skeleton variant={skeleton} />}
        {error && <CardError error={error} />}
        {isEmpty && <p className="text-subtle py-8 text-center text-sm text-balance">{emptyCopy}</p>}
        {/* Keep tools/modals mounted while the card is collapsed, loading, or empty.
            Native dialogs used to live in this hidden subtree and call showModal(),
            which left the page inert with no visible window. */}
        <div hidden={loading || Boolean(error) || isEmpty}>
          {layout === 'list' ? <ul className="space-y-4">{children}</ul> : children}
        </div>
      </div>
      {footer && !loading && showBody && (
        <div className="border-border-subtle border-t px-5 py-3">{footer}</div>
      )}
    </section>
    {overlay}
    </>
  );
}
