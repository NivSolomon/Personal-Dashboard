/**
 * Product lookup against the public Open Food Facts catalog.
 * A descriptive User-Agent is required by their API etiquette.
 */

import { isPreparedMealQuery, rankFoodProducts } from '../lib/foodQuery.js';

const OFF_BASE = 'https://world.openfoodfacts.org';
const USER_AGENT = 'MorningDashboard/1.0 (nutrition widget; local dashboard)';

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundKcal(value) {
  const n = num(value);
  return n == null ? null : Math.max(0, Math.round(n));
}

function roundGrams(value) {
  const n = num(value);
  return n == null ? null : Math.max(0, Math.round(n * 10) / 10);
}

function kcalFromNutriments(n, suffix) {
  const direct = n[`energy-kcal_${suffix}`] ?? n[`energy_kcal_${suffix}`] ?? n[`energy-kcal`];
  const kcal = roundKcal(direct);
  if (kcal != null) return kcal;
  const kj = num(n[`energy-kj_${suffix}`] ?? n[`energy_${suffix}`]);
  return kj == null ? null : roundKcal(kj / 4.184);
}

function macrosFromNutriments(n, suffix) {
  return {
    calories: kcalFromNutriments(n, suffix),
    protein: roundGrams(n[`proteins_${suffix}`]),
    carbs: roundGrams(n[`carbohydrates_${suffix}`]),
    fat: roundGrams(n[`fat_${suffix}`]),
  };
}

function hasAnyMacro(macros) {
  return macros.calories != null || macros.protein != null || macros.carbs != null || macros.fat != null;
}

/**
 * Prefer a labelled serving when the product has one; otherwise fall back to 100g.
 */
export function productFromOff(product) {
  if (!product || typeof product !== 'object') return null;
  const n = product.nutriments || {};
  const servingSize = String(product.serving_size || '').trim();
  const perServing = macrosFromNutriments(n, 'serving');
  const per100 = macrosFromNutriments(n, '100g');
  const useServing = Boolean(servingSize) && hasAnyMacro(perServing);
  const macros = useServing ? perServing : per100;
  const name = String(
    product.product_name_he || product.product_name || product.generic_name || product.brands || '',
  ).trim();
  if (!name && !hasAnyMacro(macros)) return null;

  return {
    name: name || 'Product',
    brand: String(product.brands || '').trim() || null,
    barcode: String(product.code || product._id || '').trim() || null,
    per: useServing ? 'serving' : '100g',
    servingSize: useServing ? servingSize : '100g',
    calories: macros.calories ?? 0,
    protein: macros.protein ?? 0,
    carbs: macros.carbs ?? 0,
    fat: macros.fat ?? 0,
    image: product.image_front_small_url || product.image_small_url || null,
  };
}

export function normalizeBarcode(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

async function offGet(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const error = new Error(`open_food_facts_${response.status}`);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    error.code = 'off_unavailable';
    throw error;
  }
  return response.json();
}

export async function fetchProductByBarcode(code) {
  const barcode = normalizeBarcode(code);
  if (!barcode) {
    const error = new Error('invalid_barcode');
    error.statusCode = 400;
    error.code = 'invalid_barcode';
    throw error;
  }
  const data = await offGet(`${OFF_BASE}/api/v0/product/${encodeURIComponent(barcode)}.json`);
  if (Number(data?.status) !== 1) return null;
  return productFromOff(data.product);
}

export async function searchProducts(query, { pageSize = 8 } = {}) {
  const q = String(query || '').trim().slice(0, 80);
  if (q.length < 2) return [];
  if (isPreparedMealQuery(q)) return [];
  const barcode = normalizeBarcode(q);
  if (barcode && barcode === q.replace(/\s/g, '')) {
    const product = await fetchProductByBarcode(barcode).catch(() => null);
    return product ? [product] : [];
  }

  const v2 = new URLSearchParams({
    search_terms: q,
    page_size: String(pageSize),
    fields:
      'code,product_name,product_name_he,generic_name,brands,serving_size,nutriments,image_front_small_url,image_small_url',
  });
  try {
    const data = await offGet(`${OFF_BASE}/api/v2/search?${v2}`);
    const mapped = (Array.isArray(data?.products) ? data.products : [])
      .map(productFromOff)
      .filter(Boolean);
    const ranked = rankFoodProducts(q, mapped);
    if (ranked.length) return ranked;
  } catch {
    /* CGI search is the older catalog endpoint; try it if v2 is down. */
  }

  const cgi = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
  });
  try {
    const data = await offGet(`${OFF_BASE}/cgi/search.pl?${cgi}`);
    return rankFoodProducts(
      q,
      (Array.isArray(data?.products) ? data.products : []).map(productFromOff).filter(Boolean),
    );
  } catch {
    return [];
  }
}

