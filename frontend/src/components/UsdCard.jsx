import Card from './Card.jsx';
import { DollarIcon } from './icons.jsx';
import { localeOf, useT } from '../lib/i18n.jsx';

function formatRate(value, language) {
  if (value == null) return '—';
  return value.toLocaleString(localeOf(language), { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function UsdCard({ quote, loading, error }) {
  const { t, language } = useT();
  const up = (quote?.change || 0) > 0;
  const down = (quote?.change || 0) < 0;
  const changeClass = up
    ? 'text-tone-green-fg'
    : down
      ? 'text-tone-rose-fg'
      : 'text-muted';

  return (
    <Card
      title={t('widget.usd.title')}
      icon={<DollarIcon className="size-4.5" />}
      tone="green"
      badge={quote ? `$${formatRate(quote.rate, language)}` : null}
      loading={loading}
      error={error}
      layout="plain"
      empty={!quote}
      emptyText={t('usd.empty')}
    >
      {quote && (
        <div>
          <p className="text-foreground text-3xl font-bold tabular-nums">
            {formatRate(quote.rate, language)}
            <span className="text-muted ms-2 text-sm font-medium">{t('usd.perDollar')}</span>
          </p>
          {quote.change != null && (
            <p className={`mt-1 text-sm font-medium tabular-nums ${changeClass}`}>
              {up ? '+' : ''}
              {formatRate(quote.change, language)} ({up ? '+' : ''}
              {quote.changePct}%) {t('usd.vsClose')}
            </p>
          )}
          {quote.asOf && (
            <p className="text-subtle mt-3 text-xs">{t('usd.asOf', { date: quote.asOf })}</p>
          )}
        </div>
      )}
    </Card>
  );
}
