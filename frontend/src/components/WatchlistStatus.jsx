import { BellIcon } from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

export default function WatchlistStatus({ fired = [] }) {
  const { t } = useT();
  if (!fired.length) return null;
  const hit = fired[0];
  const label =
    fired.length === 1
      ? t('watch.crossed', { symbol: hit.symbol })
      : t('watch.alertsChip', { n: fired.length });

  return (
    <div
      title={fired.map((item) => item.symbol).join(', ')}
      aria-label={label}
      className="bg-tone-rose text-tone-rose-fg inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1"
    >
      <BellIcon className="size-4" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}
