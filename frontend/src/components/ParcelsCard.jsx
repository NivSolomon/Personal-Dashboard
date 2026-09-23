import { memo, useState } from 'react';
import Card from './Card.jsx';
import Modal from './Modal.jsx';
import { ClockIcon, PackageIcon } from './icons.jsx';
import { deliveryArrivalLabel } from '../lib/format.js';
import { safeHttpUrl } from '../lib/urls.js';
import { useT } from '../lib/i18n.jsx';
import { citedItemClass, isSourceActive, useHighlight } from '../lib/highlight.jsx';

const STATUS_TONE = {
  green: 'bg-tone-green text-tone-green-fg',
  amber: 'bg-tone-amber text-tone-amber-fg',
  rose: 'bg-tone-rose text-tone-rose-fg',
  blue: 'bg-tone-blue text-tone-blue-fg',
};

function statusTone(status) {
  const value = String(status || '').toLowerCase();
  if (/delivered|נמסר|הגיע|arrived/.test(value)) return 'green';
  if (/delay|עיכוב|failed|problem|חסר/.test(value)) return 'rose';
  if (/out for delivery|בחלוקה|במסירה|היום|arriving/.test(value)) return 'amber';
  return 'blue';
}

function ParcelRow({ parcel, index, timeZone, t, active }) {
  const arrival = deliveryArrivalLabel(parcel, timeZone);
  const tone = STATUS_TONE[statusTone(parcel.status)];
  const key = parcel.trackingNumber || parcel.sourceMessageId || `${parcel.storeName}-${index}`;
  const sourceId = `parcel:${parcel.id || parcel.trackingNumber || key}`;
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-foreground truncate text-sm font-semibold">{parcel.storeName}</span>
        {parcel.status && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
            {parcel.status}
          </span>
        )}
      </div>
      {parcel.trackingNumber && (
        <p className="text-muted mt-1 font-mono text-xs tracking-wide">{parcel.trackingNumber}</p>
      )}
      {arrival ? (
        <p className="text-tone-blue-fg mt-1.5 flex items-center gap-1 text-xs font-medium">
          <ClockIcon className="size-3.5 shrink-0" />
          {t('parcels.eta', { date: arrival })}
        </p>
      ) : null}
    </>
  );

  return (
    <li
      key={key}
      data-source-id={sourceId}
      className={`rounded-lg ${citedItemClass(isSourceActive(active, sourceId))}`}
    >
      {safeHttpUrl(parcel.webViewLink) ? (
        <a
          href={safeHttpUrl(parcel.webViewLink)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:bg-surface-hover -mx-2 block rounded-lg p-2 transition"
        >
          {inner}
        </a>
      ) : (
        <div className="-mx-2 p-2">{inner}</div>
      )}
    </li>
  );
}

function ParcelsCard({ parcels = [], timeZone, loading, error }) {
  const { t } = useT();
  const { active } = useHighlight();
  const [open, setOpen] = useState(false);
  const preview = parcels.slice(0, 2);
  const extraCount = Math.max(0, parcels.length - preview.length);

  return (
    <Card
      title={t('widget.parcels.title')}
      icon={<PackageIcon className="size-4.5" />}
      tone="blue"
      count={parcels.length}
      loading={loading}
      error={error}
      skeleton="list"
      layout="plain"
      empty={parcels.length === 0}
      emptyText={t('parcels.empty')}
      action={
        !loading &&
        parcels.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-tone-blue text-tone-blue-fg inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium"
          >
            {t('scan.open')}
          </button>
        )
      }
    >
      {parcels.length > 0 && (
        <ul className="space-y-4">
          {preview.map((parcel, index) => (
            <ParcelRow
              key={parcel.trackingNumber || parcel.sourceMessageId || `${parcel.storeName}-${index}`}
              parcel={parcel}
              index={index}
              timeZone={timeZone}
              t={t}
              active={active}
            />
          ))}
          {extraCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-muted hover:text-foreground text-xs font-medium"
              >
                {t('scan.moreItems', { n: extraCount })}
              </button>
            </li>
          )}
        </ul>
      )}

      <Modal
        open={open}
        size="lg"
        title={t('widget.parcels.title')}
        description={t('widget.parcels.desc')}
        onClose={() => setOpen(false)}
      >
        <ul className="scroll-area max-h-[min(70vh,36rem)] space-y-4 overflow-y-auto">
          {parcels.map((parcel, index) => (
            <ParcelRow
              key={parcel.trackingNumber || parcel.sourceMessageId || `${parcel.storeName}-${index}`}
              parcel={parcel}
              index={index}
              timeZone={timeZone}
              t={t}
              active={active}
            />
          ))}
        </ul>
      </Modal>
    </Card>
  );
}

export default memo(ParcelsCard);
