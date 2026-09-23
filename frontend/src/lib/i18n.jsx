import { createContext, useContext, useEffect, useMemo } from 'react';
import hebrew from './locales/he.js';
import english from './locales/en.js';

export const LANGUAGES = ['Hebrew', 'English'];
const STORAGE_KEY = 'ui-language';
const HEBREW_LETTERS = /[\u0590-\u05FF]/;

let currentLanguage = 'Hebrew';

export function normalizeLanguage(value) {
  const text = String(value || '').trim();
  if (/^en/i.test(text) || text === 'English') return 'English';
  return 'Hebrew';
}

export function isEnglish(language = currentLanguage) {
  return normalizeLanguage(language) === 'English';
}

export function localeOf(language = currentLanguage) {
  return isEnglish(language) ? 'en-GB' : 'he-IL';
}

export function dirOf(language = currentLanguage) {
  return isEnglish(language) ? 'ltr' : 'rtl';
}

export function htmlLang(language = currentLanguage) {
  return isEnglish(language) ? 'en' : 'he';
}

export function uiLanguage() {
  return currentLanguage;
}

export function readStoredLanguage() {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'Hebrew';
  }
}

export function storeLanguage(language) {
  const next = normalizeLanguage(language);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}

export function applyDocumentLanguage(language) {
  currentLanguage = normalizeLanguage(language);
  if (typeof document === 'undefined') return;
  document.documentElement.lang = htmlLang(currentLanguage);
  document.documentElement.dir = dirOf(currentLanguage);
  document.title = t(currentLanguage, 'appTitle');
}

const KNOWN_FIRST = {
  adam: 'אדם',
  alex: 'אלכס',
  amit: 'עמית',
  anna: 'אנה',
  ben: 'בן',
  daniel: 'דניאל',
  dani: 'דני',
  david: 'דוד',
  eli: 'אלי',
  erez: 'ארז',
  gal: 'גל',
  guy: 'גיא',
  hila: 'הילה',
  idan: 'עידן',
  ilan: 'אילן',
  itay: 'איתי',
  itai: 'איתי',
  lior: 'ליאור',
  maya: 'מאיה',
  michael: 'מיכאל',
  michal: 'מיכל',
  moshe: 'משה',
  nadav: 'נדב',
  neta: 'נטע',
  niv: 'ניב',
  noa: 'נועה',
  noam: 'נועם',
  ofir: 'אופיר',
  omer: 'עומר',
  omri: 'עומרי',
  or: 'אור',
  ori: 'אורי',
  rachel: 'רחל',
  ron: 'רון',
  roni: 'רוני',
  roy: 'רועי',
  roee: 'רועי',
  sarah: 'שרה',
  sara: 'שרה',
  shai: 'שי',
  shay: 'שי',
  sharon: 'שרון',
  shir: 'שיר',
  shira: 'שירה',
  tal: 'טל',
  tamar: 'תמר',
  tom: 'תום',
  tomer: 'תומר',
  uri: 'אורי',
  yael: 'יעל',
  yair: 'יאיר',
  yaniv: 'יניב',
  yoni: 'יוני',
  yossi: 'יוסי',
  yuval: 'יובל',
  ziv: 'זיו',
};

function transliterateLatin(name) {
  const source = name.toLowerCase();
  const clusters = [
    ['tsch', 'צ׳'],
    ['sch', 'ש'],
    ['sh', 'ש'],
    ['ch', 'ח'],
    ['th', 'ת'],
    ['ph', 'פ'],
    ['kh', 'ח'],
    ['tz', 'צ'],
    ['ts', 'צ'],
    ['ee', 'י'],
    ['oo', 'ו'],
  ];
  const letters = {
    a: 'א',
    b: 'ב',
    c: 'ק',
    d: 'ד',
    e: 'ה',
    f: 'פ',
    g: 'ג',
    h: 'ה',
    i: 'י',
    j: 'ג׳',
    k: 'ק',
    l: 'ל',
    m: 'מ',
    n: 'נ',
    o: 'ו',
    p: 'פ',
    q: 'ק',
    r: 'ר',
    s: 'ס',
    t: 'ת',
    u: 'ו',
    v: 'ב',
    w: 'ו',
    x: 'קס',
    y: 'י',
    z: 'ז',
  };
  let i = 0;
  let out = '';
  while (i < source.length) {
    const rest = source.slice(i);
    const cluster = clusters.find(([token]) => rest.startsWith(token));
    if (cluster) {
      out += cluster[1];
      i += cluster[0].length;
      continue;
    }
    out += letters[source[i]] || '';
    i += 1;
  }
  return out;
}

