import { useEffect, useRef, useState } from 'react';
import Card from './Card.jsx';
import BarcodeScanner from './BarcodeScanner.jsx';
import { BarcodeIcon, CameraIcon, NutritionIcon, PlusIcon, TrashIcon } from './icons.jsx';
import { api } from '../lib/api.js';
import { fileToJpegDataUrl } from '../lib/image.js';
import { useT } from '../lib/i18n.jsx';

const DEFAULT_GOAL = 2000;

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

function actionErrorKey(code) {
  if (code === 'product_not_found' || code === 'barcodeMissing') return 'nutrition.barcodeMissing';
  if (code === 'openai_unavailable' || code === 'openaiOff') return 'nutrition.openaiOff';
  if (code === 'notFood') return 'nutrition.notFood';
  if (code === 'cameraDenied') return 'nutrition.cameraDenied';
  if (code === 'noResults') return 'nutrition.noResults';
  return 'error.save';
}

export default function NutritionCard({
  nutrition,
  calorieGoal,
  loading,
  error,
  onChange,
}) {
  const { t } = useT();
  const [day, setDay] = useState(nutrition);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const photoRef = useRef(null);
  const captureRef = useRef(null);

  useEffect(() => {
    setDay(nutrition);
  }, [nutrition]);

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

  const applyDay = (next) => {
    setDay(next);
    onChange?.(next);
  };

  const run = async (key, work) => {
    setBusy(key);
    setActionError(null);
    try {
      return await work();
    } catch (err) {
      setActionError(err?.code || 'unavailable');
      return null;
    } finally {
      setBusy(null);
    }
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
    setBusy('search');
    setActionError(null);
    let products = [];
    try {
      const body = await api.searchNutrition(q);
      products = (body.products || []).map((product) => asItem(product, 'search')).filter(Boolean);
    } catch {
      products = [];
    }
    if (products.length) {
      setResults(products);
      setBusy(null);
      return;
    }
    const estimated = await run('search', () => api.estimateNutrition(q));
    if (!estimated) return;
    if (!estimated.estimate) {
      setActionError('noResults');
      return;
    }
    setPending(asItem(estimated.estimate, 'text'));
  };

  const handleBarcode = async (code) => {
    setScanOpen(false);
    setResults([]);
    const body = await run('barcode', () => api.nutritionBarcode(code));
    if (!body?.product) return;
    setPending(asItem(body.product, 'barcode'));
  };

  const handlePhoto = async (file) => {
    if (!file) return;
    setResults([]);
    const dataUrl = await fileToJpegDataUrl(file).catch(() => null);
    if (!dataUrl) {
      setActionError('unavailable');
      return;
    }
    const body = await run('photo', () => api.analyzeMeal(dataUrl));
    if (!body) return;
    const item = asItem(body.estimate, 'photo');
    if (!item || (item.calories <= 0 && item.protein <= 0)) {
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
          disabled={Boolean(busy)}
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
    >
      <div className="space-y-4">
        <div>
          <div className="text-muted flex items-baseline justify-between text-xs">
            <span>{over ? t('nutrition.over') : t('nutrition.goal')}</span>
            <span className="tabular-nums">{t('nutrition.kcalOf', { done: Math.round(consumed), goal })}</span>
          </div>
          <div className="bg-tone-neutral mt-1.5 h-2 overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-[width] ${over ? 'bg-tone-rose-fg' : 'bg-tone-green-fg'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

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
            onClick={() => captureRef.current?.click()}
            disabled={busy === 'photo'}
            className="border-border text-foreground hover:bg-surface-hover inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
          >
            <CameraIcon className="size-3.5" />
            {busy === 'photo' ? t('nutrition.analyzing') : t('nutrition.photo')}
          </button>
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={busy === 'photo'}
            className="border-border text-muted hover:text-foreground hover:bg-surface-hover rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
          >
            {t('nutrition.upload')}
          </button>
          <input
            ref={captureRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void handlePhoto(file);
            }}
          />
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void handlePhoto(file);
            }}
          />
        </div>

        {actionError && (
          <p className="text-tone-rose-fg text-sm">{t(actionErrorKey(actionError))}</p>
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
      </div>

      <BarcodeScanner open={scanOpen} onDetected={handleBarcode} onClose={() => setScanOpen(false)} />
    </Card>
  );
}
