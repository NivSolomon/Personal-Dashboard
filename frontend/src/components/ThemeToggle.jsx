import { MoonIcon, SunIcon } from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

export default function ThemeToggle({ theme, onToggle }) {
  const { t } = useT();
  const goingDark = theme === 'light';
  const label = goingDark ? t('theme.dark') : t('theme.light');

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      className="border-border bg-surface text-muted hover:text-foreground hover:bg-surface-hover grid size-9 place-items-center rounded-lg border transition"
    >
      {goingDark ? <MoonIcon className="size-4.5" /> : <SunIcon className="size-4.5" />}
    </button>
  );
}
