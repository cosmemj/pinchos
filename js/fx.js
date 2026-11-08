// Efectos: confeti en canvas + sonidos sintetizados con Web Audio (sin archivos de audio).
import { local, reducedMotion } from './util.js';

// ======================= CONFETI =======================
const COLORS = ['#ff2e9a', '#19e6ff', '#b6ff3b', '#ffe14d', '#8b5cff', '#ff8a3d', '#ffffff'];
let canvas = null;
let ctx = null;
let parts = [];
let raf = 0;
let dpr = 1;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  };
  resize();
  addEventListener('resize', resize);
}

/**
 * Explosión de confeti.
 * angle: dirección en grados (-90 = hacia arriba). spread: apertura en grados.
 */
export function burst({
  x = innerWidth / 2, y = innerHeight / 2, count = 70, angle = -90, spread = 360,
  speed = 10, gravity = 0.28, colors = COLORS, emojis = null, size = 1, ttl = 150,
} = {}) {
  if (reducedMotion()) count = Math.min(count, 18);
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const a = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const v = speed * (0.35 + Math.random() * 0.85);
    const isEmoji = emojis && Math.random() < 0.3;
    parts.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      g: gravity,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      s: (5 + Math.random() * 7) * size,
      c: colors[(Math.random() * colors.length) | 0],
      shape: isEmoji ? 'emoji' : Math.random() < 0.55 ? 'rect' : 'circle',
      e: isEmoji ? emojis[(Math.random() * emojis.length) | 0] : null,
      life: 0,
      ttl: ttl * (0.7 + Math.random() * 0.6),
      wob: Math.random() * 10,
    });
  }
  if (parts.length > 900) parts.splice(0, parts.length - 900);
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  const w = innerWidth;
  const h = innerHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  parts = parts.filter((p) => p.life < p.ttl && p.y < h + 60);
  for (const p of parts) {
    p.life++;
    p.vx *= 0.986;
    p.vy = p.vy * 0.986 + p.g;
    p.x += p.vx + Math.sin((p.life + p.wob) * 0.12) * 0.6;
    p.y += p.vy;
    p.rot += p.vr;
    ctx.globalAlpha = Math.max(0, Math.min(1, (p.ttl - p.life) / 35));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.shape === 'emoji') {
      ctx.font = `${p.s * 2.4}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.e, 0, 0);
    } else {
      ctx.fillStyle = p.c;
      if (p.shape === 'rect') {
        ctx.scale(1, Math.cos(p.life * 0.15 + p.wob));
        ctx.fillRect(-p.s / 2, -p.s / 3, p.s, (p.s * 2) / 3);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.s / 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (parts.length) raf = requestAnimationFrame(tick);
  else {
    ctx.clearRect(0, 0, w, h);
    raf = 0;
  }
}

/** Cañones de confeti desde las esquinas inferiores. */
export function cannons({ emojis = null, count = 90 } = {}) {
  burst({ x: -10, y: innerHeight + 10, angle: -62, spread: 34, speed: 24, count, emojis, gravity: 0.32 });
  burst({ x: innerWidth + 10, y: innerHeight + 10, angle: -118, spread: 34, speed: 24, count, emojis, gravity: 0.32 });
}

/** Fuegos artificiales durante `ms` milisegundos. Devuelve función para pararlos. */
export function fireworks(ms = 3000) {
  let stopped = false;
  const end = Date.now() + ms;
  const shoot = () => {
    if (stopped || Date.now() > end) return;
    const palette = [COLORS[(Math.random() * 5) | 0], '#ffffff', '#ffe14d'];
    burst({
      x: innerWidth * (0.15 + Math.random() * 0.7),
      y: innerHeight * (0.12 + Math.random() * 0.35),
      count: 36, speed: 7.5, gravity: 0.12, colors: palette, size: 0.8, ttl: 100,
    });
    setTimeout(shoot, 280 + Math.random() * 380);
  };
  shoot();
  return () => { stopped = true; };
}

export function clearConfetti() {
  parts = [];
}

/** Coloca el lienzo del confeti dentro de un contenedor (p. ej. la gala) para que no tape sus botones. */
export function mountConfetti(container = document.body) {
  ensureCanvas();
  if (canvas.parentNode !== container) container.appendChild(canvas);
  canvas.classList.toggle('is-nested', container !== document.body);
}

// ======================= SONIDO =======================
let ac = null;
let master = null;
let noiseBuffer = null;
let muted = local.get('pdo:muted', false);
const listeners = new Set();

function ensureAudio() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.7;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp).connect(ac.destination);
  return ac;
}

function getNoise() {
  if (noiseBuffer) return noiseBuffer;
  const len = ac.sampleRate * 2;
  noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function envelope(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(out, { type = 'sine', f = 440, f2 = 0, t = ac.currentTime, a = 0.005, d = 0.2, v = 0.3 }) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  envelope(g, t, a, v, d);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + a + d + 0.05);
}

function noise(out, { t = ac.currentTime, a = 0.002, d = 0.1, v = 0.3, type = 'bandpass', freq = 2000, freq2 = 0, q = 1 }) {
  const s = ac.createBufferSource();
  s.buffer = getNoise();
  s.loop = true;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + a + d);
  f.Q.value = q;
  const g = ac.createGain();
  envelope(g, t, a, v, d);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 1.5);
  s.stop(t + a + d + 0.05);
}

function brass(out, f, t, dur, v = 0.12) {
  const o1 = ac.createOscillator();
  const o2 = ac.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'sawtooth';
  o1.frequency.value = f;
  o2.frequency.value = f * 1.005;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f * 1.4, t);
  lp.frequency.linearRampToValueAtTime(f * 5, t + 0.07);
  lp.frequency.linearRampToValueAtTime(f * 2.6, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.05);
  g.gain.setValueAtTime(v, t + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g).connect(out);
  o1.start(t);
  o2.start(t);
  o1.stop(t + dur + 0.3);
  o2.stop(t + dur + 0.3);
}

const SOUNDS = {
  tick: (o) => tone(o, { type: 'triangle', f: 1500, d: 0.035, v: 0.07 }),
  pop: (o) => tone(o, { type: 'sine', f: 360, f2: 1000, d: 0.13, v: 0.3 }),
  unpop: (o) => tone(o, { type: 'sine', f: 900, f2: 280, d: 0.13, v: 0.22 }),
  shutter: (o) => {
    noise(o, { type: 'highpass', freq: 3200, d: 0.05, v: 0.4 });
    noise(o, { t: ac.currentTime + 0.075, type: 'highpass', freq: 2400, d: 0.07, v: 0.28 });
  },
  stamp: (o) => {
    tone(o, { type: 'sine', f: 150, f2: 42, d: 0.4, v: 0.85 });
    noise(o, { type: 'lowpass', freq: 900, d: 0.2, v: 0.55 });
  },
  whoosh: (o) => noise(o, { type: 'bandpass', freq: 300, freq2: 3800, a: 0.18, d: 0.32, v: 0.3, q: 0.7 }),
  boom: (o) => {
    tone(o, { type: 'sine', f: 170, f2: 36, d: 1, v: 0.9 });
    noise(o, { type: 'lowpass', freq: 700, d: 0.55, v: 0.45 });
  },
  ding: (o) => {
    const t = ac.currentTime;
    tone(o, { type: 'triangle', f: 1318.5, d: 1.3, v: 0.22, t });
    tone(o, { type: 'sine', f: 1975.5, d: 1, v: 0.12, t: t + 0.012 });
  },
  success: (o) => {
    const t = ac.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(o, { type: 'triangle', f, t: t + i * 0.075, d: 0.28, v: 0.18 }));
  },
  join: (o) => {
    const t = ac.currentTime;
    tone(o, { type: 'sine', f: 660, t, d: 0.12, v: 0.15 });
    tone(o, { type: 'sine', f: 990, t: t + 0.09, d: 0.18, v: 0.15 });
  },
  beep: (o) => tone(o, { type: 'square', f: 880, d: 0.09, v: 0.07 }),
  error: (o) => tone(o, { type: 'square', f: 220, f2: 160, d: 0.22, v: 0.08 }),
  crash: (o) => {
    noise(o, { type: 'highpass', freq: 5000, a: 0.004, d: 2.4, v: 0.5 });
    noise(o, { type: 'bandpass', freq: 9000, a: 0.004, d: 1.6, v: 0.3, q: 0.5 });
  },
  fanfare: (o) => {
    const t0 = ac.currentTime + 0.03;
    const seq = [
      [392.0, 0, 0.15], [523.25, 0.16, 0.15], [659.25, 0.32, 0.15], [783.99, 0.48, 0.42],
      [659.25, 0.94, 0.13], [783.99, 1.1, 1.3],
    ];
    seq.forEach(([f, dt, dur]) => brass(o, f, t0 + dt, dur, 0.11));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => brass(o, f, t0 + 1.1, 1.5, 0.06));
    tone(o, { type: 'sine', f: 130.8, t: t0 + 1.1, a: 0.02, d: 1.8, v: 0.25 });
  },
};

export const sound = {
  get muted() {
    return muted;
  },
  setMuted(v) {
    muted = !!v;
    local.set('pdo:muted', muted);
    if (master) master.gain.value = muted ? 0 : 0.7;
    listeners.forEach((f) => f(muted));
  },
  onChange(f) {
    listeners.add(f);
    return () => listeners.delete(f);
  },
  /** Llamar desde un gesto del usuario para desbloquear el audio en móviles. */
  unlock() {
    try {
      const a = ensureAudio();
      if (a && a.state === 'suspended') a.resume();
    } catch {
      /* sin audio */
    }
  },
  get ready() {
    return !!ac && ac.state === 'running';
  },
  play(name) {
    if (!ac || muted || ac.state !== 'running') return;
    try {
      SOUNDS[name]?.(master);
    } catch {
      /* ignorar */
    }
  },
  /** Redoble de tambor creciente. Devuelve función para cortarlo. */
  drumroll(seconds = 3) {
    if (!ac || muted || ac.state !== 'running') return () => {};
    const bus = ac.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    const start = ac.currentTime + 0.02;
    const end = start + seconds;
    let t = start;
    while (t < end) {
      const p = (t - start) / seconds;
      noise(bus, { t, a: 0.002, d: 0.05, v: 0.05 + p * 0.32, type: 'bandpass', freq: 1500 + Math.random() * 700, q: 0.8 });
      if (Math.random() < 0.5) tone(bus, { type: 'triangle', f: 190 + Math.random() * 20, t, d: 0.04, v: 0.03 + p * 0.06 });
      t += 0.05 - p * 0.016 + (Math.random() - 0.5) * 0.006;
    }
    return () => {
      try {
        bus.gain.setTargetAtTime(0.0001, ac.currentTime, 0.03);
        setTimeout(() => bus.disconnect(), 400);
      } catch {
        /* ignorar */
      }
    };
  },
};

if (typeof window !== 'undefined') {
  const unlock = () => sound.unlock();
  ['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => addEventListener(ev, unlock, { capture: true, passive: true }));
}
