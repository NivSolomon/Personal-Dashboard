import { useEffect } from 'react';
import { Spinner } from './BusyStatus.jsx';
import Modal from './Modal.jsx';
import { playUi } from '../lib/sounds.js';
import { useT } from '../lib/i18n.jsx';

const TONES = {
  rose: 'bg-tone-rose text-tone-rose-fg',
  green: 'bg-tone-green text-tone-green-fg',
};

export default function ConfirmDelete({
  open,
  title,
  description,
  busy = false,
  confirmLabel,
  busyLabel,
  tone = 'rose',
  onConfirm,
  onClose,
}) {
  const { t } = useT();

  useEffect(() => {
    if (open) playUi('warn');
  }, [open]);

  return (
    <Modal open={open} title={title} description={description} onClose={() => !busy && onClose()}>
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="border-border text-foreground hover:bg-surface-hover rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`${TONES[tone] || TONES.rose} inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50`}
        >
          {busy && <Spinner className="size-3.5" />}
          {busy ? busyLabel || t('deleting') : confirmLabel || t('delete')}
        </button>
      </div>
    </Modal>
  );
}
