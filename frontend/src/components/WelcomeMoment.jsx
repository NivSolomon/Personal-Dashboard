import { useEffect, useState } from 'react';
import { takeOnboardWelcome } from '../lib/celebrate.js';
import { playUi } from '../lib/sounds.js';
import { useT } from '../lib/i18n.jsx';
import { LayoutIcon, SparkleIcon } from './icons.jsx';
import ConfettiBurst from './ConfettiBurst.jsx';
import Toast from './Toast.jsx';

export default function WelcomeMoment({ firstName, onCustomize }) {
  const { t } = useT();
  const [welcome] = useState(takeOnboardWelcome);
  const [confetti, setConfetti] = useState(() => Boolean(welcome));
  const [step, setStep] = useState(() => (welcome ? 0 : -1));

  useEffect(() => {
    if (!welcome) return undefined;
    if (welcome.late) playUi('celebrate');
    const timer = window.setTimeout(() => setConfetti(false), welcome.late ? 3000 : 2200);
    return () => window.clearTimeout(timer);
  }, [welcome]);

  if (!welcome || step < 0) return null;

  const toasts = [
    {
      message: firstName
        ? t('onboard.toastWelcomeNamed', { name: firstName })
        : t('onboard.toastWelcome'),
      icon: <SparkleIcon className="size-5" />,
      tone: 'success',
      duration: 4600,
      sound: welcome.late ? null : 'success',
    },
    {
      message: t('onboard.toastLayout'),
      actionLabel: t('customize'),
      icon: <LayoutIcon className="size-5" />,
      tone: 'tip',
      duration: 8000,
      onAction: () => {
        onCustomize?.();
        setStep(-1);
      },
    },
  ];
  const current = toasts[step];

  return (
    <>
      <ConfettiBurst active={confetti} duration={welcome.late ? 3000 : 2000} pieces={welcome.late ? 140 : 72} />
      {current && (
        <Toast
          open
          message={current.message}
          actionLabel={current.actionLabel}
          icon={current.icon}
          tone={current.tone}
          duration={current.duration}
          sound={current.sound}
          onAction={current.onAction}
          onClose={() => setStep((index) => (index + 1 < toasts.length ? index + 1 : -1))}
        />
      )}
    </>
  );
}
