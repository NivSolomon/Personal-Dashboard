import Card from './Card.jsx';
import { BikeIcon, DumbbellIcon, DropletIcon, RunIcon, WindIcon } from './icons.jsx';
import { useT } from '../lib/i18n.jsx';

const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

function sportOf(point) {
  if (point?.sport) return point.sport;
  const temp = point?.temp ?? 0;
  const windKmh = point?.windKmh ?? 0;
  const rainChance = point?.rainChance ?? 0;
  const flags = [];
  if (point?.wet || rainChance >= 40) flags.push('rain');
  if (temp >= 27) flags.push('heat');
  else if (temp <= 6) flags.push('cold');
  if (windKmh >= 28) flags.push('wind');
  let verdict = 'go';
  if (flags.includes('rain') || temp >= 31) verdict = 'skip';
  else if (flags.length || temp >= 27) verdict = 'caution';
  return {
    verdict,
    bestFor: verdict === 'skip' ? 'indoor' : 'run',
    flags,
    score: verdict === 'go' ? 80 : verdict === 'caution' ? 55 : 20,
  };
}

function SportGlyph({ sport, className }) {
  if (sport === 'ride') return <BikeIcon className={className} />;
  if (sport === 'indoor') return <DumbbellIcon className={className} />;
  return <RunIcon className={className} />;
}

function flagReason(flags, slot, t) {
  if (flags.includes('rain')) {
    return slot?.rainChance ? t('weather.rainChance', { n: slot.rainChance }) : t('weather.rain');
  }
  if (flags.includes('heat')) return t('weather.hotTrain', { temp: slot?.temp });
  if (flags.includes('cold')) return t('weather.cold', { temp: slot?.temp });
  if (flags.includes('wind')) return t('weather.windKmh', { n: slot?.windKmh });
  if (flags.includes('humid')) return t('weather.humidHeat');
  if (!slot) return '';
  return t('weather.tempWind', { temp: slot.temp, wind: slot.windKmh });
}

function headline({ mode, sport, later }, t) {
  if (mode === 'later' && later) {
    const activity = t(`weather.sport.${later.sport?.bestFor || 'run'}`);
    return {
      title: t('weather.laterTitle'),
      detail: t('weather.laterDetail', { activity, hour: hourLabel(later.hour) }),
    };
  }
  if (mode === 'skip') {
    return {
      title: t('weather.indoorTitle'),
      detail: t('weather.indoorDetail'),
    };
  }
  if (sport === 'ride') {
    return {
      title: mode === 'caution' ? t('weather.rideEasy') : t('weather.rideGood'),
      detail: mode === 'caution' ? t('weather.rideEasyDetail') : t('weather.rideGoodDetail'),
    };
  }
  return {
    title: mode === 'caution' ? t('weather.runEasy') : t('weather.runGood'),
    detail: mode === 'caution' ? t('weather.runEasyDetail') : t('weather.runGoodDetail'),
  };
}

function whyNow(flags, current, t) {
  const parts = [];
  if (flags.includes('heat')) {
    parts.push(
      current.feelsLike != null && current.feelsLike !== current.temp
        ? t('weather.heatLoadFeels', { temp: current.temp, feels: current.feelsLike })
        : t('weather.heatLoad', { temp: current.temp }),
    );
  }
  if (flags.includes('rain')) parts.push(t('weather.expectRain'));
  if (flags.includes('wind')) parts.push(t('weather.windKmh', { n: current.windKmh }));
  if (flags.includes('cold')) parts.push(t('weather.needLayers'));
  if (flags.includes('humid')) parts.push(t('weather.humid'));
  return parts.join(' · ');
}

function verdictTone(mode) {
  if (mode === 'go') return 'green';
  if (mode === 'skip') return 'rose';
  return 'amber';
}

