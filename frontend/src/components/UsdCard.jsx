import { memo, useEffect, useMemo, useState } from 'react';
import BusyStatus, { Spinner } from './BusyStatus.jsx';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import { DollarIcon, PlusIcon, TrashIcon } from './icons.jsx';
import { api } from '../lib/api.js';
import {
  FX_PINNED,
  MAX_FX_QUOTES,
  currencyName,
  currencySymbol,
  displayFxCode,
  fxSelectCodes,
} from '../lib/fx.js';
import { localeOf, useT } from '../lib/i18n.jsx';

function formatRate(value, language) {
  if (value == null) return '—';
  return value.toLocaleString(localeOf(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function changeClass(value) {
  if (value > 0) return 'text-tone-green-fg';
  if (value < 0) return 'text-tone-rose-fg';
  return 'text-muted';
}

function codesFrom(settings, quote) {
  const saved = settings?.fx?.quotes;
  if (Array.isArray(saved) && saved.length) return saved;
  if (Array.isArray(quote?.quotes)) return quote.quotes.map((row) => row.code);
  return ['USD'];
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

function RateChart({ points, language, unit }) {
  const { t } = useT();
  const [hover, setHover] = useState(null);
  const width = 360;
  const height = 148;
  const padX = 12;
  const padY = 14;

  const dots = useMemo(() => {
    if (!points?.length) return [];
    const values = points.map((point) => point.rate);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return points.map((point, index) => ({
      ...point,
      x: padX + (index / Math.max(points.length - 1, 1)) * (width - padX * 2),
      y: padY + (1 - (point.rate - min) / span) * (height - padY * 2),
    }));
  }, [points]);

  if (!dots.length) return null;

  const line = dots.map((dot) => `${dot.x},${dot.y}`).join(' ');
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;
  const last = dots.at(-1);
  const active = hover != null ? dots[hover] : last;

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

  const tipLeft = Math.min(88, Math.max(12, (active.x / width) * 100));
  const tipTop = (active.y / height) * 100;
  const tipBelow = active.y < 40;

  return (
    <div
      className="relative"
      onPointerMove={pickNearest}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="text-tone-green-fg h-44 w-full cursor-crosshair"
        role="img"
        aria-label={t('usd.chartHover')}
      >
        <polyline fill="currentColor" fillOpacity="0.12" stroke="none" points={area} />
        <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" points={line} />
        {active && (
          <>
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
          </>
        )}
      </svg>
      {active && (
        <div
          className="bg-surface border-border text-foreground pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border px-2.5 py-1.5 shadow-lg"
          style={{
            left: `${tipLeft}%`,
            top: tipBelow ? `calc(${tipTop}% + 0.7rem)` : `calc(${tipTop}% - 2.85rem)`,
          }}
        >
          <p className="text-muted text-[11px] leading-none">{formatChartDate(active.date, language)}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {formatRate(active.rate, language)} {currencySymbol(unit, localeOf(language))}
          </p>
        </div>
      )}
    </div>
  );
}

function RateRow({ row, language, locale, pricedIn, onOpen, onRemove, busy }) {
  const { t } = useT();
  const up = (row.change || 0) > 0;
  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(row);
        }}
        disabled={row.rate == null}
        className="border-border hover:bg-surface-hover flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-start disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="text-foreground block text-sm font-semibold">{displayFxCode(row.code)}</span>
          <span className="text-muted block truncate text-xs">{currencyName(row.code, locale)}</span>
        </span>
        <span className="text-end">
          <span className="text-foreground block text-sm font-semibold tabular-nums">
            {formatRate(row.rate, language)} {currencySymbol(row.unit || pricedIn, locale)}
          </span>
          {row.changePct != null && (
            <span className={`block text-xs font-medium tabular-nums ${changeClass(row.change)}`}>
              {up ? '+' : ''}
              {row.changePct}%
            </span>
          )}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          title={t('usd.remove')}
          aria-label={t('usd.remove')}
          disabled={busy === `del-${row.code}`}
          onClick={() => onRemove(row.code)}
          className="text-muted hover:text-tone-rose-fg grid size-10 shrink-0 place-items-center rounded-lg disabled:opacity-50"
        >
          {busy === `del-${row.code}` ? <Spinner className="size-3.5" /> : <TrashIcon className="size-3.5" />}
        </button>
      )}
    </li>
  );
}

