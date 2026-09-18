import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { watchlistErrorText } from '../lib/errors.js';
import { ChartIcon, PlusIcon } from './icons.jsx';
import { alertOpLabel, currencyLabel, moneyLabel } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

const inputClass =
  'border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm';

export default function WatchlistEditor({ onAdded, busy = false, compact = false }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState(null);
  const [kind, setKind] = useState('stock');
  const [withAlert, setWithAlert] = useState(false);
  const [op, setOp] = useState('above');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [quoteMeta, setQuoteMeta] = useState(null);

  useEffect(() => {
    const q = query.trim();
    if (picked && q === picked.symbol) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    if (q.length < 1) {
      setResults([]);
      setSearched(false);
      return undefined;
    }

    const handle = setTimeout(() => {
      setSearching(true);
      api
        .searchQuotes(q)
        .then((body) => {
          setResults(body.quotes || []);
          setSearched(true);
        })
        .catch((err) => setError(err.code || 'search_unavailable'))
        .finally(() => setSearching(false));
    }, 280);

    return () => clearTimeout(handle);
  }, [query, picked]);

  useEffect(() => {
    const symbol = (picked?.symbol || query).trim();
    if (!withAlert || symbol.length < 1) {
      if (!picked) setQuoteMeta(null);
      return undefined;
    }

    let cancelled = false;
    const handle = setTimeout(
      () => {
        api
          .quote(symbol)
          .then((body) => {
            if (!cancelled) setQuoteMeta(body.quote || null);
          })
          .catch((err) => {
            if (!cancelled) {
              setQuoteMeta(null);
              if (err.code === 'unsupported_currency') setError('unsupported_currency');
            }
          });
      },
      picked ? 0 : 350,
    );

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [withAlert, picked, query]);

  const choose = (quote) => {
    setPicked(quote);
    setQuery(quote.symbol);
    setKind(quote.kind || 'stock');
    setResults([]);
    setSearched(false);
    setError(null);
    setQuoteMeta(quote.currency ? { currency: quote.currency, price: quote.price ?? null } : null);
  };

  const submit = async (event) => {
    event.preventDefault();
    const symbol = (picked?.symbol || query).trim();
    if (!symbol || saving || busy) return;
    const alertPrice = Number(price);
    if (withAlert && (!Number.isFinite(alertPrice) || alertPrice <= 0)) {
      setError('invalid_price');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await api.addWatchlistItem({
        symbol,
        name: picked?.name,
        kind,
        alert: withAlert ? { op, price: alertPrice } : undefined,
      });
      setQuery('');
      setPicked(null);
      setResults([]);
      setSearched(false);
      setWithAlert(false);
      setPrice('');
      setQuoteMeta(null);
      await onAdded?.(updated);
    } catch (err) {
      setError(err.code || 'unavailable');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={submit}>
      {!compact && (
        <p className="text-muted text-xs">
          {t('watch.searchHint')}
        </p>
      )}

      <div className="relative">
        <input
          className={inputClass}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPicked(null);
            setError(null);
            setSearched(false);
          }}
          placeholder="AAPL, VOO, TEVA.TA…"
          autoComplete="off"
          maxLength={40}
        />
        {(results.length > 0 || searching || (searched && !picked)) && (
          <ul className="border-border bg-surface absolute inset-x-0 z-20 mt-1 max-h-48 overflow-auto rounded-lg border shadow-lg">
            {searching && results.length === 0 && (
              <li className="text-muted px-3 py-2 text-xs">{t('watch.searching')}</li>
            )}
            {!searching && searched && results.length === 0 && (
              <li className="text-muted px-3 py-2 text-xs">{t('watch.noResults')}</li>
            )}
            {results.map((quote) => (
              <li key={quote.symbol}>
                <button
                  type="button"
                  onClick={() => choose(quote)}
                  className="hover:bg-surface-hover flex w-full items-center justify-between gap-3 px-3 py-2 text-start"
                >
                  <span className="min-w-0">
                    <span className="text-foreground block truncate text-sm font-medium">
                      {quote.name}
                    </span>
                    <span className="text-muted block text-xs">
                      {quote.symbol}
                      {quote.exchange ? ` · ${quote.exchange}` : ''}
                      {currencyLabel(quote.currency) ? ` · ${currencyLabel(quote.currency)}` : ''}
                    </span>
                  </span>
                  <span className="bg-tone-neutral text-tone-neutral-fg shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
                    {t(`kind.${quote.kind}`) === `kind.${quote.kind}` ? quote.kind : t(`kind.${quote.kind}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {['stock', 'fund'].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              kind === value
                ? 'bg-tone-green text-tone-green-fg'
                : 'bg-tone-neutral text-tone-neutral-fg'
            }`}
          >
            {t(`kind.${value}`)}
          </button>
        ))}
      </div>

      <label className="text-foreground flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-ring size-4"
          checked={withAlert}
          onChange={(event) => setWithAlert(event.target.checked)}
        />
        {t('watch.priceAlert')}
      </label>

      {withAlert && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select className={inputClass} value={op} onChange={(event) => setOp(event.target.value)}>
              <option value="above">{alertOpLabel('above', quoteMeta?.currency)}</option>
              <option value="below">{alertOpLabel('below', quoteMeta?.currency)}</option>
            </select>
            <div className="relative">
              <input
                className={`${inputClass} ${quoteMeta?.currency ? 'pe-16' : ''}`}
                type="number"
                min="0.01"
                step="any"
                placeholder={
                  currencyLabel(quoteMeta?.currency)
                    ? t('watch.priceIn', { currency: currencyLabel(quoteMeta.currency) })
                    : t('watch.priceUsdNis')
                }
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required={withAlert}
              />
              {currencyLabel(quoteMeta?.currency) && (
                <span className="text-muted pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-medium">
                  {currencyLabel(quoteMeta.currency)}
                </span>
              )}
            </div>
          </div>
          {quoteMeta?.price != null && (
            <p className="text-muted text-xs">
              {t('watch.nowPrice', { price: moneyLabel(quoteMeta.price, quoteMeta.currency) })}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-tone-rose-fg text-xs">{watchlistErrorText(error)}</p>}

      <button
        type="submit"
        disabled={saving || busy || !query.trim()}
        className="bg-tone-green text-tone-green-fg inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? (
          t('watch.adding')
        ) : (
          <>
            <PlusIcon className="size-4" />
            {withAlert ? t('watch.addBoth') : t('watch.addBoard')}
          </>
        )}
      </button>
      {!compact && (
        <p className="text-subtle flex items-center gap-1.5 text-[11px]">
          <ChartIcon className="size-3.5" />
          {t('watch.addMore')}
        </p>
      )}
    </form>
  );
}
