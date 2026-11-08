import { html, render, useState, useEffect, useRef, useLayoutEffect } from '../lib.js';
import { createStore, useStore } from '../store.js';
import { cx, haptic, hashHue, AVATARS, randomAvatar, reducedMotion } from '../util.js';
import { sound } from '../fx.js';

// ====================== LOGO ======================
export function Logo({ size = 64, className = '' }) {
  return html`
    <svg class=${cx('logo', className)} width=${size} height=${size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <filter id="neonGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.8" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" filter="url(#neonGlow)">
        <path d="M32 5 V49" stroke="#ffe14d" />
        <path d="M32 6.5 L44.5 10 L32 13.5" stroke="#19e6ff" />
        <circle cx="32" cy="24" r="5.6" stroke="#b6ff3b" />
        <path d="M14.5 36 q4.4 -4.2 8.8 0 t8.8 0 t8.8 0 t8.8 0" stroke="#ff2e9a" />
        <rect x="13" y="39.5" width="38" height="13" rx="5" stroke="#ff9f43" />
      </g>
    </svg>`;
}

// ====================== PORTAL ======================
/** Renderiza los hijos directamente en <body> (para modales, evitando contenedores con transform). */
export function Portal({ children }) {
  const host = useRef(null);
  if (!host.current && typeof document !== 'undefined') {
    host.current = document.createElement('div');
    host.current.className = 'portal';
  }
  useLayoutEffect(() => {
    document.body.appendChild(host.current);
    return () => {
      render(null, host.current);
      host.current.remove();
    };
  }, []);
  useLayoutEffect(() => {
    render(children, host.current);
  });
  return null;
}

// ====================== BOTONES ======================
export function Button({
  variant = 'primary', size = '', block = false, loading = false, disabled = false, icon = null,
  children, onClick, type = 'button', className = '', ...rest
}) {
  return html`
    <button
      type=${type}
      class=${cx('btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)}
      disabled=${disabled || loading}
      onClick=${(e) => {
        haptic(8);
        sound.play('tick');
        onClick?.(e);
      }}
      ...${rest}
    >
      ${loading ? html`<span class="spinner" aria-hidden="true"></span>` : icon ? html`<span class="btn-icon" aria-hidden="true">${icon}</span>` : null}
      ${children != null && children !== false ? html`<span class="btn-label">${children}</span>` : null}
    </button>`;
}

export function IconButton({ label, children, onClick, className = '', ...rest }) {
  return html`
    <button type="button" class=${cx('icon-btn', className)} aria-label=${label} title=${label}
      onClick=${(e) => { haptic(6); onClick?.(e); }} ...${rest}>${children}</button>`;
}

export const Spinner = ({ size = 22 }) => html`<span class="spinner" style=${{ width: `${size}px`, height: `${size}px` }}></span>`;

