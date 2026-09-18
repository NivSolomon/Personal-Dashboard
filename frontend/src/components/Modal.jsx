import { useEffect, useId, useRef } from 'react';
import { CloseIcon } from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

/**
 * Native modal dialog: focus is trapped, Escape closes, and the opener is
 * restored when the window shuts.
 */
export default function Modal({ open, title, description, onClose, children, size = 'md' }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const { t } = useT();
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();

    return () => dialog.removeEventListener('close', handleClose);
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`modal-dialog bg-surface text-foreground w-[calc(100%-1.5rem)] rounded-2xl border-0 p-0 shadow-2xl ${
        size === 'lg' ? 'max-w-lg' : 'max-w-md'
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-foreground text-base font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-muted mt-1 text-sm leading-relaxed">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={t('closeWindow')}
          onClick={() => dialogRef.current?.close()}
          className="text-muted hover:text-foreground hover:bg-surface-hover grid size-9 shrink-0 place-items-center rounded-lg"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
