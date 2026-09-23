/** Cheap gate so gibberish never reaches the nutrition model. */

const FOOD_STEMS = [
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'salmon', 'tuna', 'shrimp', 'egg',
  'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'bread', 'toast', 'bagel',
  'rice', 'pasta', 'noodle', 'pizza', 'burger', 'sandwich', 'wrap', 'taco', 'burrito',
  'salad', 'soup', 'stew', 'chili', 'curry', 'sushi', 'poke', 'ramen', 'falafel',
  'hummus', 'avocado', 'banana', 'apple', 'orange', 'grape', 'berry', 'mango', 'lemon',
  'tomato', 'cucumber', 'onion', 'garlic', 'potato', 'fries', 'carrot', 'pepper',
  'broccoli', 'spinach', 'lettuce', 'olive', 'oil', 'oat', 'cereal', 'granola',
  'tofu', 'bean', 'lentil', 'chickpea', 'steak', 'bacon', 'sausage', 'ham',
  'shawarma', 'schnitzel', 'shakshuka', 'couscous', 'quinoa', 'waffle', 'pancake',
  'cake', 'cookie', 'chocolate', 'ice cream', 'coffee', 'latte', 'tea', 'juice',
  'smoothie', 'shake', 'soda', 'cola', 'beer', 'wine', 'water', 'honey', 'jam',
  'almond', 'peanut', 'walnut', 'cashew', 'seed', 'meal', 'dish', 'food',
  'breakfast', 'lunch', 'dinner', 'snack', 'omelet', 'omelette', 'dumpling',
  'lasagna', 'risotto', 'paella', 'pho', 'pad thai', 'kebab', 'kabob', 'gyro',
  'pita', 'naan', 'tortilla', 'muffin', 'croissant', 'donut', 'pretzel',
  'popcorn', 'chips', 'crisp', 'protein', 'whey',
  't bone', 't-bone', 'tbone', 'grill', 'grilled', 'ribeye', 'sirloin',
  'brisket', 'tenderloin', 'filet', 'fillet', 'entrecote', 'porterhouse',
  'עוף', 'בקר', 'בשר', 'דג', 'סלמונ', 'טונה', 'שרימפ', 'ביצ', 'חלב', 'גבינ',
  'יוגורט', 'חמאה', 'שמנת', 'לחם', 'טוסט', 'בייגל', 'פיתה', 'אורז', 'פסטה',
  'נודל', 'פיצה', 'המבורגר', 'כריכ', 'סנדוויצ', 'טורטיה', 'טאקו', 'בוריטו',
  'סלט', 'מרק', 'תבשיל', 'קארי', 'סושי', 'פוקי', 'ראמנ', 'פלאפל',
  'חומוס', 'אבוקדו', 'בננה', 'תפוח', 'תפוז', 'ענב', 'תות', 'מנגו', 'לימונ',
  'עגבנ', 'מלפפונ', 'בצל', 'שומ', 'תפוח אדמה', 'בטטה', 'צ׳יפס', 'ציפס', 'גזר',
  'פלפל', 'ברוקולי', 'תרד', 'חסה', 'זית', 'שמנ', 'שיבולת', 'שיבולת שועל',
  'גרנולה', 'דגני', 'טופו', 'שעועית', 'עדשי', 'גרגיר', 'סטייק', 'בייקנ',
  'נקניק', 'פסטרמה', 'שווארמה', 'שניצל', 'שקשוקה', 'קוסקוס', 'קינואה',
  'ופל', 'פנקייק', 'עוגה', 'עוגי', 'שוקולד', 'גלידה', 'קפה', 'לאטה', 'תה',
  'מיץ', 'שייק', 'סמוזי', 'יין', 'בירה', 'מים', 'דבש', 'ריבה', 'שקדי',
  'בוטנ', 'אגוז', 'קשיו', 'ארוחה', 'מנה', 'אוכל', 'חטיפ', 'חביתה', 'אומלט',
  'לזניה', 'קבב', 'שיפוד', 'ממולא', 'קציצ', 'בורקס', 'גחנונ', 'מלאווח',
  'מגדרה', 'קובה', 'סיגר', 'חלת', 'כעכ', 'טחינה', 'מיונז', 'קטשופ', 'סילאנ',
  'גריל', 'מנגל', 'אנטריקוט', 'סינטה', 'פילה', 'צלעות',
];

const UNITS = new Set([
  'g', 'gr', 'gram', 'grams', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'cup', 'cups',
  'tbsp', 'tsp', 'slice', 'slices', 'piece', 'pieces', 'serving', 'servings',
  'גרמ', 'קג', 'מל', 'כוס', 'כפ', 'כפית', 'פרוסה', 'פרוסות', 'יחידה', 'יחידות',
  'מנה', 'מנות',
]);

const PARTICLES = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'with', 'for', 'to', 'from',
  'my', 'me', 'it', 'this', 'that',
  'עם', 'של', 'את', 'על', 'או', 'גם', 'זה', 'כי', 'לא', 'כן', 'ואת', 'ועם',
  'something', 'stuff', 'thing', 'משהו', 'דבר', 'כזה', 'ככה',
]);

