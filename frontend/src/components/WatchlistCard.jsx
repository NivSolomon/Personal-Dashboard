import { memo, useEffect, useMemo, useRef, useState } from 'react';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import WatchlistEditor from './WatchlistEditor.jsx';
import { BellIcon, ChartIcon, PlusIcon, TrashIcon } from './icons.jsx';
import { api } from '../lib/api.js';
import { watchlistErrorText } from '../lib/errors.js';
import { alertOpLabel, alertSideLabel, currencyLabel, moneyLabel } from '../lib/format.js';
import { localeOf, tr, useT } from '../lib/i18n.jsx';
import { citedItemClass, isSourceActive, useHighlight } from '../lib/highlight.jsx';
import { playUi } from '../lib/sounds.js';

function changeClass(value) {
  if (value > 0) return 'text-tone-green-fg';
  if (value < 0) return 'text-tone-rose-fg';
  return 'text-muted';
}

function formatChartDate(value, language) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return value || '';
  return new Date(year, month - 1, day).toLocaleDateString(localeOf(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatSigned(value, language) {
  if (value == null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  const text = n.toLocaleString(localeOf(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(n) >= 100 ? 2 : 4,
  });
  return n > 0 ? `+${text}` : text;
}

function formatPct(value, language) {
  if (value == null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  const text = Math.abs(n).toLocaleString(localeOf(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n > 0) return `+${text}%`;
  if (n < 0) return `-${text}%`;
  return `${text}%`;
}

function formatAmount(value, language) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return n.toLocaleString(localeOf(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(n) >= 100 ? 2 : 4,
  });
}

function formatVolume(value, language) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString(localeOf(language), { notation: 'compact', maximumFractionDigits: 1 });
}

function PriceChart({ points, language, currency, positive }) {
  const { t } = useT();
  const [hover, setHover] = useState(null);
  const width = 360;
  const height = 148;
  const padX = 12;
  const padY = 14;

  const dots = useMemo(() => {
    if (!points?.length) return [];
    const values = points.map((point) => point.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return points.map((point, index) => ({
      ...point,
      x: padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2),
      y: padY + (1 - (point.price - min) / span) * (height - padY * 2),
    }));
  }, [points]);

  if (!dots.length) return null;

  const line = dots.map((dot) => `${dot.x},${dot.y}`).join(' ');
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;
  const last = dots.at(-1);
  const activeIndex = hover != null ? hover : dots.length - 1;
  const active = dots[activeIndex];
  const previous = activeIndex > 0 ? dots[activeIndex - 1] : null;
  const dayChange = previous ? active.price - previous.price : null;
  const dayPct = previous?.price ? (dayChange / previous.price) * 100 : null;
  const volume = formatVolume(active.volume, language);

  const pickNearest = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    for (let index = 0; index < dots.length; index += 1) {
      const dist = Math.abs(dots[index].x - x);
      if (dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    }
    setHover(best);
  };

  const tipLeft = Math.min(78, Math.max(22, (active.x / width) * 100));
  const tipTop = (active.y / height) * 100;
  const tipBelow = active.y < height * 0.45;

  return (
    <div
      className="relative touch-none"
      onPointerDown={pickNearest}
      onPointerMove={pickNearest}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`${positive ? 'text-tone-green-fg' : 'text-tone-rose-fg'} h-44 w-full cursor-crosshair`}
        role="img"
        aria-label={t('watch.chartHover')}
      >
        <polyline fill="currentColor" fillOpacity="0.12" stroke="none" points={area} />
        <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" points={line} />
        <line
          x1={active.x}
          x2={active.x}
          y1={padY - 4}
          y2={height - padY + 4}
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeDasharray="3 3"
        />
        <circle cx={active.x} cy={active.y} r="4.5" fill="currentColor" />
      </svg>
      <div
        className="bg-surface border-border text-foreground pointer-events-none absolute z-10 max-w-[14rem] rounded-lg border px-2.5 py-1.5 shadow-lg"
        style={{
          left: `${tipLeft}%`,
          top: tipBelow ? `calc(${tipTop}% + 0.7rem)` : `calc(${tipTop}% - 0.4rem)`,
          transform: tipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        }}
      >
        <p className="text-muted text-[11px] leading-none">{formatChartDate(active.date, language)}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums">{moneyLabel(active.price, currency)}</p>
        {dayChange != null && (
          <p className={`text-[11px] font-medium tabular-nums ${changeClass(dayChange)}`}>
            {formatSigned(dayChange, language)} ({formatPct(dayPct, language)})
          </p>
        )}
        {(active.high != null || active.low != null) && (
          <p className="text-muted mt-1 text-[11px] tabular-nums">
            {active.high != null && (
              <span>
                {t('watch.high')} {moneyLabel(active.high, currency)}
              </span>
            )}
            {active.high != null && active.low != null && <span> · </span>}
            {active.low != null && (
              <span>
                {t('watch.low')} {moneyLabel(active.low, currency)}
              </span>
            )}
          </p>
        )}
        {active.open != null && (
          <p className="text-muted text-[11px] tabular-nums">
            {t('watch.open')} {moneyLabel(active.open, currency)}
          </p>
        )}
        {volume && (
          <p className="text-muted text-[11px] tabular-nums">
            {t('watch.volume')} {volume}
          </p>
        )}
      </div>
    </div>
  );
}

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

function WatchlistCard({
  watchlist,
  loading,
  error,
  onAccountChange,
}) {
  const { t, language } = useT();
  const { active } = useHighlight();
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
  const [manageOpen, setManageOpen] = useState(false);
  const [chartItem, setChartItem] = useState(null);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState(90);
  const chartRequest = useRef(0);
  const previewItems = items.slice(0, 2);
  const extraCount = Math.max(0, items.length - previewItems.length);

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

  const openChart = async (item, days = range) => {
    if (!item?.symbol) return;
    const ticket = chartRequest.current + 1;
    chartRequest.current = ticket;
    setChartItem(item);
    setHistory(null);
    setRange(days);
    try {
      const body = await api.quoteHistory({ symbol: item.symbol, days });
      if (chartRequest.current !== ticket) return;
      setHistory(body);
    } catch {
      if (chartRequest.current !== ticket) return;
      setHistory({ error: true });
    }
  };

  const closeChart = () => {
    chartRequest.current += 1;
    setChartItem(null);
    setHistory(null);
  };

  const enableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotifyHint(permission === 'default');
  };

  const renderFiredBanner = () =>
    fired.length > 0 && (
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
  );

  const quoteRow = (item) => {
    const quote = item.quote;
    const up = (quote?.change || 0) > 0;
    const down = (quote?.change || 0) < 0;
    const changeClass = up ? 'text-tone-green-fg' : down ? 'text-tone-rose-fg' : 'text-muted';
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground truncate text-sm font-medium">{item.name}</p>
          <p className="text-muted text-xs">
            {item.symbol}
            <span className="ms-1.5">
              {t(`kind.${item.kind}`) === `kind.${item.kind}` ? item.kind : t(`kind.${item.kind}`)}
            </span>
            {currencyLabel(quote?.currency || item.currency) ? (
              <span className="ms-1.5">{currencyLabel(quote?.currency || item.currency)}</span>
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
    );
  };

  const workshopItem = (item) => {
    const hot = item.alerts?.some((alert) => alert.triggered);
    return (
      <li
        key={item.id}
        data-source-id={`watch:${item.symbol}`}
        className={`border-border-subtle rounded-xl border px-3 py-2.5 ${
          hot ? 'border-tone-rose-fg/40' : ''
        } ${citedItemClass(isSourceActive(active, `watch:${item.symbol}`))}`}
      >
        <button
          type="button"
          onClick={() => openChart(item)}
          aria-label={t('watch.openChart', { symbol: item.symbol })}
          className="hover:bg-surface-hover w-full rounded-lg text-start"
        >
          {quoteRow(item)}
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(item.alerts || []).map((alert) => (
            <AlertLine
              key={alert.id}
              item={item}
              alert={alert}
              removing={busy === `del-alert-${alert.id}`}
              onRemove={(alertId) =>
                run(`del-alert-${alertId}`, () => api.removeWatchlistAlert(item.id, alertId))
              }
            />
          ))}
          <button
            type="button"
            onClick={() => setAddingAlertFor((id) => (id === item.id ? null : item.id))}
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
              <option value="above">{alertOpLabel('above', item.quote?.currency || item.currency)}</option>
              <option value="below">{alertOpLabel('below', item.quote?.currency || item.currency)}</option>
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
      action={
        !loading && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="bg-tone-green text-tone-green-fg inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
          >
            <PlusIcon className="size-3.5" />
            {t('scan.manage')}
          </button>
        )
      }
    >
      <div className="space-y-3">
        {renderFiredBanner()}
        {items.length === 0 ? (
          <p className="text-muted text-sm text-balance">{t('watch.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {previewItems.map((item) => (
              <li
                key={item.id}
                data-source-id={`watch:${item.symbol}`}
                className={citedItemClass(isSourceActive(active, `watch:${item.symbol}`))}
              >
                <button
                  type="button"
                  onClick={() => openChart(item)}
                  aria-label={t('watch.openChart', { symbol: item.symbol })}
                  className="hover:bg-surface-hover w-full rounded-lg text-start"
                >
                  {quoteRow(item)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {extraCount > 0 && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="text-muted hover:text-foreground text-xs font-medium"
          >
            {t('scan.moreItems', { n: extraCount })}
          </button>
        )}
      </div>

      <Modal
        open={manageOpen}
        size="xl"
        title={t('widget.watchlist.title')}
        description={t('widget.watchlist.desc')}
        onClose={() => setManageOpen(false)}
      >
        <div className="scroll-area max-h-[min(70vh,40rem)] space-y-4 overflow-y-auto">
          {renderFiredBanner()}
          {items.length === 0 ? (
            <p className="text-muted text-sm text-balance">{t('watch.empty')}</p>
          ) : (
            <>
              <p className="text-muted text-xs">{t('watch.tapChart')}</p>
              <ul className="space-y-3">{items.map(workshopItem)}</ul>
            </>
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
      </Modal>

      <Modal
        open={Boolean(chartItem)}
        size="lg"
        title={chartItem?.name || chartItem?.symbol || t('widget.watchlist.title')}
        description={chartItem ? t('watch.chartHint', { symbol: chartItem.symbol }) : ''}
        onClose={closeChart}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[30, 90, 365].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => chartItem && openChart(chartItem, days)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  range === days
                    ? 'border-tone-green-fg/30 bg-tone-green text-tone-green-fg'
                    : 'border-border text-muted hover:text-foreground hover:bg-surface-hover'
                }`}
              >
                {t(`watch.range.${days}`)}
              </button>
            ))}
          </div>

          {!history && (
            <p className="text-muted flex items-center gap-2 text-sm">
              <ChartIcon className="size-4" />
              {t('watch.chartLoading')}
            </p>
          )}
          {history?.error && <p className="text-tone-rose-fg text-sm">{t('watch.chartError')}</p>}
          {history?.points && (
            <>
              <PriceChart
                points={history.points}
                language={language}
                currency={history.currency || chartItem?.quote?.currency || chartItem?.currency}
                positive={(history.change || 0) >= 0}
              />
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted text-xs">{t('watch.now')}</dt>
                  <dd className="text-foreground font-semibold tabular-nums">
                    {moneyLabel(history.last, history.currency || chartItem?.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs">{t('watch.rangeMove')}</dt>
                  <dd className={`font-semibold tabular-nums ${changeClass(history.change)}`}>
                    {formatPct(history.changePct, language)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-xs">{t('watch.highLow')}</dt>
                  <dd className="text-foreground font-semibold tabular-nums">
                    {formatAmount(history.high, language)} / {formatAmount(history.low, language)}
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
      </Modal>
    </Card>
  );
}

export default memo(WatchlistCard);
