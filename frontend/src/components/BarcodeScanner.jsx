import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import BusyStatus from './BusyStatus.jsx';
import Modal from './Modal.jsx';
import { useT } from '../lib/i18n.jsx';

const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
];

export default function BarcodeScanner({ open, onDetected, onClose }) {
  const { t } = useT();
  const rawId = useId().replace(/:/g, '');
  const readerId = `nutrition-scanner-${rawId}`;
  const onDetectedRef = useRef(onDetected);
  const fileRef = useRef(null);
  const [cameraError, setCameraError] = useState(false);
  const [fileError, setFileError] = useState(false);
  const [booting, setBooting] = useState(false);
  const [scanningFile, setScanningFile] = useState(false);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open) {
      setCameraError(false);
      setFileError(false);
      setBooting(false);
      setScanningFile(false);
      return undefined;
    }

    setBooting(true);

    let scanner;
    let cancelled = false;

    const start = async () => {
      const node = document.getElementById(readerId);
      if (!node || cancelled) return;
      scanner = new Html5Qrcode(readerId, { formatsToSupport: FORMATS, verbose: false });
      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 8,
            qrbox: (width, height) => ({
              width: Math.floor(Math.min(width * 0.92, 280)),
              height: Math.floor(Math.min(height * 0.4, 140)),
            }),
          },
          (decoded) => {
            const code = String(decoded || '').replace(/\s/g, '');
            if (!code || cancelled) return;
            cancelled = true;
            const instance = scanner;
            scanner = null;
            instance
              ?.stop()
              .catch(() => {})
              .then(() => instance.clear().catch(() => {}))
              .finally(() => onDetectedRef.current?.(code));
          },
        );
        if (!cancelled) setBooting(false);
      } catch {
        if (!cancelled) {
          setCameraError(true);
          setBooting(false);
        }
      }
    };

    const timer = window.setTimeout(start, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const instance = scanner;
      scanner = null;
      instance
        ?.stop()
        .catch(() => {})
        .then(() => instance.clear().catch(() => {}));
    };
  }, [open, readerId]);

  const scanFile = async (file) => {
    if (!file || scanningFile) return;
    setFileError(false);
    setScanningFile(true);
    const scanner = new Html5Qrcode(`${readerId}-file`, { formatsToSupport: FORMATS, verbose: false });
    try {
      const decoded = await scanner.scanFile(file, true);
      const code = String(decoded || '').replace(/\s/g, '');
      if (code) onDetectedRef.current?.(code);
      else setFileError(true);
    } catch {
      setFileError(true);
    } finally {
      await scanner.clear().catch(() => {});
      setScanningFile(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('nutrition.scan')}
      description={t('nutrition.scanHint')}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-3">
        <div
          id={readerId}
          className="bg-tone-neutral overflow-hidden rounded-xl [&_video]:max-h-64 [&_video]:w-full [&_video]:object-cover"
        />
        <div id={`${readerId}-file`} className="hidden" />
        {booting && !cameraError && <BusyStatus label={t('nutrition.cameraStarting')} tone="green" />}
        {scanningFile && <BusyStatus label={t('nutrition.scanFileBusy')} tone="green" />}
        {cameraError && <p className="text-tone-rose-fg text-sm">{t('nutrition.cameraDenied')}</p>}
        {fileError && <p className="text-tone-rose-fg text-sm">{t('nutrition.barcodeMissing')}</p>}
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void scanFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={scanningFile}
            className="border-border bg-surface text-foreground hover:bg-surface-hover rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {scanningFile ? t('nutrition.scanFileBusy') : t('nutrition.scanFile')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border-border text-muted hover:text-foreground rounded-lg border px-3 py-2 text-sm font-medium"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
