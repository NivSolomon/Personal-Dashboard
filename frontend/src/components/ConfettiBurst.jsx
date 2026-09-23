import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/celebrate.js';

const PALETTE = ['#6366f1', '#7c3aed', '#22c55e', '#f59e0b', '#f43f5e', '#38bdf8', '#f8fafc'];

function spawn(width, height, count) {
  const pieces = [];
  const origins = [
    { x: width * 0.08, y: height * 0.92, vx: 9, vy: -19 },
    { x: width * 0.92, y: height * 0.92, vx: -9, vy: -19 },
    { x: width * 0.5, y: height * 0.42, vx: 0, vy: -7 },
  ];

  for (let i = 0; i < count; i += 1) {
    const origin = origins[i % origins.length];
    const air = i % 3 === 0;
    const drift = origin.x === width * 0.5 ? (Math.random() - 0.5) * 18 : (Math.random() - 0.5) * 7;
    pieces.push({
      x: air ? width * (0.15 + Math.random() * 0.7) : origin.x,
      y: air ? height * (0.15 + Math.random() * 0.45) : origin.y,
      vx: origin.vx + drift,
      vy: origin.vy - Math.random() * 6,
      w: 7 + Math.random() * 10,
      h: 9 + Math.random() * 12,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.32,
      color: PALETTE[i % PALETTE.length],
      shape: i % 5 === 0 ? 'circle' : i % 4 === 0 ? 'diamond' : 'rect',
      life: 1,
    });
  }
  return pieces;
}

export default function ConfettiBurst({
  active = false,
  duration = 2800,
  pieces = 128,
  className = 'pointer-events-none fixed inset-0 z-40',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let bits = spawn(window.innerWidth, window.innerHeight, pieces);
    let raf = 0;
    const started = performance.now();

    const tick = (now) => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      bits = bits.filter((bit) => bit.life > 0 && bit.y < window.innerHeight + 40);
      for (const bit of bits) {
        bit.vy += 0.22;
        bit.vx *= 0.995;
        bit.x += bit.vx;
        bit.y += bit.vy;
        bit.rot += bit.vr;
        bit.life = 1 - elapsed / duration;
        ctx.save();
        ctx.translate(bit.x, bit.y);
        ctx.rotate(bit.rot);
        ctx.globalAlpha = Math.max(bit.life, 0);
        ctx.fillStyle = bit.color;
        if (bit.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, bit.w * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else if (bit.shape === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(0, -bit.h / 2);
          ctx.lineTo(bit.w / 2, 0);
          ctx.lineTo(0, bit.h / 2);
          ctx.lineTo(-bit.w / 2, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
        }
        ctx.restore();
      }
      if (elapsed < duration && bits.length) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, duration, pieces]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
    />
  );
}
