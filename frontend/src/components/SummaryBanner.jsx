import { memo } from 'react';
import { Spinner } from './BusyStatus.jsx';
import { SparkleIcon } from './icons.jsx';
import { relativeTime } from '../lib/format.js';
import { summaryErrorText, summaryThrottleText } from '../lib/errors.js';
import { useHighlight, widgetOfSource } from '../lib/highlight.jsx';
import { useT } from '../lib/i18n.jsx';

function SummaryBanner({ summary, loading, error, refreshing, onRetry }) {
  const { t } = useT();
  const { hover, focusWidget } = useHighlight();
  const busy = loading || refreshing;
  const sentences =
    summary?.sentences?.length > 0
      ? summary.sentences
      : summary?.text
        ? [{ text: summary.text, sources: [] }]
        : [];
  const showSkeleton = loading && sentences.length === 0;

  const openSources = (sources) => {
    const ids = Array.isArray(sources) ? sources : [];
    hover(ids);
    const first = ids[0];
    if (first) focusWidget(widgetOfSource(first), first);
  };

  return (
    <section
      className="from-banner-from to-banner-to relative overflow-hidden rounded-2xl bg-gradient-to-br p-6 text-white shadow-lg sm:p-8"
      aria-busy={busy}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -end-20 size-64 rounded-full bg-white/15 blur-3xl"
      />

      <div className="relative flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white/70">
          <SparkleIcon className="size-4" />
          {t('widget.summary.title')}
        </h2>
        {refreshing && sentences.length > 0 && (
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/70">
            <Spinner className="size-3" />
            {t('summary.refreshing')}
          </p>
        )}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {showSkeleton ? (
          <div className="relative mt-5 space-y-2.5">
            <div className="h-4 animate-pulse rounded bg-white/25" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-white/25" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/25" />
            <p className="flex items-center gap-2 pt-2 text-xs text-white/70">
              <Spinner className="size-3.5" />
              {t('summary.reading')}
            </p>
          </div>
        ) : error && sentences.length === 0 ? (
          <p className="relative mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90">
            {summaryErrorText(error)}{' '}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="font-medium underline underline-offset-2"
              >
                {t('retry')}
              </button>
            )}
          </p>
        ) : (
          <p className="relative mt-4 max-w-3xl text-lg leading-relaxed text-pretty sm:text-xl">
            {sentences.map((row, index) => {
              const cited = row.sources?.length > 0;
              return (
                <span
                  key={`${index}-${row.text.slice(0, 12)}`}
                  onMouseEnter={() => cited && hover(row.sources)}
                  onMouseLeave={() => hover([])}
                  onClick={() => cited && openSources(row.sources)}
                  onKeyDown={(event) => {
                    if (cited && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      openSources(row.sources);
                    }
                  }}
                  role={cited ? 'button' : undefined}
                  tabIndex={cited ? 0 : undefined}
                  className={
                    cited
                      ? 'cursor-pointer rounded-sm decoration-white/40 underline-offset-4 hover:bg-white/15 hover:underline focus-visible:bg-white/15'
                      : undefined
                  }
                >
                  {row.text}
                  {index < sentences.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </p>
        )}
      </div>

      {summary?.throttled && (
        <p className="relative mt-4 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90">
          {summaryThrottleText(summary.retryInSeconds)}
        </p>
      )}

      {summary?.generatedAt && !showSkeleton && (
        <p className="relative mt-5 text-xs text-white/60">
          {t('summary.updated', { when: relativeTime(summary.generatedAt) })}
        </p>
      )}
    </section>
  );
}

export default memo(SummaryBanner);
