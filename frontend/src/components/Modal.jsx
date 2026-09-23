import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

/**
 * Native modal on document.body. The dialog stays mounted so opening one
 * window from another (or from a collapsed card) cannot leave the page inert.
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

    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        /* Not connected yet, or another dialog is closing this frame. */
      }
    }

    if (!open && dialog.open) {
      dialog.removeEventListener('close', handleClose);
      dialog.close();
      dialog.addEventListener('close', handleClose);
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`modal-dialog bg-surface text-foreground w-[calc(100%-1.5rem)] rounded-2xl border-0 p-0 shadow-2xl ${
        size === 'xl' ? 'max-w-3xl' : size === 'lg' ? 'max-w-lg' : 'max-w-md'
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
    </dialog>,
    document.body,
  );
}
