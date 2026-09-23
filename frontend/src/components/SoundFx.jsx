import { useEffect } from 'react';
import { VolumeIcon, VolumeOffIcon } from './icons.jsx';
import { playUi, unlockAudio, useSounds } from '../lib/sounds.js';
import { useT } from '../lib/i18n.jsx';

const HIT = [
  'button',
  'a[href]',
  'summary',
  'select',
  '[role="button"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="checkbox"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="submit"]',
  'input[type="button"]',
  'input[type="reset"]',
  'label:has(input[type="checkbox"])',
  'label:has(input[type="radio"])',
  '[data-sound]:not([data-sound="off"])',
].join(', ');

const FIELD =
  'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="hidden"]):not([type="file"]):not([type="range"]):not([type="color"])';

function kindFor(el) {
  const named = el.dataset.sound;
  if (named === 'off') return null;
  if (named) return named;

  if (
    el.matches(
      'input[type="checkbox"], input[type="radio"], [role="switch"], [role="option"], [role="checkbox"], select, label:has(input[type="checkbox"]), label:has(input[type="radio"])',
    ) ||
    el.getAttribute('aria-pressed') != null ||
    el.getAttribute('aria-expanded') != null
  ) {
    return 'toggle';
  }
  if (el.matches('a[href]')) return 'nav';
  if (el.matches('button[type="submit"], input[type="submit"]')) return 'tap';
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
      unlockAudio();
      if (event.button != null && event.button !== 0) return;
      const el = targetFrom(event);
      if (!el) return;
      const kind = kindFor(el);
      if (kind) playUi(kind);
    };
    const onKey = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      unlockAudio();
      const el = targetFrom(event);
      if (!el || el.matches(FIELD)) return;
      const kind = kindFor(el);
      if (kind) playUi(kind);
    };
    const onChange = (event) => {
      const el = event.target;
      if (el?.matches?.('select, input[type="checkbox"], input[type="radio"]')) {
        playUi(el.dataset.sound && el.dataset.sound !== 'off' ? el.dataset.sound : 'toggle');
      }
    };
    const onFocus = (event) => {
      const el = event.target;
      if (!el?.matches?.(FIELD) || el.disabled || el.readOnly || el.dataset?.sound === 'off') return;
      unlockAudio();
      playUi(el.dataset?.sound && el.dataset.sound !== 'off' ? el.dataset.sound : 'focus');
    };

    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('focusin', onFocus, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('focusin', onFocus, true);
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
