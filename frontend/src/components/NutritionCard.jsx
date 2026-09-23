import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import { BarcodeIcon, CameraIcon, NutritionIcon, PlusIcon, SparkleIcon, TrashIcon } from './icons.jsx';
import { api, isAbortError } from '../lib/api.js';
import {
  isGibberishFoodQuery,
  isPlausibleFoodQuery,
  isPreparedMealQuery,
  rankFoodProducts,
} from '../lib/foodQuery.js';
import { fileToJpegDataUrl } from '../lib/image.js';
import { localeOf, useT } from '../lib/i18n.jsx';
import { playUi } from '../lib/sounds.js';
import { localDateKey } from '../lib/validate.js';

const DEFAULT_GOAL = 2000;
const WRONG_NAME_TRIES = 3;
const BarcodeScanner = lazy(() => import('./BarcodeScanner.jsx'));

function asItem(raw, source) {
  if (!raw) return null;
  const calories = Number(raw.calories ?? raw.estimatedCalories) || 0;
  return {
    name: String(raw.name || '').trim(),
    calories,
    protein: Number(raw.protein) || 0,
    carbs: Number(raw.carbs) || 0,
    fat: Number(raw.fat) || 0,
    servingSize: raw.servingSize || null,
    barcode: raw.barcode || null,
    per: raw.per || null,
    brand: raw.brand || null,
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients : [],
    source,
  };
}

function Macro({ label, value }) {
  return (
    <div>
      <p className="text-foreground text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted text-xs">{label}</p>
    </div>
  );
}

function weekdayShort(date, locale) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(`${date}T12:00:00`));
}

