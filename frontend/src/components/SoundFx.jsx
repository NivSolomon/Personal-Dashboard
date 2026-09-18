import { useEffect } from 'react';
import { VolumeIcon, VolumeOffIcon } from './icons.jsx';
import { playUi, useSounds } from '../lib/sounds.js';
import { useT } from '../lib/i18n.jsx';

const HIT =
  'button, a[href], summary, [role="button"], [role="switch"], [role="menuitem"], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"]';

function kindFor(el) {
  const named = el.dataset.sound;
  if (named === 'off') return null;
  if (named) return named;

  if (
    el.matches('input[type="checkbox"], input[type="radio"], [role="switch"], select') ||
    el.getAttribute('aria-pressed') != null
  ) {
    return 'toggle';
  }
  if (el.matches('a[href]')) return 'nav';
  if (
    el.closest('.text-tone-rose-fg, .bg-tone-rose') ||
    /מחק|הסר|delete|remove|trash/i.test(`${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`)
  ) {
    return 'warn';
  }
  return 'tap';
}

function targetFrom(event) {
  const el = event.target?.closest?.(HIT);
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

export function SoundFx() {
  useEffect(() => {
    const onPointer = (event) => {
      if (event.button != null && event.button !== 0) return;
      const el = targetFrom(event);
      if (!el) return;
      const kind = kindFor(el);
      if (kind) playUi(kind);
    };
    const onKey = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const el = targetFrom(event);
      if (!el || el.matches('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])')) {
        return;
      }
      const kind = kindFor(el);
      if (kind) playUi(kind);
    };
    const onChange = (event) => {
      if (event.target?.matches?.('select')) playUi('toggle');
    };

    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('change', onChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('change', onChange, true);
    };
  }, []);

  return null;
}

export function SoundToggle() {
  const { t } = useT();
  const { enabled, toggle } = useSounds();
  const label = enabled ? t('sound.mute') : t('sound.unmute');

  return (
    <button
      type="button"
      data-sound="off"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={enabled}
      className="border-border bg-surface text-muted hover:text-foreground hover:bg-surface-hover grid size-9 place-items-center rounded-lg border transition"
    >
      {enabled ? <VolumeIcon className="size-4.5" /> : <VolumeOffIcon className="size-4.5" />}
    </button>
  );
}
