import { memo } from 'react';
import { RefreshIcon, SparkleIcon } from './icons.jsx';
import { useHighlight, widgetOfSource } from '../lib/highlight.jsx';
import { useT } from '../lib/i18n.jsx';

function DailyTipBanner({ tip, load, loading, refreshing = false, sources = [] }) {
  const { t } = useT();
  const { hover, focusWidget, active } = useHighlight();
  const busy = loading || refreshing;
  if (!busy && !tip) return null;

  const loadLabel = ['packed', 'moderate', 'light'].includes(load) ? t(`tip.${load}`) : null;
  const cited = sources.length > 0;
  const lit = cited && sources.some((id) => active.includes(id));
  const showSkeleton = busy && !tip;

  const openSources = () => {
    if (!cited) return;
    hover(sources);
    focusWidget(widgetOfSource(sources[0]), sources[0]);
  };

  return (
    <aside
      data-widget-id="tip"
      className={`from-tip-from to-tip-to border-border relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm sm:p-6 ${
        lit ? 'ring-2 ring-indigo-400/80' : ''
      }`}
      aria-busy={busy}
    >
      <div
        aria-hidden="true"
        className="text-tip-accent/15 pointer-events-none absolute -top-8 -start-3 font-serif text-[7rem] leading-none select-none"
      >
        ”
      </div>
      <div
        aria-hidden="true"
        className="bg-tip-accent/10 pointer-events-none absolute -bottom-16 -end-10 size-48 rounded-full blur-3xl"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <p className="text-tip-accent flex items-center gap-2 text-xs font-semibold tracking-wide">
          <SparkleIcon className="size-3.5" />
          {t('widget.tip.title')}
        </p>
        <span className="flex items-center gap-2">
          {busy && (
            <span className="text-tip-accent inline-flex items-center gap-1.5 text-[11px] font-semibold">
              <RefreshIcon className="size-3.5 animate-spin" />
              {t('summary.refreshing')}
            </span>
          )}
          {loadLabel && !busy && (
            <span className="bg-tip-accent/10 text-tip-accent rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
              {loadLabel}
            </span>
          )}
        </span>
      </div>

      {showSkeleton ? (
        <div className="relative mt-3 space-y-2" aria-live="polite">
          <div className="bg-tip-accent/15 h-4 w-11/12 max-w-xl animate-pulse rounded" aria-hidden="true" />
          <div className="bg-tip-accent/10 h-4 w-2/3 max-w-lg animate-pulse rounded" aria-hidden="true" />
          <p className="text-tip-accent pt-1 text-xs">{t('tip.updating')}</p>
        </div>
      ) : (
        <p
          className={`text-foreground relative mt-3 max-w-3xl text-base leading-relaxed text-pretty sm:text-lg ${
            cited ? 'cursor-pointer' : ''
          }`}
          aria-live="polite"
          onMouseEnter={() => cited && hover(sources)}
          onMouseLeave={() => hover([])}
          onClick={openSources}
        >
          {tip}
        </p>
      )}
    </aside>
  );
}

export default memo(DailyTipBanner);