// ====================== AVATARES ======================
export function Avatar({ emoji, name = '', size = 40, ring = true, className = '' }) {
  const hue = hashHue(name || emoji || '');
  return html`
    <span class=${cx('avatar', ring && 'avatar-ring', className)}
      style=${{ '--h': hue, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.52)}px` }}
      aria-hidden="true">${emoji || '🙂'}</span>`;
}

export function AvatarStack({ players = [], max = 5, size = 30 }) {
  const shown = players.slice(0, max);
  const extra = players.length - shown.length;
  return html`
    <div class="avatar-stack">
      ${shown.map((p) => html`<${Avatar} key=${p.id} emoji=${p.avatar} name=${p.name} size=${size} />`)}
      ${extra > 0 ? html`<span class="avatar avatar-more" style=${{ width: `${size}px`, height: `${size}px` }}>+${extra}</span>` : null}
    </div>`;
}

export function EmojiPicker({ value, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current?.querySelector('.is-selected');
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);
  return html`
    <div class="emoji-picker" ref=${ref} role="radiogroup" aria-label="Elige tu avatar">
      <button type="button" class="emoji-opt emoji-dice" aria-label="Avatar aleatorio"
        onClick=${() => { haptic(10); sound.play('pop'); onChange(randomAvatar()); }}>🎲</button>
      ${AVATARS.map((e) => html`
        <button type="button" key=${e} role="radio" aria-checked=${value === e}
          class=${cx('emoji-opt', value === e && 'is-selected')}
          onClick=${() => { haptic(8); sound.play('tick'); onChange(e); }}>${e}</button>`)}
    </div>`;
}

// ====================== FORMULARIOS ======================
export function Field({ label, hint, children, counter }) {
  return html`
    <label class="field">
      ${label ? html`<span class="field-label">${label}${counter ? html`<span class="field-counter">${counter}</span>` : null}</span>` : null}
      ${children}
      ${hint ? html`<span class="field-hint">${hint}</span>` : null}
    </label>`;
}

export function Toggle({ checked, onChange, label, hint, disabled = false }) {
  return html`
    <label class=${cx('toggle', disabled && 'is-disabled')}>
      <span class="toggle-text">
        <span class="toggle-label">${label}</span>
        ${hint ? html`<span class="toggle-hint">${hint}</span>` : null}
      </span>
      <input type="checkbox" checked=${checked} disabled=${disabled}
        onChange=${(e) => { haptic(8); sound.play('tick'); onChange(e.currentTarget.checked); }} />
      <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
    </label>`;
}

export function OptionCards({ options, value, onChange, disabled = false, columns = 3 }) {
  return html`
    <div class=${cx('option-cards', `cols-${columns}`)} role="radiogroup">
      ${options.map((o) => html`
        <button type="button" key=${o.id} role="radio" aria-checked=${value === o.id} disabled=${disabled}
          class=${cx('option-card', value === o.id && 'is-selected')}
          onClick=${() => { haptic(10); sound.play('pop'); onChange(o.id); }}>
          <span class="option-emoji" aria-hidden="true">${o.emoji}</span>
          <span class="option-title">${o.label}</span>
          ${o.sub ? html`<span class="option-sub">${o.sub}</span>` : null}
        </button>`)}
    </div>`;
}

// ====================== CONTADOR ANIMADO ======================
export function CountUp({ value = 0, duration = 1100, delay = 0, className = '' }) {
  const [n, setN] = useState(reducedMotion() ? value : 0);
  useEffect(() => {
    if (reducedMotion()) {
      setN(value);
      return undefined;
    }
    let raf = 0;
    let start = 0;
    const t = setTimeout(() => {
      const step = (ts) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / duration);
        const eased = 1 - (1 - p) ** 3;
        setN(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return html`<span class=${className}>${n}</span>`;
}

// ====================== HOJA INFERIOR (BOTTOM SHEET) ======================
export function Sheet({ open, onClose, title, children, className = '', tall = false, footer = null }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 240);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', onKey);
    document.documentElement.classList.add('has-sheet');
    return () => {
      removeEventListener('keydown', onKey);
      if (!document.querySelector('.sheet-wrap:not(.closing)')) document.documentElement.classList.remove('has-sheet');
    };
  }, [mounted]);

  if (!mounted) return null;

  // Deslizar hacia abajo para cerrar (desde el "asa" o la cabecera)
  const onDown = (e) => {
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${d.dy}px)`;
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !sheetRef.current) return;
    sheetRef.current.style.transition = '';
    sheetRef.current.style.transform = '';
    if (d.dy > 110) onClose?.();
  };

  return html`
    <${Portal}>
      <div class=${cx('sheet-wrap', closing && 'closing')}>
        <div class="sheet-backdrop" onClick=${onClose}></div>
        <div class=${cx('sheet', tall && 'sheet-tall', className)} ref=${sheetRef} role="dialog" aria-modal="true" aria-label=${title || 'Diálogo'}>
          <div class="sheet-handle" onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
            <span class="sheet-grip"></span>
            ${title
              ? html`<div class="sheet-head"><h2 class="sheet-title">${title}</h2>
                  <button type="button" class="icon-btn" aria-label="Cerrar" onPointerDown=${(e) => e.stopPropagation()} onClick=${onClose}>✕</button></div>`
              : null}
          </div>
          <div class="sheet-body">${children}</div>
          ${footer ? html`<div class="sheet-footer">${footer}</div>` : null}
        </div>
      </div>
    <//>`;
}

