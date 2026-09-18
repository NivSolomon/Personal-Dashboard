import { useEffect, useState } from 'react';
import Card from './Card.jsx';
import WatchlistEditor from './WatchlistEditor.jsx';
import { BellIcon, ChartIcon, PlusIcon, TrashIcon } from './icons.jsx';
import { api } from '../lib/api.js';
import { watchlistErrorText } from '../lib/errors.js';
import { alertOpLabel, alertSideLabel, currencyLabel, moneyLabel } from '../lib/format.js';
import { tr, useT } from '../lib/i18n.jsx';
import { playUi } from '../lib/sounds.js';

function notifyBrowser(fired) {
  if (!fired.length || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  const key = fired.map((hit) => `${hit.alertId}:${hit.firedAt}`).join('|');
  if (sessionStorage.getItem('watchlist-notified') === key) return;
  sessionStorage.setItem('watchlist-notified', key);
  playUi('alert');
  const hit = fired[0];
  const currency = hit.currency;
  new Notification(tr('watch.notifyTitle', { symbol: hit.symbol }), {
    body: `${hit.name || hit.symbol} ${alertSideLabel(hit.op)} ${moneyLabel(hit.target, currency)}`,
  });
}

function AlertLine({ item, alert, onRemove, removing }) {
  const { t } = useT();
  const currency = item.quote?.currency || item.currency;
  const live = alert.triggered
    ? 'bg-tone-rose text-tone-rose-fg'
    : 'bg-tone-neutral text-tone-neutral-fg';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${live}`}>
      {alertSideLabel(alert.op)} {moneyLabel(alert.price, currency)}
      <button
        type="button"
        title={t('watch.deleteAlert')}
        aria-label={t('watch.deleteAlert')}
        disabled={removing}
        onClick={() => onRemove(alert.id)}
        className="opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </span>
  );
}

export default function WatchlistCard({
  watchlist,
  loading,
  error,
  onAccountChange,
}) {
  const { t } = useT();
  const items = watchlist?.items || [];
  const fired = watchlist?.fired || [];
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [addingAlertFor, setAddingAlertFor] = useState(null);
  const [alertOp, setAlertOp] = useState('above');
  const [alertPrice, setAlertPrice] = useState('');
  const [notifyHint, setNotifyHint] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'default',
  );

  useEffect(() => {
    notifyBrowser(fired);
  }, [fired]);

  const afterChange = async (updated) => {
    onAccountChange?.(updated);
  };

  const run = async (key, work) => {
    setBusy(key);
    setActionError(null);
    try {
      await afterChange(await work());
    } catch (err) {
      setActionError(err.code || 'unavailable');
    } finally {
      setBusy(null);
    }
  };

  const ackAll = () =>
    run(
      'ack',
      () => api.ackWatchlistAlerts(fired.map((hit) => hit.alertId)),
    );

  const addAlert = async (event, itemId) => {
    event.preventDefault();
    const price = Number(alertPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setActionError('invalid_price');
      return;
    }
    await run(`alert-${itemId}`, () => api.addWatchlistAlert(itemId, { op: alertOp, price }));
    setAddingAlertFor(null);
    setAlertPrice('');
  };

  const enableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotifyHint(permission === 'default');
  };

  return (
    <Card
      title={t('widget.watchlist.title')}
      icon={<ChartIcon className="size-4.5" />}
      tone="green"
      count={items.length}
      loading={loading}
      error={error}
      layout="plain"
      empty={false}
    >
      <div className="space-y-4">
        {fired.length > 0 && (
          <div className="bg-tone-rose text-tone-rose-fg flex items-start justify-between gap-3 rounded-xl px-3 py-2.5">
            <p className="flex items-start gap-2 text-sm">
              <BellIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {fired.length === 1
                  ? t('watch.firedOne', {
                      symbol: fired[0].symbol,
                      side: alertSideLabel(fired[0].op),
                      price: moneyLabel(fired[0].target, fired[0].currency),
                    })
                  : t('watch.firedMany', { n: fired.length })}
              </span>
            </p>
            <button
              type="button"
              onClick={ackAll}
              disabled={busy === 'ack'}
              className="shrink-0 text-xs font-medium underline disabled:opacity-50"
            >
              {t('watch.ack')}
            </button>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-muted text-sm text-balance">
            {t('watch.empty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const quote = item.quote;
              const up = (quote?.change || 0) > 0;
              const down = (quote?.change || 0) < 0;
              const changeClass = up
                ? 'text-tone-green-fg'
                : down
                  ? 'text-tone-rose-fg'
                  : 'text-muted';
              const hot = item.alerts?.some((alert) => alert.triggered);

              return (
                <li
                  key={item.id}
                  className={`border-border-subtle rounded-xl border px-3 py-2.5 ${
                    hot ? 'border-tone-rose-fg/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-foreground truncate text-sm font-medium">{item.name}</p>
                      <p className="text-muted text-xs">
                        {item.symbol}
                        <span className="ms-1.5">{t(`kind.${item.kind}`) === `kind.${item.kind}` ? item.kind : t(`kind.${item.kind}`)}</span>
                        {currencyLabel(quote?.currency || item.currency) ? (
                          <span className="ms-1.5">
                            {currencyLabel(quote?.currency || item.currency)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-foreground text-sm font-semibold tabular-nums">
                        {moneyLabel(quote?.price, quote?.currency || item.currency)}
                      </p>
                      {quote?.changePct != null && (
                        <p className={`text-xs tabular-nums ${changeClass}`}>
                          {up ? '+' : ''}
                          {quote.changePct}%
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(item.alerts || []).map((alert) => (
                      <AlertLine
                        key={alert.id}
                        item={item}
                        alert={alert}
                        removing={busy === `del-alert-${alert.id}`}
                        onRemove={(alertId) =>
                          run(`del-alert-${alertId}`, () =>
                            api.removeWatchlistAlert(item.id, alertId),
                          )
                        }
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setAddingAlertFor((id) => (id === item.id ? null : item.id))
                      }
                      className="text-muted hover:text-foreground inline-flex items-center gap-1 text-[11px] font-medium"
                    >
                      <PlusIcon className="size-3" />
                      {t('watch.alert')}
                    </button>
                    <button
                      type="button"
                      title={t('watch.remove')}
                      aria-label={t('settings.removeNamed', { symbol: item.symbol })}
                      disabled={busy === `del-${item.id}`}
                      onClick={() => run(`del-${item.id}`, () => api.removeWatchlistItem(item.id))}
                      className="text-muted hover:text-tone-rose-fg ms-auto"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>

                  {addingAlertFor === item.id && (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(event) => addAlert(event, item.id)}
                    >
                      <select
                        className="border-border bg-background text-foreground rounded-lg border px-2 py-1 text-xs"
                        value={alertOp}
                        onChange={(event) => setAlertOp(event.target.value)}
                      >
                        <option value="above">
                          {alertOpLabel('above', item.quote?.currency || item.currency)}
                        </option>
                        <option value="below">
                          {alertOpLabel('below', item.quote?.currency || item.currency)}
                        </option>
                      </select>
                      <div className="relative">
                        <input
                          className="border-border bg-background text-foreground w-28 rounded-lg border px-2 py-1 pe-10 text-xs"
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          placeholder={
                            currencyLabel(item.quote?.currency || item.currency)
                              ? t('watch.priceIn', {
                                  currency: currencyLabel(item.quote?.currency || item.currency),
                                })
                              : t('watch.price')
                          }
                          value={alertPrice}
                          onChange={(event) => setAlertPrice(event.target.value)}
                        />
                        {currencyLabel(item.quote?.currency || item.currency) && (
                          <span className="text-muted pointer-events-none absolute inset-y-0 end-2 flex items-center text-[10px] font-medium">
                            {currencyLabel(item.quote?.currency || item.currency)}
                          </span>
                        )}
                      </div>
                      <button
                        type="submit"
                        disabled={busy === `alert-${item.id}`}
                        className="bg-tone-green text-tone-green-fg rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        {t('save')}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {actionError && <p className="text-tone-rose-fg text-xs">{watchlistErrorText(actionError)}</p>}

        {notifyHint && items.some((item) => item.alerts?.length) && (
          <button
            type="button"
            onClick={enableBrowserAlerts}
            className="text-muted hover:text-foreground text-xs underline"
          >
            {t('watch.enableNotes')}
          </button>
        )}

        <div className="border-border-subtle border-t pt-3">
          <WatchlistEditor compact={items.length > 0} onAdded={afterChange} busy={Boolean(busy)} />
        </div>
      </div>
    </Card>
  );
}
