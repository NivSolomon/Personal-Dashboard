import Card from './Card.jsx';
import { ClockIcon, PackageIcon } from './icons.jsx';
import { deliveryArrivalLabel } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

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

export default function ParcelsCard({ parcels = [], timeZone, loading, error }) {
  const { t } = useT();
  return (
    <Card
      title={t('widget.parcels.title')}
      icon={<PackageIcon className="size-4.5" />}
      tone="blue"
      count={parcels.length}
      loading={loading}
      error={error}
      skeleton="list"
      emptyText={t('parcels.empty')}
    >
      {parcels.map((parcel, index) => {
        const arrival = deliveryArrivalLabel(parcel, timeZone);
        const tone = STATUS_TONE[statusTone(parcel.status)];
        const key = parcel.trackingNumber || parcel.sourceMessageId || `${parcel.storeName}-${index}`;
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
          <li key={key}>
            {parcel.webViewLink ? (
              <a
                href={parcel.webViewLink}
                target="_blank"
                rel="noreferrer"
                className="hover:bg-surface-hover -mx-2 block rounded-lg p-2 transition"
              >
                {inner}
              </a>
            ) : (
              <div className="-mx-2 p-2">{inner}</div>
            )}
          </li>
        );
      })}
    </Card>
  );
}