function WeekChart({ days, goal, selectedDate, today, locale, onSelect, t }) {
  const max = Math.max(Number(goal) || 0, ...days.map((day) => Number(day.calories) || 0), 1);
  const goalPct = goal > 0 ? Math.min(100, (goal / max) * 100) : null;

  return (
    <div dir="ltr">
      <div className="relative h-24">
        {goalPct != null && (
          <div
            className="border-tone-green-fg/40 pointer-events-none absolute inset-x-0 z-10 border-t border-dashed"
            style={{ bottom: `${goalPct}%` }}
          />
        )}
        <div
          className="flex h-full items-end gap-1.5"
          role="list"
          aria-label={t('nutrition.chartHover')}
        >
          {days.map((day) => {
            const calories = Number(day.calories) || 0;
            const height = calories > 0 ? Math.max(8, (calories / max) * 100) : 3;
            const active = selectedDate === day.date;
            const label = weekdayShort(day.date, locale);
            return (
              <button
                key={day.date}
                type="button"
                role="listitem"
                onPointerEnter={() => onSelect(day.date)}
                onFocus={() => onSelect(day.date)}
                onClick={() => onSelect(day.date)}
                aria-pressed={active}
                aria-label={t('nutrition.dayKcal', { day: label, n: Math.round(calories) })}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                <span
                  className={`w-full rounded-md transition-[height,background-color] ${
                    active ? 'bg-tone-green-fg' : 'bg-tone-green-fg/45 hover:bg-tone-green-fg/70'
                  } ${day.date === today ? 'outline-tone-green-fg/50 outline outline-offset-1' : ''}`}
                  style={{ height: `${height}%` }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {days.map((day) => (
          <span
            key={day.date}
            className={`min-w-0 flex-1 text-center text-[10px] ${
              selectedDate === day.date ? 'text-foreground font-medium' : 'text-muted'
            }`}
          >
            {weekdayShort(day.date, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

function WeekStat({ label, title, detail }) {
  return (
    <div className="border-border bg-surface-hover/50 min-w-0 rounded-xl border px-3 py-2">
      <p className="text-muted text-[11px]">{label}</p>
      <p className="text-foreground truncate text-sm font-medium">{title}</p>
      {detail && <p className="text-subtle truncate text-xs">{detail}</p>}
    </div>
  );
}

function actionErrorKey(code) {
  if (code === 'product_not_found' || code === 'barcodeMissing') return 'nutrition.barcodeMissing';
  if (code === 'openai_unavailable' || code === 'openaiOff') return 'nutrition.openaiOff';
  if (code === 'notFood') return 'nutrition.notFood';
  if (code === 'notAFood' || code === 'not_food_query') return 'nutrition.notAFood';
  if (code === 'cameraDenied') return 'nutrition.cameraDenied';
  if (code === 'noResults') return 'nutrition.noResults';
  return 'error.save';
}

function NutritionCard({
  nutrition,
  calorieGoal,
  timeZone,
  loading,
  error,
  onChange,
}) {
  const { t, language } = useT();
  const locale = localeOf(language);
  const [day, setDay] = useState(nutrition);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const photoRef = useRef(null);
  const captureRef = useRef(null);
  const inflight = useRef(new Map());
  const mounted = useRef(true);
  const missStreak = useRef(0);
  const dateRef = useRef(nutrition?.date || '');
  const [photoKey, setPhotoKey] = useState(0);
  const [inventOpen, setInventOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [workshopOpen, setWorkshopOpen] = useState(false);

  const applyDay = (next) => {
    setDay(next);
    dateRef.current = next?.date || '';
    onChange?.(next);
  };

  useEffect(() => {
    setDay(nutrition);
    dateRef.current = nutrition?.date || '';
    if (!timeZone || !nutrition?.date) return undefined;
    if (nutrition.date === localDateKey(timeZone)) return undefined;
    let cancelled = false;
    api
      .nutritionToday()
      .then((next) => {
        if (!cancelled && next && mounted.current) applyDay(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [nutrition, timeZone]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of inflight.current.values()) controller.abort();
      inflight.current.clear();
    };
  }, []);

  useEffect(() => {
    if (inventOpen) playUi('celebrate');
  }, [inventOpen]);

  useEffect(() => {
    if (!timeZone) return undefined;
    const check = () => {
      const today = localDateKey(timeZone);
      if (!dateRef.current || !today || dateRef.current === today) return;
      api
        .nutritionToday()
        .then((next) => {
          if (next && mounted.current) applyDay(next);
        })
        .catch(() => {});
    };
    const id = window.setInterval(check, 30_000);
    check();
    return () => window.clearInterval(id);
  }, [timeZone]);

  const goal =
    Number(calorieGoal) > 0
      ? Math.round(Number(calorieGoal))
      : Number(day?.goal) > 0
        ? Math.round(Number(day.goal))
        : DEFAULT_GOAL;
  const consumed = Number(day?.consumed) || 0;
  const percent = goal > 0 ? Math.min(100, (consumed / goal) * 100) : 0;
  const over = consumed > goal;
  const entries = day?.entries || [];
  const week = day?.week;
  const weekDays = week?.days || [];
  const todayKey = day?.date || '';
  const activeDate =
    selectedDate && weekDays.some((row) => row.date === selectedDate)
      ? selectedDate
      : todayKey || weekDays.at(-1)?.date;
  const activeWeekDay = weekDays.find((row) => row.date === activeDate);

  const run = async (key, work, group = key) => {
    inflight.current.get(group)?.abort();
    const controller = new AbortController();
    inflight.current.set(group, controller);
    setBusy(key);
    setActionError(null);
    try {
      return await work(controller.signal);
    } catch (err) {
      if (isAbortError(err)) return null;
      setActionError(err?.code || 'unavailable');
      return null;
    } finally {
      if (inflight.current.get(group) === controller) {
        inflight.current.delete(group);
      }
      if (inflight.current.size === 0) setBusy(null);
    }
  };

  const noteSearchHit = () => {
    missStreak.current = 0;
  };

  const noteSearchMiss = () => {
    missStreak.current += 1;
    if (missStreak.current <= WRONG_NAME_TRIES) return;
    missStreak.current = 0;
    setInventOpen(true);
  };

  const addItem = async (item) => {
    if (!item?.name) return;
    const next = await run('add', () =>
      api.addNutritionEntry({
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        servingSize: item.servingSize,
        barcode: item.barcode,
        source: item.source,
      }),
    );
    if (!next) return;
    applyDay(next);
    setPending(null);
    setResults([]);
    setQuery('');
  };

  const search = async (event) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setPending(null);
    setResults([]);
    if (isGibberishFoodQuery(q)) {
      setActionError('notAFood');
      noteSearchMiss();
      return;
    }
    const outcome = await run(
      'search',
      async (signal) => {
        let products = [];
        if (!isPreparedMealQuery(q)) {
          try {
            const body = await api.searchNutrition(q, { signal });
            products = rankFoodProducts(
              q,
              (body.products || []).map((product) => asItem(product, 'search')).filter(Boolean),
            );
          } catch (err) {
            if (isAbortError(err)) throw err;
          }
        }
        if (products.length) return { products };
        if (!isPlausibleFoodQuery(q) && !isPreparedMealQuery(q)) return { notFood: true };
        try {
          return { estimated: await api.estimateNutrition(q, { signal }) };
        } catch (err) {
          if (isAbortError(err)) throw err;
          if (err?.code === 'not_food_query' || err?.code === 'notAFood') return { notFood: true };
          throw err;
        }
      },
      'lookup',
    );
    if (!outcome) return;
    if (outcome.products?.length) {
      noteSearchHit();
      setResults(outcome.products);
      return;
    }
    if (outcome.notFood) {
      setActionError('notAFood');
      noteSearchMiss();
      return;
    }
    if (!outcome.estimated?.estimate) {
      setActionError('noResults');
      noteSearchMiss();
      return;
    }
    const item = asItem(outcome.estimated.estimate, 'text');
    if (!item || (item.calories <= 0 && item.protein <= 0)) {
      setActionError('notAFood');
      noteSearchMiss();
      return;
    }
    noteSearchHit();
    setPending(item);
  };

  const handleBarcode = async (code) => {
    setScanOpen(false);
    setResults([]);
    const body = await run('barcode', (signal) => api.nutritionBarcode(code, { signal }), 'lookup');
    if (!body?.product) return;
    setPending(asItem(body.product, 'barcode'));
  };

  const resetPhotoInputs = () => {
    if (photoRef.current) photoRef.current.value = '';
    if (captureRef.current) captureRef.current.value = '';
    setPhotoKey((n) => n + 1);
  };

  const openPicker = (mode) => {
    const el = () => (mode === 'camera' ? captureRef.current : photoRef.current);
    if (el()) {
      el().click();
      return;
    }
    requestAnimationFrame(() => el()?.click());
  };

  const handlePhoto = async (file) => {
    resetPhotoInputs();
    if (!file) return;
    setResults([]);
    setPending(null);
    const dataUrl = await fileToJpegDataUrl(file).catch(() => null);
    if (!dataUrl) {
      setBusy(null);
      setActionError('unavailable');
      return;
    }
    const body = await run('photo', (signal) => api.analyzeMeal(dataUrl, { signal }), 'lookup');
    if (!body) return;
    const item = asItem(body.estimate, 'photo');
    if (!item || (item.calories <= 0 && item.protein <= 0)) {
      setBusy(null);
      setActionError('notFood');
      return;
    }
    setPending(item);
  };

  const removeEntry = async (entryId) => {
    const next = await run(`del-${entryId}`, () => api.removeNutritionEntry(entryId));
    if (next) applyDay(next);
  };

  const servingLabel = (item) => {
    if (item.per === '100g') return t('nutrition.per100');
    if (item.servingSize) return t('nutrition.perServing', { size: item.servingSize });
    return null;
  };

  const preview = (item, key) => (
    <div key={key} className="border-border bg-surface-hover/60 space-y-2 rounded-xl border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">{item.name}</p>
          {item.brand && <p className="text-muted truncate text-xs">{item.brand}</p>}
          {servingLabel(item) && <p className="text-subtle text-xs">{servingLabel(item)}</p>}
        </div>
        <button
          type="button"
          disabled={busy === 'add'}
          onClick={() => addItem(item)}
          className="bg-tone-green text-tone-green-fg inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          <PlusIcon className="size-3.5" />
          {busy === 'add' ? t('nutrition.adding') : t('nutrition.add')}
        </button>
      </div>
      <p className="text-muted text-xs tabular-nums">
        {t('nutrition.kcal', { n: Math.round(item.calories) })}
        {' · '}
        {t('nutrition.protein')} {t('nutrition.grams', { n: item.protein })}
        {' · '}
        {t('nutrition.carbs')} {t('nutrition.grams', { n: item.carbs })}
        {' · '}
        {t('nutrition.fat')} {t('nutrition.grams', { n: item.fat })}
      </p>
    </div>
  );

  const lastMeal = entries[0] || null;
  const renderGoalBar = () => (
    <div>
      <div className="text-muted flex items-baseline justify-between text-xs">
        <span>{over ? t('nutrition.over') : t('nutrition.goal')}</span>
        <span className="tabular-nums">{t('nutrition.kcalOf', { done: Math.round(consumed), goal })}</span>
      </div>
      <div
        className="bg-tone-neutral mt-1.5 h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={Math.round(consumed)}
        aria-label={t('nutrition.goal')}
      >
        <div
          className={`h-full rounded-full transition-[width] ${over ? 'bg-tone-rose-fg' : 'bg-tone-green-fg'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );

  return (
    <Card
      title={t('widget.nutrition.title')}
      icon={<NutritionIcon className="size-4.5" />}
      tone="green"
      badge={t('nutrition.kcal', { n: Math.round(consumed) })}
      loading={loading}
      error={error}
      layout="plain"
      empty={false}
      action={
        !loading && (
          <button
            type="button"
            onClick={() => setWorkshopOpen(true)}
            className="bg-tone-green text-tone-green-fg inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
          >
            <PlusIcon className="size-3.5" />
            {t('nutrition.logFood')}
          </button>
        )
      }
    >
      <div className="space-y-3">
        {renderGoalBar()}
        <div className="grid grid-cols-3 gap-3">
          <Macro label={t('nutrition.protein')} value={t('nutrition.grams', { n: day?.protein || 0 })} />
          <Macro label={t('nutrition.carbs')} value={t('nutrition.grams', { n: day?.carbs || 0 })} />
          <Macro label={t('nutrition.fat')} value={t('nutrition.grams', { n: day?.fat || 0 })} />
        </div>
        {lastMeal ? (
          <button
            type="button"
            onClick={() => setWorkshopOpen(true)}
            className="hover:bg-surface-hover w-full rounded-lg text-start"
          >
            <p className="text-foreground truncate text-sm">{t('nutrition.lastMeal', { name: lastMeal.name })}</p>
            {entries.length > 1 && (
              <p className="text-muted text-xs">{t('nutrition.mealsToday', { n: entries.length })}</p>
            )}
          </button>
        ) : (
          <p className="text-subtle text-sm">{t('nutrition.empty')}</p>
        )}
      </div>

      <Modal
        open={workshopOpen}
        size="xl"
        title={t('widget.nutrition.title')}
        description={t('nutrition.logHint')}
        onClose={() => setWorkshopOpen(false)}
      >
        <div className="scroll-area max-h-[min(70vh,40rem)] space-y-4 overflow-y-auto">
          {renderGoalBar()}

          <div className="grid grid-cols-3 gap-3">
            <Macro label={t('nutrition.protein')} value={t('nutrition.grams', { n: day?.protein || 0 })} />
            <Macro label={t('nutrition.carbs')} value={t('nutrition.grams', { n: day?.carbs || 0 })} />
            <Macro label={t('nutrition.fat')} value={t('nutrition.grams', { n: day?.fat || 0 })} />
          </div>

          <form onSubmit={search} className="space-y-2">
            <label className="sr-only" htmlFor="nutrition-search">
              {t('nutrition.search')}
            </label>
            <div className="flex gap-2">
              <input
                id="nutrition-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('nutrition.search')}
                minLength={2}
                maxLength={80}
                required
                className="border-border bg-surface text-foreground min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy === 'search' || query.trim().length < 2}
                className="border-border bg-surface text-foreground hover:bg-surface-hover rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {busy === 'search' ? t('nutrition.searching') : t('nutrition.searchAction')}
              </button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="border-border text-foreground hover:bg-surface-hover inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium"
            >
              <BarcodeIcon className="size-3.5" />
              {busy === 'barcode' ? t('nutrition.scanning') : t('nutrition.scan')}
            </button>
            <button
              type="button"
              onClick={() => openPicker('camera')}
              className="border-border text-foreground hover:bg-surface-hover inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium"
            >
              <CameraIcon className="size-3.5" />
              {busy === 'photo' ? t('nutrition.analyzing') : t('nutrition.photo')}
            </button>
            <button
              type="button"
              onClick={() => openPicker('upload')}
              className="border-border text-muted hover:text-foreground hover:bg-surface-hover rounded-lg border px-3 py-2 text-xs font-medium"
            >
              {t('nutrition.upload')}
            </button>
          </div>

          {actionError && (
            <p className="text-tone-rose-fg text-sm">
              {t(actionErrorKey(actionError))}
              {actionError === 'notFood' && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => openPicker('upload')}
                    className="text-foreground font-medium underline underline-offset-2"
                  >
                    {t('nutrition.tryAnother')}
                  </button>
                </>
              )}
            </p>
          )}

          {pending && preview(pending, 'pending')}
          {results.map((item, index) => preview(item, item.barcode || `${item.name}-${index}`))}

          {entries.length === 0 && !pending && results.length === 0 && (
            <p className="text-subtle text-sm">{t('nutrition.empty')}</p>
          )}

          {entries.length > 0 && (
            <ul className="border-border-subtle space-y-2 border-t pt-3">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm">{entry.name}</p>
                    <p className="text-muted text-xs tabular-nums">
                      {t('nutrition.kcal', { n: Math.round(entry.calories) })}
                    </p>
                  </div>
                  <button
                    type="button"
                    title={t('nutrition.remove')}
                    aria-label={t('nutrition.remove')}
                    disabled={busy === `del-${entry.id}`}
                    onClick={() => removeEntry(entry.id)}
                    className="text-muted hover:text-tone-rose-fg grid size-8 shrink-0 place-items-center rounded-lg"
                  >
                    <TrashIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {weekDays.length > 0 && (
            <div className="border-border-subtle space-y-3 border-t pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-foreground inline-flex items-center gap-1.5 text-sm font-medium">
                  <SparkleIcon className="text-tone-green-fg size-3.5" />
                  {t('nutrition.week')}
                </p>
                <p className="text-muted text-xs tabular-nums">
                  {t('nutrition.weekKcal', { n: Math.round(week.totalCalories || 0) })}
                </p>
              </div>
              <WeekChart
                days={weekDays}
                goal={goal}
                selectedDate={activeDate}
                today={todayKey}
                locale={locale}
                onSelect={setSelectedDate}
                t={t}
              />
              {activeWeekDay && (
                <p className="text-muted text-xs tabular-nums">
                  {t('nutrition.dayKcal', {
                    day: weekdayShort(activeWeekDay.date, locale),
                    n: Math.round(activeWeekDay.calories),
                  })}
                  {week.avgCalories > 0 ? ` · ${t('nutrition.weekAvg', { n: week.avgCalories })}` : ''}
                </p>
              )}
              {week.favorite || week.richestProtein ? (
                <div className="grid grid-cols-2 gap-2">
                  {week.favorite && (
                    <WeekStat
                      label={t('nutrition.favorite')}
                      title={week.favorite.name}
                      detail={t('nutrition.times', { n: week.favorite.count })}
                    />
                  )}
                  {week.richestProtein && (
                    <WeekStat
                      label={t('nutrition.richestProtein')}
                      title={week.richestProtein.name}
                      detail={t('nutrition.grams', { n: week.richestProtein.protein })}
                    />
                  )}
                </div>
              ) : (
                <p className="text-subtle text-xs">{t('nutrition.noWeekStats')}</p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {typeof document !== 'undefined' &&
        createPortal(
          <>
            <input
              key={`nutrition-capture-${photoKey}`}
              ref={captureRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                void handlePhoto(file);
              }}
            />
            <input
              key={`nutrition-upload-${photoKey}`}
              ref={photoRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                void handlePhoto(file);
              }}
            />
          </>,
          document.body,
        )}

      {scanOpen && (
        <Suspense fallback={null}>
          <BarcodeScanner open onDetected={handleBarcode} onClose={() => setScanOpen(false)} />
        </Suspense>
      )}

      <Modal
        open={inventOpen}
        title={t('nutrition.inventTitle')}
        description={
          <>
            {t('nutrition.invent')}{' '}
            <span aria-hidden="true">😊</span>
          </>
        }
        onClose={() => setInventOpen(false)}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setInventOpen(false)}
            className="bg-tone-green text-tone-green-fg rounded-lg px-3 py-2 text-sm font-medium"
          >
            {t('nutrition.inventOk')}
          </button>
        </div>
      </Modal>
    </Card>
  );
}

export default memo(NutritionCard);
