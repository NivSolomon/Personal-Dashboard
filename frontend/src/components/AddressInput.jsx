import { useEffect, useId, useRef, useState } from 'react';
import { Spinner } from './BusyStatus.jsx';
import { BriefcaseIcon, HomeIcon } from './icons.jsx';
import { api, isAbortError } from '../lib/api.js';
import { useT } from '../lib/i18n.jsx';

const DEFAULT_INPUT =
  'border-border bg-background text-foreground w-full rounded-lg border px-3 py-2 text-sm';

function savedSuggestions(savedPlaces, query, t) {
  const q = query.trim().toLowerCase();
  const homeWord = t('places.homeShort').toLowerCase();
  const workWord = t('places.workShort').toLowerCase();
  const rows = [];
  if (savedPlaces?.home?.trim()) {
    rows.push({ id: 'saved-home', label: savedPlaces.home.trim(), kind: 'home' });
  }
  if (savedPlaces?.work?.trim()) {
    rows.push({ id: 'saved-work', label: savedPlaces.work.trim(), kind: 'work' });
  }
  if (!q) return rows;
  return rows.filter(
    (row) =>
      row.label.toLowerCase().includes(q) ||
      (row.kind === 'home' && homeWord.includes(q)) ||
      (row.kind === 'work' && workWord.includes(q)),
  );
}

export default function AddressInput({
  id,
  name,
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  required = false,
  disabled = false,
  autoFocus = false,
  inputClassName = DEFAULT_INPUT,
  savedPlaces = null,
  bias = null,
}) {
  const { t } = useT();
  const listId = useId();
  const generatedId = useId();
  const inputId = id || generatedId;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const saved = savedSuggestions(savedPlaces, value, t);
  const remoteOnly = remote.filter(
    (place) => !saved.some((row) => row.label.toLowerCase() === place.label.toLowerCase()),
  );
  const options = [...saved, ...remoteOnly];

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || /^https?:\/\//i.test(q)) {
      setRemote([]);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const handle = setTimeout(() => {
      setSearching(true);
      api
        .suggestPlaces(q, bias, { signal: controller.signal })
        .then((body) => setRemote(body.places || []))
        .catch((error) => {
          if (!isAbortError(error)) setRemote([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 280);

    return () => {
      clearTimeout(handle);
      controller.abort();
      setSearching(false);
    };
  }, [value, bias?.lat, bias?.lon]);

  useEffect(() => {
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  const pick = (place) => {
    onChange(place.label);
    onSelect?.(place);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!options.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Enter' && open && active >= 0 && options[active]) {
      event.preventDefault();
      pick(options[active]);
    }
  };

  const showList = open && options.length > 0;

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label htmlFor={inputId} className="text-foreground mb-1.5 block text-sm font-medium">
          {label}
        </label>
      )}
      <input
        id={inputId}
        name={name}
        className={inputClassName}
        value={value}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder || t('address.placeholder')}
        maxLength={200}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {searching && (
        <p className="text-muted mt-1.5 flex items-center gap-2 text-xs" role="status" aria-live="polite">
          <Spinner className="size-3.5" />
          {t('address.searching')}
        </p>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="border-border bg-surface absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border py-1 shadow-lg"
        >
          {options.map((place, index) => (
            <li key={place.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`flex w-full items-start gap-2 px-3 py-2 text-start text-sm ${
                  index === active ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                }`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(place)}
              >
                {place.kind === 'home' && <HomeIcon className="text-muted mt-0.5 size-4 shrink-0" />}
                {place.kind === 'work' && (
                  <BriefcaseIcon className="text-muted mt-0.5 size-4 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="text-foreground block">{place.label}</span>
                  {place.kind === 'home' && (
                    <span className="text-muted text-xs">{t('address.savedHome')}</span>
                  )}
                  {place.kind === 'work' && (
                    <span className="text-muted text-xs">{t('address.savedWork')}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
