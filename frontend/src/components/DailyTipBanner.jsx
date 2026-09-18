import { SparkleIcon } from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

export default function DailyTipBanner({ tip, load, loading }) {
  const { t } = useT();
  if (!loading && !tip) return null;

  const loadLabel = ['packed', 'moderate', 'light'].includes(load) ? t(`tip.${load}`) : null;

  return (
    <aside className="from-tip-from to-tip-to border-border relative mb-6 overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm sm:p-6">
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
        {loadLabel && (
          <span className="bg-tip-accent/10 text-tip-accent rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
            {loadLabel}
          </span>
        )}
      </div>

      {loading ? (
        <div className="relative mt-3 space-y-2">
          <div className="bg-tip-accent/15 h-4 w-11/12 max-w-xl animate-pulse rounded" />
          <div className="bg-tip-accent/10 h-4 w-2/3 max-w-lg animate-pulse rounded" />
        </div>
      ) : (
        <p className="text-foreground relative mt-3 max-w-3xl text-base leading-relaxed text-pretty sm:text-lg">
          {tip}
        </p>
      )}
    </aside>
  );
}