const CHATTER = new Set([
  'hello', 'hi', 'hey', 'yo', 'test', 'testing', 'asdf', 'asdfg', 'asdfgh',
  'qwer', 'qwert', 'qwerty', 'lorem', 'ipsum', 'foo', 'bar', 'baz', 'ok',
  'okay', 'yes', 'no', 'why', 'what', 'who', 'how', 'where', 'when', 'please',
  'thanks', 'thank', 'help', 'abc', 'abcd', 'xyz',
  'שלומ', 'היי', 'הי', 'בדיקה', 'טסט', 'מה', 'מי', 'למה', 'איכ', 'איפה', 'מתי',
  'תודה', 'עזרה', 'בבקשה',
]);

const KEYBOARD_ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'קראטונםפ',
  'שדגכעיחלךף',
  'זסבהנמצתץ',
];

function foldHebrewFinals(text) {
  return text
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ');
}

export function normalizeFoodQuery(value) {
  return foldHebrewFinals(
    String(value || '')
      .normalize('NFKC')
      .replace(/[\u0591-\u05C7]/g, '')
      .replace(/[״׳'"`]/g, '')
      .toLowerCase(),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function letterRun(token) {
  return token.replace(/[^\p{L}]+/gu, '');
}

function hasFoodStem(text) {
  const tokens = tokenize(text);
  return FOOD_STEMS.some((stem) => {
    const foldedStem = foldHebrewFinals(stem);
    if (foldedStem.includes(' ')) return text.includes(foldedStem);
    if (foldedStem.length <= 3) {
      return tokens.some((token) => {
        const folded = foldHebrewFinals(token);
        if (folded === foldedStem) return true;
        return /[\u0590-\u05FF]/.test(foldedStem) && folded.startsWith(foldedStem);
      });
    }
    return text.includes(foldedStem);
  });
}

function isUnit(token) {
  return UNITS.has(foldHebrewFinals(token));
}

function isChatter(token) {
  return CHATTER.has(foldHebrewFinals(token));
}

function isParticle(token) {
  return PARTICLES.has(foldHebrewFinals(token));
}

function isKeyboardSmash(token) {
  const compact = foldHebrewFinals(token.toLowerCase().replace(/[^a-z\u0590-\u05FF]/g, ''));
  if (compact.length < 4) return false;
  return KEYBOARD_ROWS.some((row) => {
    const folded = foldHebrewFinals(row);
    return folded.includes(compact) || compact.includes(folded.slice(0, 5));
  });
}

function isGibberishToken(token) {
  const letters = letterRun(token);
  if (letters.length < 2) return false;
  if (/(.)\1{2,}/u.test(letters)) return true;
  if (isKeyboardSmash(letters)) return true;

  const unique = new Set([...letters]);
  if (letters.length >= 6 && unique.size / letters.length <= 0.45) return true;

  const latin = letters.replace(/[^a-z]/gi, '');
  const hebrew = letters.replace(/[^\u0590-\u05FF]/g, '');
  const vowels = (latin.match(/[aeiouy]/gi) || []).length;

  if (latin.length >= 4 && vowels === 0) return true;
  if (latin.length >= 6 && vowels < 2) return true;
  if (hebrew.length >= 8 && !/[אהוי]/.test(hebrew)) return true;
  if (hebrew.length >= 6 && !/[אהוי]/.test(hebrew) && unique.size / letters.length < 0.55) {
    return true;
  }
  return false;
}

export function isGibberishFoodQuery(value) {
  const text = normalizeFoodQuery(value);
  if (text.length < 2 || text.length > 80) return true;

  const letters = letterRun(text.replace(/\s/g, ''));
  if (letters.length < 2) return true;

  const tokens = tokenize(text);
  if (!tokens.length || tokens.some(isGibberishToken)) return true;
  return tokens.every(
    (token) => isChatter(token) || isUnit(token) || isParticle(token) || /^\d+$/.test(token),
  );
}

export function isPlausibleFoodQuery(value) {
  if (isGibberishFoodQuery(value)) return false;
  return hasFoodStem(normalizeFoodQuery(value));
}

const COOKING_RE =
  /grill|grilled|fried|baked|roast|roasted|saute|sauté|cooked|homemade|bbq|barbecu|air[- ]?fry|stir[- ]?fry|on the grill|על האש|גריל|מטוגנ|צלוי|בתנור|מוקפצ|מבושל|מנגל/;

/** Homemade / cooked dishes belong in the estimator, not the packaged catalog. */
export function isPreparedMealQuery(value) {
  const text = normalizeFoodQuery(value);
  if (isGibberishFoodQuery(text)) return false;
  return COOKING_RE.test(text) && hasFoodStem(text);
}

function significantTokens(query) {
  return tokenize(normalizeFoodQuery(query)).filter((token) => {
    if (/^\d+$/.test(token)) return false;
    if (isUnit(token) || isParticle(token) || isChatter(token)) return false;
    if (token.length < 3 && !/[\u0590-\u05FF]/.test(token)) return false;
    return true;
  });
}

export function foodMatchScore(query, nameParts) {
  const tokens = significantTokens(query);
  if (!tokens.length) return 0;
  const hay = normalizeFoodQuery((nameParts || []).filter(Boolean).join(' '));
  if (!hay) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (hay.includes(token)) {
      hits += 1;
      continue;
    }
    if (token.length >= 4 && hay.includes(token.slice(0, -1))) hits += 0.6;
  }
  return hits / tokens.length;
}

export function rankFoodProducts(query, products) {
  const water = /\b(water|מים)\b/.test(normalizeFoodQuery(query));
  return (products || [])
    .map((product) => ({
      product,
      score: foodMatchScore(query, [product.name, product.brand]),
    }))
    .filter((row) => row.score >= 0.4)
    .filter((row) => water || Number(row.product.calories) > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.product);
}
