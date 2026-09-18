import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GlobeIcon } from './icons.jsx';
import { LANGUAGES, normalizeLanguage, useT } from '../lib/i18n.jsx';

/** Compact globe control for headers. Settings still uses the full language switch. */
export default function LanguageMenu({ value, onChange, className = '' }) {
  const { t } = useT();
  const language = normalizeLanguage(value);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const place = () => {
      const button = rootRef.current?.querySelector('button');
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const rtl = document.documentElement.dir === 'rtl';
      setCoords({
        top: rect.bottom + 4,
        left: rtl ? rect.left : undefined,
        right: rtl ? undefined : window.innerWidth - rect.right,
      });
    };

    place();
    const onPointer = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('language')}
        title={t('language')}
        onClick={() => setOpen((next) => !next)}
        className="border-border bg-surface text-muted hover:text-foreground hover:bg-surface-hover grid size-9 place-items-center rounded-lg border transition"
      >
        <GlobeIcon className="size-4.5" />
      </button>
      {open &&
        coords &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            aria-label={t('language')}
            style={{ top: coords.top, left: coords.left, right: coords.right }}
            className="border-border bg-surface fixed z-50 min-w-36 overflow-hidden rounded-lg border py-1 shadow-lg"
          >
            {LANGUAGES.map((option) => {
              const selected = language === option;
              return (
                <li key={option} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-start text-sm font-medium ${
                      selected
                        ? 'bg-tone-indigo text-tone-indigo-fg'
                        : 'text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    {option === 'Hebrew' ? t('languageHebrew') : t('languageEnglish')}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