export function firstNameOf(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

/** Hebrew UI shows a Hebrew given name; English UI keeps the Google given name. */
export function displayFirstName(fullName, language = currentLanguage) {
  const raw = firstNameOf(fullName);
  if (!raw) return '';
  if (isEnglish(language) || HEBREW_LETTERS.test(raw)) return raw;
  return KNOWN_FIRST[raw.toLowerCase()] || transliterateLatin(raw) || raw;
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? '' : String(vars[key]),
  );
}

const packs = { Hebrew: hebrew, English: english };

function packOf(language) {
  return packs[normalizeLanguage(language)] || packs.Hebrew;
}

const LOGIN_CODES = {
  state_mismatch: {
    Hebrew: 'ההתחברות נקטעה. נסו שוב.',
    English: 'Sign-in was interrupted. Try again.',
  },
  missing_code: {
    Hebrew: 'ההתחברות לא הושלמה. נסו שוב.',
    English: 'Sign-in did not finish. Try again.',
  },
  oauth_failed: {
    Hebrew: 'לא הצלחנו להתחבר לחשבון Google. נסו שוב בעוד רגע.',
    English: 'We could not connect to Google. Try again in a moment.',
  },
  access_denied: {
    Hebrew: 'לא אישרתם את הגישה לחשבון. בלי זה אי אפשר להציג את הלוח.',
    English: 'Access was not granted. The board cannot load without it.',
  },
  admin_policy_enforced: {
    Hebrew: 'מנהל החשבון חוסם את ההתחברות. פנו אליו, או השתמשו בחשבון אחר.',
    English: 'Your admin is blocking sign-in. Ask them, or use another account.',
  },
  login_first: {
    Hebrew: 'צריך להתחבר קודם עם Google.',
    English: 'Sign in with Google first.',
  },
  strava_failed: {
    Hebrew: 'לא הצלחנו לחבר את חשבון Strava. נסו שוב בעוד רגע.',
    English: 'We could not connect Strava. Try again in a moment.',
  },
  notion_failed: {
    Hebrew: 'לא הצלחנו לחבר את חשבון Notion. נסו שוב בעוד רגע.',
    English: 'We could not connect Notion. Try again in a moment.',
  },
};

export function t(language, key, vars) {
  const pack = packOf(language);
  const fallback = packs.Hebrew[key];
  return interpolate(pack[key] ?? fallback ?? key, vars);
}

export function tr(key, vars) {
  return t(currentLanguage, key, vars);
}

export function widgetTitle(id, language = currentLanguage) {
  return t(language, `widget.${id}.title`);
}

export function widgetDescription(id, language = currentLanguage) {
  return t(language, `widget.${id}.desc`);
}

export function loginMessage(code, language = currentLanguage) {
  const row = LOGIN_CODES[code];
  if (!row) return t(language, 'error.login.fallback');
  return row[normalizeLanguage(language)] || row.Hebrew;
}

const LanguageContext = createContext({
  language: 'Hebrew',
  t: (key, vars) => t('Hebrew', key, vars),
  isEn: false,
});

export function LanguageProvider({ language, children }) {
  const normalized = normalizeLanguage(language);

  useEffect(() => {
    applyDocumentLanguage(normalized);
    storeLanguage(normalized);
  }, [normalized]);

  const value = useMemo(
    () => ({
      language: normalized,
      isEn: isEnglish(normalized),
      t: (key, vars) => t(normalized, key, vars),
    }),
    [normalized],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}

if (typeof document !== 'undefined') {
  applyDocumentLanguage(readStoredLanguage());
}

export function LanguageSwitch({ value, onChange, className = '' }) {
  const language = normalizeLanguage(value);
  return (
    <div className={`border-border bg-surface inline-flex rounded-lg border p-0.5 ${className}`} role="group">
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={language === option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
            language === option
              ? 'bg-tone-indigo text-tone-indigo-fg'
              : 'text-muted hover:text-foreground'
          }`}
        >
          {option === 'Hebrew' ? 'עברית' : 'English'}
        </button>
      ))}
    </div>
  );
}