function UsdCard({ quote, settings, loading, error, onAccountChange }) {
  const { t, language } = useT();
  const locale = localeOf(language);
  const pricedIn = settings?.fx?.base || quote?.base || 'ILS';
  const [codes, setCodes] = useState(() => codesFrom(settings, quote));
  const [busy, setBusy] = useState(null);
  const [hint, setHint] = useState(null);
  const [chart, setChart] = useState(null);
  const [history, setHistory] = useState(null);
  const [range, setRange] = useState(90);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    setCodes(codesFrom(settings, quote));
  }, [settings?.fx?.base, settings?.fx?.quotes, quote]);

  const rates = useMemo(() => {
    const byCode = new Map((quote?.quotes || []).map((row) => [row.code, row]));
    return codes.map((code) => {
      const row = byCode.get(code);
      return row ? { ...row, unit: row.unit || pricedIn } : { code, unit: pricedIn };
    });
  }, [codes, pricedIn, quote]);

  const addable = useMemo(() => {
    const taken = new Set(codes);
    return fxSelectCodes().filter((code) => !taken.has(code));
  }, [codes]);

  const quickAdd = addable.filter((code) => FX_PINNED.includes(code));
  const moreAdd = addable.filter((code) => !FX_PINNED.includes(code));

  const saveFx = async (next, key) => {
    const previous = { base: pricedIn, quotes: codes };
    setBusy(key);
    setHint(null);
    setCodes(next.quotes);
    try {
      const updated = await api.updateSettings({ fx: next });
      onAccountChange?.(updated);
    } catch (err) {
      setCodes(previous.quotes);
      setHint(err?.code === 'fx_full' ? t('usd.full') : t('error.save'));
    } finally {
      setBusy(null);
    }
  };

  const addCurrency = (code) => {
    if (!code || codes.includes(code) || codes.length >= MAX_FX_QUOTES) return;
    void saveFx({ base: pricedIn, quotes: [...codes, code] }, `add-${code}`);
  };

  const removeCurrency = (code) => {
    void saveFx(
      { base: pricedIn, quotes: codes.filter((item) => item !== code) },
      `del-${code}`,
    );
  };

  const changePricedIn = (base) => {
    void saveFx({ base, quotes: codes }, 'base');
  };

  const openChart = async (row, days = range) => {
    if (!row?.code || row.rate == null) return;
    setChart(row);
    setHistory(null);
    setRange(days);
    try {
      const body = await api.fxHistory({ from: row.code, to: row.unit || pricedIn, days });
      setHistory(body);
    } catch {
      setHistory({ error: true });
    }
  };

  const firstRate = rates.find((row) => row.rate != null);
  const badge = firstRate
    ? `${currencySymbol(pricedIn, locale)}${formatRate(firstRate.rate, language)}`
    : null;
  const previewRates = rates.slice(0, 2);
  const extraCount = Math.max(0, rates.length - previewRates.length);

  const addControls = addable.length > 0 && codes.length < MAX_FX_QUOTES && (
    <div className="space-y-2">
      <p className="text-muted flex items-center gap-1.5 text-xs font-medium">
        <PlusIcon className="size-3.5" />
        {t('usd.add')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {quickAdd.map((code) => (
          <button
            key={code}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => addCurrency(code)}
            className="border-border text-foreground hover:bg-surface-hover inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
          >
            {busy === `add-${code}` && <Spinner className="size-3" />}
            {displayFxCode(code)}
          </button>
        ))}
        {moreAdd.length > 0 && (
          <select
            value=""
            disabled={Boolean(busy)}
            onChange={(event) => {
              const code = event.target.value;
              event.target.value = '';
              addCurrency(code);
            }}
            className="border-border bg-surface text-foreground rounded-lg border px-2 py-1 text-xs font-medium"
          >
            <option value="">{t('usd.more')}</option>
            {moreAdd.map((code) => (
              <option key={code} value={code}>
                {displayFxCode(code)} · {currencyName(code, locale)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );

  const pricedInSelect = (
    <label className="text-muted flex items-center justify-between gap-3 text-xs">
      <span>{t('usd.showIn')}</span>
      <select
        value={pricedIn}
        disabled={Boolean(busy)}
        onChange={(event) => changePricedIn(event.target.value)}
        className="border-border bg-surface text-foreground rounded-lg border px-2 py-1 text-xs font-medium"
      >
        {fxSelectCodes().map((code) => (
          <option key={code} value={code}>
            {displayFxCode(code)} · {currencyName(code, locale)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Card
      title={t('widget.usd.title')}
      icon={<DollarIcon className="size-4.5" />}
      tone="green"
      badge={badge}
      loading={loading}
      error={error}
      layout="plain"
      empty={false}
      sourceId="usd"
      action={
        !loading && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="bg-tone-green text-tone-green-fg inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium"
          >
            {t('usd.manage')}
          </button>
        )
      }
      overlay={
        <>
      <Modal
        open={manageOpen}
        size="lg"
        title={t('widget.usd.title')}
        description={t('usd.manageHint')}
        onClose={() => setManageOpen(false)}
      >
        <div className="scroll-area max-h-[min(70vh,36rem)] space-y-3 overflow-y-auto">
          {pricedInSelect}
          {rates.length === 0 && <p className="text-subtle text-sm">{t('usd.empty')}</p>}
          <ul className="space-y-2">
            {rates.map((row) => (
              <RateRow
                key={row.code}
                row={row}
                language={language}
                locale={locale}
                pricedIn={pricedIn}
                onOpen={openChart}
                onRemove={removeCurrency}
                busy={busy}
              />
            ))}
          </ul>
          {addControls}
          {busy && <BusyStatus label={t('usd.updating')} tone="green" />}
          {hint && <p className="text-tone-rose-fg text-sm">{hint}</p>}
          {quote?.asOf && <p className="text-subtle text-xs">{t('usd.asOf', { date: quote.asOf })}</p>}
        </div>
      </Modal>

        <Modal
          open={Boolean(chart)}
          size="lg"
          title={chart ? `${displayFxCode(chart.code)} / ${displayFxCode(pricedIn)}` : t('widget.usd.title')}
          description={chart ? t('usd.chartHint', { name: currencyName(chart.code, locale) }) : ''}
          onClose={() => {
            setChart(null);
            setHistory(null);
          }}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {[30, 90, 365].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => chart && openChart(chart, days)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    range === days
                      ? 'border-tone-green-fg/30 bg-tone-green text-tone-green-fg'
                      : 'border-border text-muted hover:text-foreground hover:bg-surface-hover'
                  }`}
                >
                  {t(`usd.range.${days}`)}
                </button>
              ))}
            </div>

            {!history && <BusyStatus label={t('usd.chartLoading')} tone="green" />}
            {history?.error && <p className="text-tone-rose-fg text-sm">{t('usd.chartError')}</p>}
            {history?.points && (
              <>
                <RateChart
                  points={history.points}
                  language={language}
                  unit={chart?.unit || pricedIn}
                />
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-muted text-xs">{t('usd.now')}</dt>
                    <dd className="text-foreground font-semibold tabular-nums">
                      {formatRate(history.last, language)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">{t('usd.rangeMove')}</dt>
                    <dd className={`font-semibold tabular-nums ${changeClass(history.change)}`}>
                      {history.change > 0 ? '+' : ''}
                      {history.changePct}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted text-xs">{t('usd.highLow')}</dt>
                    <dd className="text-foreground font-semibold tabular-nums">
                      {formatRate(history.high, language)} / {formatRate(history.low, language)}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </div>
        </Modal>
        </>
      }
    >
      <div className="space-y-3">
        {rates.length === 0 && <p className="text-subtle text-sm">{t('usd.empty')}</p>}
        <ul className="space-y-2">
          {previewRates.map((row) => (
            <RateRow
              key={row.code}
              row={row}
              language={language}
              locale={locale}
              pricedIn={pricedIn}
              onOpen={openChart}
            />
          ))}
        </ul>
        {extraCount > 0 && (
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="text-muted hover:text-foreground text-xs font-medium"
          >
            {t('usd.moreRates', { n: extraCount })}
          </button>
        )}
        {quote?.asOf && <p className="text-subtle text-xs">{t('usd.asOf', { date: quote.asOf })}</p>}
      </div>
    </Card>
  );
}

export default memo(UsdCard);
