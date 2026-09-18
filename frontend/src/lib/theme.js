import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The stored preference, or 'system' when the user has never chosen. */
function storedPreference() {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function resolve(preference) {
  if (preference !== 'system') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Applied here as well as in the inline script in index.html. The script wins the
 * race before first paint; this keeps the class in sync afterwards.
 */
function apply(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function useTheme() {
  const [preference, setPreference] = useState(storedPreference);
  const theme = resolve(preference);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  // While on 'system', follow the OS if it changes mid-session.
  useEffect(() => {
    if (preference !== 'system') return undefined;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => apply(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const toggle = useCallback(() => {
    const next = resolve(storedPreference()) === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
  }, []);

  return { theme, toggle };
}
