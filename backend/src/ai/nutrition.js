import { config, isOpenAiConfigured } from '../config.js';
import { getOpenAiClient } from './client.js';
import { parseJsonObject } from '../lib/json.js';
import { isPlausibleFoodQuery } from '../lib/foodQuery.js';

const VISION_MODEL = 'gpt-4o-mini';
const MAX_B64_CHARS = 3_500_000;

function getClient() {
  return getOpenAiClient();
}

function roundKcal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function roundGrams(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : 0;
}

function languageLabel(language) {
  return String(language || '').toLowerCase() === 'english' ? 'English' : 'Hebrew';
}

function shapeEstimate(parsed, fallbackName) {
  const ingredients = Array.isArray(parsed?.ingredients)
    ? parsed.ingredients.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
    : [];
  const name = String(parsed?.name || fallbackName || '').trim().slice(0, 200);
  return {
    name: name || fallbackName || '',
    ingredients,
    estimatedCalories: roundKcal(parsed?.estimatedCalories ?? parsed?.calories),
    protein: roundGrams(parsed?.protein),
    carbs: roundGrams(parsed?.carbs),
    fat: roundGrams(parsed?.fat),
  };
}

const IMAGE_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

export function parseMealImage(body = {}) {
  const raw = String(body.image || body.dataUrl || '').trim();
  if (!raw) return { error: 'invalid_image' };

  let mime = 'image/jpeg';
  let b64 = '';
  const match = raw.match(IMAGE_RE);
  if (match) {
    mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
    b64 = match[2].replace(/\s/g, '');
  } else if (/^[A-Za-z0-9+/=]+$/.test(raw.replace(/\s/g, '')) && raw.replace(/\s/g, '').length > 80) {
    b64 = raw.replace(/\s/g, '');
  } else {
    return { error: 'invalid_image' };
  }

  if (b64.length > MAX_B64_CHARS) return { error: 'image_too_large' };
  return { value: { mime, dataUrl: `data:${mime};base64,${b64}` } };
}

function visionSystemPrompt(language) {
  const lang = languageLabel(language);
  return [
    'You estimate nutrition from a photo of a meal.',
    `Write the dish name and ingredient names in ${lang}.`,
    'Return a JSON object with keys: name, ingredients, estimatedCalories, protein, carbs, fat.',
    'estimatedCalories is a whole number. protein, carbs and fat are grams.',
    'Estimate a single typical serving of what is visible. Be conservative, not generous.',
    'If the image is not food, set estimatedCalories to 0, leave macros at 0, and explain that in name.',
  ].join(' ');
}

function textSystemPrompt(language) {
  const lang = languageLabel(language);
  return [
    'You estimate nutrition from a short natural-language description of food.',
    `Write the dish name in ${lang}.`,
    'Return a JSON object with keys: name, ingredients, estimatedCalories, protein, carbs, fat.',
    'estimatedCalories is a whole number. protein, carbs and fat are grams.',
    'Assume one typical serving unless the text specifies amounts. Be conservative.',
    'If the text is not food, a drink, or a meal, set estimatedCalories to 0 and leave macros at 0.',
  ].join(' ');
}

export async function analyzeMealPhoto({ image, language, logger } = {}) {
  if (!isOpenAiConfigured()) {
    const error = new Error('openai_unavailable');
    error.statusCode = 503;
    error.code = 'openai_unavailable';
    throw error;
  }

  try {
    const response = await getClient().chat.completions.create({
      model: VISION_MODEL,
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: visionSystemPrompt(language) },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Estimate the ingredients and macros for this meal photo.',
            },
            { type: 'image_url', image_url: { url: image.dataUrl, detail: 'low' } },
          ],
        },
      ],
    });
    const parsed = parseJsonObject(response.choices[0]?.message?.content);
    if (!parsed) throw new Error('empty_nutrition_json');
    return shapeEstimate(parsed, '');
  } catch (error) {
    if (error.code === 'openai_unavailable') throw error;
    logger?.error({ err: error }, 'meal photo analysis failed');
    const wrapped = new Error('analysis_failed');
    wrapped.statusCode = 502;
    wrapped.code = 'analysis_failed';
    throw wrapped;
  }
}

export async function estimateFromText({ query, language, logger } = {}) {
  const text = String(query || '').trim().slice(0, 200);
  if (text.length < 2) {
    const error = new Error('invalid_query');
    error.statusCode = 400;
    error.code = 'invalid_query';
    throw error;
  }
  if (!isPlausibleFoodQuery(text)) {
    const error = new Error('not_food_query');
    error.statusCode = 400;
    error.code = 'not_food_query';
    throw error;
  }
  if (!isOpenAiConfigured()) {
    const error = new Error('openai_unavailable');
    error.statusCode = 503;
    error.code = 'openai_unavailable';
    throw error;
  }

  try {
    const response = await getClient().chat.completions.create({
      model: config.openai.model || VISION_MODEL,
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: textSystemPrompt(language) },
        { role: 'user', content: text },
      ],
    });
    const parsed = parseJsonObject(response.choices[0]?.message?.content);
    if (!parsed) throw new Error('empty_nutrition_json');
    return shapeEstimate(parsed, text);
  } catch (error) {
    if (error.statusCode) throw error;
    logger?.error({ err: error }, 'text nutrition estimate failed');
    const wrapped = new Error('analysis_failed');
    wrapped.statusCode = 502;
    wrapped.code = 'analysis_failed';
    throw wrapped;
  }
}
