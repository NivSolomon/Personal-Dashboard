import { RefreshIcon, SparkleIcon } from './icons.jsx';
import { relativeTime } from '../lib/format.js';
import { summaryErrorText, summaryThrottleText } from '../lib/errors.js';
import { useT } from '../lib/i18n.jsx';

export default function SummaryBanner({ summary, loading, error, refreshing, onRefresh }) {
  const { t } = useT();
  const busy = loading || refreshing;

  return (
    <section className="from-banner-from to-banner-to relative overflow-hidden rounded-2xl bg-gradient-to-br p-6 text-white shadow-lg sm:p-8">
      {/* Soft highlight, so the large flat gradient reads as lit rather than printed. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -end-20 size-64 rounded-full bg-white/15 blur-3xl"
      />

      <div className="relative flex items-start justify-between gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white/70">
          <SparkleIcon className="size-4" />
          {t('widget.summary.title')}
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium transition hover:bg-white/25 focus-visible:outline-white disabled:opacity-50"
        >
          <RefreshIcon className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? t('summary.refreshing') : error ? t('retry') : t('summary.refresh')}
        </button>
      </div>

      {busy ? (
        <div className="relative mt-5 space-y-2.5">
          <div className="h-4 animate-pulse rounded bg-white/25" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-white/25" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/25" />
          <p className="pt-2 text-xs text-white/70">{t('summary.reading')}</p>
        </div>
      ) : error ? (
        <p className="relative mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90">
          {summaryErrorText(error)}
        </p>
      ) : (
        <p className="relative mt-4 max-w-3xl text-lg leading-relaxed whitespace-pre-line text-pretty sm:text-xl">
          {summary?.text}
        </p>
      )}

      {summary?.throttled && (
        <p className="relative mt-4 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90">
          {summaryThrottleText(summary.retryInSeconds)}
        </p>
      )}

      {summary?.generatedAt && !busy && (
        <p className="relative mt-5 text-xs text-white/60">
          {t('summary.updated', { when: relativeTime(summary.generatedAt) })}
        </p>
      )}
    </section>
  );
}
