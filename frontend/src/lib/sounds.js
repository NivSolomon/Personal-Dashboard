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
  return ctx;
}

/** Browsers keep AudioContext suspended until a user gesture; tones started
 *  before resume() finishes are silent. Call this from pointer/key handlers. */
export function unlockAudio() {
  const context = audio();
  if (!context) return null;
  if (context.state === 'suspended') void context.resume();
  return context;
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

let noiseBuffer = null;

function noise(context) {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;
  const length = Math.floor(context.sampleRate * 0.08);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  noiseBuffer = buffer;
  return buffer;
}

/** Soft key-tick: bandpass noise plus a quiet falling sine, not a raw beep. */
function tick(context, { delay = 0, bright = 2100, body = 390, gain = 0.042 } = {}) {
  const start = context.currentTime + delay;
  const src = context.createBufferSource();
  src.buffer = noise(context);
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(bright, start);
  filter.Q.setValueAtTime(1.05, start);
  const air = context.createGain();
  air.gain.setValueAtTime(0.0001, start);
  air.gain.exponentialRampToValueAtTime(gain, start + 0.003);
  air.gain.exponentialRampToValueAtTime(0.0001, start + 0.028);
  src.connect(filter);
  filter.connect(air);
  air.connect(context.destination);
  src.start(start);
  src.stop(start + 0.04);

  const osc = context.createOscillator();
  const low = context.createBiquadFilter();
  const bodyAmp = context.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(body, start);
  osc.frequency.exponentialRampToValueAtTime(body * 0.72, start + 0.05);
  low.type = 'lowpass';
  low.frequency.setValueAtTime(1400, start);
  low.frequency.exponentialRampToValueAtTime(520, start + 0.05);
  bodyAmp.gain.setValueAtTime(0.0001, start);
  bodyAmp.gain.exponentialRampToValueAtTime(gain * 0.38, start + 0.005);
  bodyAmp.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
  osc.connect(low);
  low.connect(bodyAmp);
  bodyAmp.connect(context.destination);
  osc.start(start);
  osc.stop(start + 0.07);
}

const KINDS = {
  tap: (c) => tick(c),
  nav: (c) => tick(c, { bright: 1650, body: 320, gain: 0.036 }),
  focus: (c) => tick(c, { bright: 2550, body: 520, gain: 0.028 }),
  toggle: (c) => {
    tick(c, { bright: 1900, body: 340, gain: 0.034 });
    tick(c, { delay: 0.042, bright: 2400, body: 460, gain: 0.03 });
  },
  success: (c) => {
    tone(c, { freq: 523, duration: 0.07, gain: 0.035, type: 'sine' });
    tone(c, { freq: 659, duration: 0.08, gain: 0.035, type: 'sine', delay: 0.07 });
    tone(c, { freq: 784, duration: 0.12, gain: 0.04, type: 'sine', delay: 0.14 });
  },
  celebrate: (c) => {
    tone(c, { freq: 523, duration: 0.09, gain: 0.036, type: 'sine' });
    tone(c, { freq: 659, duration: 0.09, gain: 0.036, type: 'sine', delay: 0.09 });
    tone(c, { freq: 784, duration: 0.1, gain: 0.038, type: 'sine', delay: 0.18 });
    tone(c, { freq: 1046, duration: 0.22, gain: 0.044, type: 'triangle', delay: 0.28 });
    tone(c, { freq: 1568, duration: 0.16, gain: 0.02, type: 'sine', delay: 0.36 });
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
  if (!force && now - lastPlayAt < 50) return;
  lastPlayAt = now;
  const context = unlockAudio();
  if (!context) return;
  const run = () => {
    if (context.state === 'closed') return;
    (KINDS[kind] || KINDS.tap)(context);
  };
  if (context.state === 'suspended') {
    void context.resume().then(run).catch(() => {});
    return;
  }
  run();
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
