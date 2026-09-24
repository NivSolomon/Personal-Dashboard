import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from './BusyStatus.jsx';
import { playUi } from '../lib/sounds.js';
import { useT } from '../lib/i18n.jsx';

const DISMISS_MS = 8000;

const TONE = {
  default: '',
  success: 'border-tone-green-fg/20',
  tip: 'border-tone-indigo-fg/25',
};

/** Short-lived bottom notice, with an optional undo action. */
export default function Toast({
  open,
  message,
  actionLabel,
  onAction,
  onClose,
  busy = false,
  tone = 'default',
  icon = null,
  duration = DISMISS_MS,
  sound = 'success',
}) {
  const [paused, setPaused] = useState(false);
  const { t } = useT();

  useEffect(() => {
    if (!open || busy || paused) return undefined;
    const timer = window.setTimeout(() => onClose?.(), duration);
    return () => window.clearTimeout(timer);
  }, [open, busy, paused, onClose, message, duration]);

  useEffect(() => {
    if (!open) setPaused(false);
  }, [open]);

  useEffect(() => {
    if (open && message && sound) playUi(sound);
  }, [open, message, sound]);

  if (!open) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`toast-in border-border bg-surface text-foreground fixed bottom-6 left-1/2 z-50 flex max-w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${TONE[tone] || ''}`}
    >
      {icon && (
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
            tone === 'success'
              ? 'bg-tone-green text-tone-green-fg'
              : 'bg-tone-indigo text-tone-indigo-fg'
          }`}
        >
          {icon}
        </span>
      )}
      <p className="min-w-0 flex-1 text-sm leading-snug">{message}</p>
      {actionLabel && (
        <button
          type="button"
          disabled={busy}
          onClick={onAction}
          className="text-tone-indigo-fg inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold hover:underline disabled:opacity-50"
        >
          {busy && <Spinner className="size-3.5" />}
          {busy ? t('undoing') : actionLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="text-muted hover:text-foreground shrink-0 text-sm"
        aria-label={t('close')}
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}
