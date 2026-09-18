import { useEffect, useState } from 'react';
import { BriefcaseIcon, HomeIcon } from './icons.jsx';
import { api } from '../lib/api.js';
import { driveDurationLabel, timeLabel } from '../lib/format.js';
import { wazeNavigateUrl } from '../lib/places.js';
import { useT } from '../lib/i18n.jsx';

const chipClass =
  'border-border bg-surface text-foreground hover:bg-surface-hover inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition';

function readGps() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
    );
  });
}

function etaText(eta, timeZone, nearbyLabel) {
  if (!eta) return null;
  if (eta.nearby) return nearbyLabel;
  const duration = driveDurationLabel(eta.minutes);
  const clock = timeLabel(eta.arriveAt, timeZone);
  return clock ? `${duration} · ${clock}` : duration;
}

function PlaceChip({ href, title, icon, label, eta, loading, timeZone, nearbyLabel }) {
  const line = etaText(eta, timeZone, nearbyLabel);
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} className={chipClass}>
      {icon}
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span>{label}</span>
        {line ? (
          <span className="text-muted mt-0.5 text-[11px] font-normal">{line}</span>
        ) : loading ? (
          <span className="bg-skeleton mt-1 h-2.5 w-14 animate-pulse rounded" />
        ) : null}
      </span>
    </a>
  );
}

export default function PlacesShortcuts({ places, origin, timeZone }) {
  const { t } = useT();
  const nearbyLabel = t('places.nearby');
  const home = places?.home?.trim();
  const work = places?.work?.trim();
  const [etas, setEtas] = useState({ home: null, work: null });
  const [loading, setLoading] = useState(Boolean(home || work));

  useEffect(() => {
    if (!home && !work) return undefined;
    let cancelled = false;

    const load = async () => {
      const gps = await readGps();
      const fallbackLat = Number(origin?.lat);
      const fallbackLon = Number(origin?.lon);
      const from =
        gps ||
        (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLon)
          ? { lat: fallbackLat, lon: fallbackLon }
          : null);
      if (!from) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const next = await api.placeEta(from);
        if (!cancelled) setEtas({ home: next?.home || null, work: next?.work || null });
      } catch {
        if (!cancelled) setEtas({ home: null, work: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [home, work, origin?.lat, origin?.lon]);

  if (!home && !work) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {home && (
        <PlaceChip
          href={wazeNavigateUrl(home)}
          title={
            etas.home
              ? `${t('places.navHome', { address: home })} · ${etaText(etas.home, timeZone, nearbyLabel)}`
              : t('places.navHome', { address: home })
          }
          icon={<HomeIcon className="size-3.5" />}
          label={t('places.homeShort')}
          eta={etas.home}
          loading={loading}
          timeZone={timeZone}
          nearbyLabel={nearbyLabel}
        />
      )}
      {work && (
        <PlaceChip
          href={wazeNavigateUrl(work)}
          title={
            etas.work
              ? `${t('places.navWork', { address: work })} · ${etaText(etas.work, timeZone, nearbyLabel)}`
              : t('places.navWork', { address: work })
          }
          icon={<BriefcaseIcon className="size-3.5" />}
          label={t('places.workShort')}
          eta={etas.work}
          loading={loading}
          timeZone={timeZone}
          nearbyLabel={nearbyLabel}
        />
      )}
    </div>
  );
}