// ====================== TOASTS ======================
const toastStore = createStore([]);
let toastId = 0;

export function toast(text, { icon = '✨', type = 'info', ms = 2600 } = {}) {
  const id = ++toastId;
  toastStore.set((list) => [...list.slice(-2), { id, text, icon, type }]);
  setTimeout(() => toastStore.set((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), ms);
  setTimeout(() => toastStore.set((list) => list.filter((t) => t.id !== id)), ms + 320);
}
export const toastError = (text) => {
  sound.play('error');
  haptic([30, 40, 30]);
  toast(text, { icon: '⚠️', type: 'error', ms: 4200 });
};

export function Toasts() {
  const list = useStore(toastStore);
  return html`
    <div class="toasts" aria-live="polite">
      ${list.map((t) => html`
        <div key=${t.id} class=${cx('toast', `toast-${t.type}`, t.leaving && 'leaving')}>
          <span class="toast-icon">${t.icon}</span><span class="toast-text">${t.text}</span>
        </div>`)}
    </div>`;
}

// ====================== DIÁLOGO DE CONFIRMACIÓN ======================
const dialogStore = createStore(null);

export function confirmDialog({ title, message = '', confirm = 'Aceptar', cancel = 'Cancelar', danger = false, emoji = '🤔' }) {
  return new Promise((resolve) => {
    dialogStore.get()?.resolve(false);
    dialogStore.set({ title, message, confirm, cancel, danger, emoji, resolve });
  });
}

export function DialogHost() {
  const d = useStore(dialogStore);
  if (!d) return null;
  const close = (v) => {
    haptic(8);
    d.resolve(v);
    dialogStore.set(null);
  };
  return html`
    <div class="dialog-wrap">
      <div class="dialog-backdrop" onClick=${() => close(false)}></div>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-label=${d.title}>
        <div class="dialog-emoji" aria-hidden="true">${d.emoji}</div>
        <h3 class="dialog-title">${d.title}</h3>
        ${d.message ? html`<p class="dialog-msg">${d.message}</p>` : null}
        <div class="dialog-actions">
          ${d.cancel ? html`<button type="button" class="btn btn-ghost" onClick=${() => close(false)}><span class="btn-label">${d.cancel}</span></button>` : null}
          <button type="button" class=${cx('btn', d.danger ? 'btn-danger' : 'btn-primary')} onClick=${() => close(true)}><span class="btn-label">${d.confirm}</span></button>
        </div>
      </div>
    </div>`;
}

// ====================== VARIOS ======================
export function Empty({ emoji = '🍢', title, text, children }) {
  return html`
    <div class="empty">
      <div class="empty-emoji" aria-hidden="true">${emoji}</div>
      ${title ? html`<h3 class="empty-title">${title}</h3>` : null}
      ${text ? html`<p class="empty-text">${text}</p>` : null}
      ${children}
    </div>`;
}

/** Contenedor de foto con fallback bonito. */
export function DishImage({ src, num, alt = '', hidden = false, className = '', children }) {
  const hue = (Number(num) || 1) * 47;
  return html`
    <div class=${cx('dish-img', !src && 'is-empty', hidden && 'is-hidden', className)} style=${{ '--h': hue % 360 }}>
      ${src && !hidden ? html`<img src=${src} alt=${alt} decoding="async" loading="lazy" draggable="false" />` : null}
      ${!src || hidden
        ? html`<span class="dish-img-ph" aria-hidden="true">${hidden ? '🙈' : '🍢'}</span>`
        : null}
      ${children}
    </div>`;
}
