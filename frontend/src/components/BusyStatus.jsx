const TONES = {
  green: {
    panel: 'border-tone-green-fg/25 bg-tone-green/40',
    spin: 'border-tone-green-fg',
    track: 'bg-tone-green-fg/20',
    bar: 'bg-tone-green-fg',
  },
  blue: {
    panel: 'border-tone-blue-fg/25 bg-tone-blue/30',
    spin: 'border-tone-blue-fg',
    track: 'bg-tone-blue/30',
    bar: 'bg-tone-blue-fg',
  },
  indigo: {
    panel: 'border-tone-indigo-fg/25 bg-tone-indigo/30',
    spin: 'border-tone-indigo-fg',
    track: 'bg-tone-indigo/30',
    bar: 'bg-tone-indigo-fg',
  },
  amber: {
    panel: 'border-tone-amber-fg/25 bg-tone-amber/40',
    spin: 'border-tone-amber-fg',
    track: 'bg-tone-amber-fg/20',
    bar: 'bg-tone-amber-fg',
  },
  neutral: {
    panel: 'border-border bg-surface-hover/70',
    spin: 'border-foreground',
    track: 'bg-border',
    bar: 'bg-foreground/70',
  },
};

/** Small spinner that inherits the current text colour. */
export function Spinner({ className = 'size-4' }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Visible in-progress notice: spinner, a sentence, and an indeterminate bar.
 * Pass `preview` when a file was accepted and work continues on it.
 */
export default function BusyStatus({ label, tone = 'green', preview = null, className = '' }) {
  const colors = TONES[tone] || TONES.green;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`rounded-xl border px-3 py-2.5 ${colors.panel} ${className}`}
    >
      <div className="flex items-center gap-2.5">
        {preview ? (
          <img src={preview} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
        ) : (
          <span
            className={`size-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent ${colors.spin}`}
            aria-hidden="true"
          />
        )}
        <p className="text-foreground min-w-0 flex-1 text-sm">{label}</p>
        {preview && (
          <span
            className={`size-4 shrink-0 animate-spin rounded-full border-2 border-t-transparent ${colors.spin}`}
            aria-hidden="true"
          />
        )}
      </div>
      <div className={`mt-2.5 h-1.5 overflow-hidden rounded-full ${colors.track}`}>
        <span className={`ask-progress block h-full w-1/3 rounded-full ${colors.bar}`} />
      </div>
    </div>
  );
}
