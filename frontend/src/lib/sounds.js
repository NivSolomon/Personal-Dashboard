import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ui-sounds';
const listeners = new Set();

let ctx = null;
let lastPlayAt = 0;

function enabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function notify(on) {
  listeners.forEach((fn) => fn(on));
}

function audio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(context, { freq, endFreq, duration = 0.07, gain = 0.045, type = 'sine', delay = 0 }) {
  const start = context.currentTime + delay;
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(context.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

const KINDS = {
  tap: (c) => tone(c, { freq: 920, duration: 0.045, gain: 0.035, type: 'triangle' }),
  nav: (c) => tone(c, { freq: 640, endFreq: 880, duration: 0.08, gain: 0.03, type: 'sine' }),
  toggle: (c) => {
    tone(c, { freq: 620, duration: 0.05, gain: 0.03, type: 'triangle' });
    tone(c, { freq: 880, duration: 0.07, gain: 0.032, type: 'sine', delay: 0.05 });
  },
  success: (c) => {
    tone(c, { freq: 523, duration: 0.07, gain: 0.035, type: 'sine' });
    tone(c, { freq: 659, duration: 0.08, gain: 0.035, type: 'sine', delay: 0.07 });
    tone(c, { freq: 784, duration: 0.12, gain: 0.04, type: 'sine', delay: 0.14 });
  },
  complete: (c) => {
    tone(c, { freq: 698, duration: 0.08, gain: 0.038, type: 'sine' });
    tone(c, { freq: 880, duration: 0.14, gain: 0.04, type: 'triangle', delay: 0.08 });
  },
  warn: (c) => tone(c, { freq: 280, endFreq: 170, duration: 0.14, gain: 0.04, type: 'square' }),
  error: (c) => {
    tone(c, { freq: 240, duration: 0.1, gain: 0.04, type: 'square' });
    tone(c, { freq: 180, duration: 0.14, gain: 0.038, type: 'square', delay: 0.1 });
  },
  alert: (c) => {
    tone(c, { freq: 880, duration: 0.09, gain: 0.045, type: 'triangle' });
    tone(c, { freq: 880, duration: 0.12, gain: 0.04, type: 'triangle', delay: 0.16 });
  },
};

/** Short UI blip. Safe to call from clicks; no-ops when muted or without Web Audio. */
export function playUi(kind = 'tap', { force = false } = {}) {
  if (!force && !enabled()) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!force && now - lastPlayAt < 35 && kind === 'tap') return;
  lastPlayAt = now;
  const context = audio();
  if (!context) return;
  (KINDS[kind] || KINDS.tap)(context);
}

export function setSoundsEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore quota / private mode */
  }
  notify(Boolean(on));
}

export function subscribeSounds(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSounds() {
  const [on, setOn] = useState(enabled);
  useEffect(() => subscribeSounds(setOn), []);

  const toggle = useCallback(() => {
    const next = !on;
    if (next) {
      setSoundsEnabled(true);
      playUi('toggle', { force: true });
    } else {
      playUi('tap', { force: true });
      setSoundsEnabled(false);
    }
    setOn(next);
  }, [on]);

  return { enabled: on, toggle, play: playUi };
}
