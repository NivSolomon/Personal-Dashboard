import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { playUi } from '../lib/sounds.js';
import { useT } from '../lib/i18n.jsx';

const DISMISS_MS = 8000;

/** Short-lived bottom notice, with an optional undo action. */
export default function Toast({ open, message, actionLabel, onAction, onClose, busy = false }) {
  const [paused, setPaused] = useState(false);
  const { t } = useT();

  useEffect(() => {
    if (!open || busy || paused) return undefined;
    const timer = window.setTimeout(() => onClose?.(), DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [open, busy, paused, onClose, message]);

  useEffect(() => {
    if (!open) setPaused(false);
  }, [open]);

  useEffect(() => {
    if (open && message) playUi('success');
  }, [open, message]);

  if (!open) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="toast-in border-border bg-surface text-foreground fixed bottom-6 left-1/2 z-50 flex max-w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 shadow-lg"
    >
      <p className="min-w-0 flex-1 text-sm leading-snug">{message}</p>
      {actionLabel && (
        <button
          type="button"
          disabled={busy}
          onClick={onAction}
          className="text-tone-indigo-fg shrink-0 text-sm font-semibold hover:underline disabled:opacity-50"
        >
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
