import { useT } from '../lib/i18n.jsx';

/** MyDashi mark. `className` sizes the icon; the wordmark follows the header type. */
export default function BrandLogo({ className = 'size-9', withName = false, alt }) {
  const { t } = useT();
  const label = alt === undefined ? t('appTitle') : alt;

  const mark = (
    <img
      src="/logo.png"
      alt={withName ? '' : label}
      className={`shrink-0 rounded-[22%] object-cover shadow-md ${className}`}
    />
  );

  if (!withName) return mark;

  return (
    <span className="inline-flex items-center gap-2.5">
      {mark}
      <span className="text-foreground text-sm font-semibold tracking-tight">{t('appTitle')}</span>
    </span>
  );
}