function panelClasses(mode) {
  if (mode === 'go') return 'bg-tone-green text-tone-green-fg';
  if (mode === 'skip') return 'bg-tone-rose text-tone-rose-fg';
  return 'bg-tone-amber text-tone-amber-fg';
}

export default function WeatherCard({ weather, loading, error }) {
  const { t } = useT();
  const nowSport = sportOf(weather?.current);
  const best = (weather?.bestWindows || []).filter((slot) => sportOf(slot).verdict !== 'skip');
  const later = best[0] || null;
  const waiting = nowSport.verdict === 'skip' && Boolean(later);
  const mode = waiting ? 'later' : nowSport.verdict;
  const copy = weather
    ? headline({ mode, sport: nowSport.bestFor, later }, t)
    : { title: '', detail: '' };
  const reason = weather ? whyNow(nowSport.flags, weather.current, t) : '';
  const coolest =
    best.length === 0 && weather?.coolestWindows?.length ? weather.coolestWindows : [];
  const badge = weather ? t(`weather.${mode}`) : null;
  const glyphSport =
    mode === 'skip' ? 'indoor' : waiting ? later?.sport?.bestFor || 'run' : nowSport.bestFor;

  return (
    <Card
      title={t('widget.weather.title')}
      icon={<RunIcon className="size-4.5" />}
      tone={verdictTone(mode)}
      badge={badge}
      loading={loading}
      error={error}
      layout="plain"
      empty={!weather}
      emptyText={t('weather.empty')}
    >
      {weather && (
        <div className="space-y-4">
          <div className={`flex items-start gap-3 rounded-xl px-3 py-3 ${panelClasses(mode)}`}>
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/40 dark:bg-black/20">
              <SportGlyph sport={glyphSport} className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{copy.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed opacity-90">
                {reason || copy.detail}
              </p>
              {mode === 'later' && reason && (
                <p className="mt-1 text-xs leading-relaxed opacity-80">{copy.detail}</p>
              )}
            </div>
          </div>

          {best.length > 0 ? (
            <div>
              <p className="text-muted text-xs font-semibold">{t('weather.when')}</p>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {best.map((slot) => {
                  const sport = sportOf(slot);
                  return (
                    <li
                      key={slot.at}
                      className="border-border-subtle bg-tone-neutral rounded-xl border px-3 py-2.5"
                    >
                      <p className="text-foreground text-lg font-semibold tabular-nums">
                        {hourLabel(slot.hour)}
                      </p>
                      <p className="text-foreground mt-0.5 flex items-center gap-1.5 text-xs font-medium">
                        <SportGlyph sport={sport.bestFor} className="size-3.5" />
                        {t(`weather.sport.${sport.bestFor}`)}
                      </p>
                      <p className="text-muted mt-1 text-xs">{flagReason(sport.flags, slot, t)}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div>
              <p className="text-muted text-xs font-semibold">{t('weather.when')}</p>
              <p className="text-muted mt-1.5 text-sm leading-relaxed">{t('weather.noWindow')}</p>
              {coolest.length > 0 && (
                <p className="text-subtle mt-2 text-xs">
                  {coolest.every((slot) => slot.temp >= 27)
                    ? t('weather.eveningHot', { temp: Math.min(...coolest.map((slot) => slot.temp)) })
                    : t('weather.coolerHours', {
                        hours: coolest
                          .map((slot) => `${hourLabel(slot.hour)} · ${slot.temp}°`)
                          .join(' · '),
                      })}
                </p>
              )}
            </div>
          )}

          {(weather.rainExpected || nowSport.flags.includes('wind')) && best.length > 0 && (
            <p className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {weather.rainExpected && (
                <span className="inline-flex items-center gap-1">
                  <DropletIcon className="size-3.5" />
                  {t('weather.rainDay')}
                </span>
              )}
              {nowSport.flags.includes('wind') && (
                <span className="inline-flex items-center gap-1">
                  <WindIcon className="size-3.5" />
                  {t('weather.strongWind')}
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
