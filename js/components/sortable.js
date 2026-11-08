// Lista ordenable con arrastre táctil (pointer events), auto-scroll y animación FLIP al soltar.
import { html, useRef, useLayoutEffect } from '../lib.js';
import { haptic, cx } from '../util.js';
import { sound } from '../fx.js';

export function SortableList({ items, onChange, renderItem, className = '', getLabel = (x) => String(x) }) {
  const listRef = useRef(null);
  const drag = useRef(null);
  const flip = useRef(null);

  // Tras reordenar: animar la fila soltada desde donde estaba el dedo hasta su hueco.
  useLayoutEffect(() => {
    const f = flip.current;
    flip.current = null;
    const rows = listRef.current ? [...listRef.current.children] : [];
    rows.forEach((r) => {
      r.style.transition = 'none';
      r.style.transform = '';
    });
    if (f) {
      const row = rows.find((r) => r.dataset.key === f.key);
      if (row) {
        const top = row.getBoundingClientRect().top;
        row.style.transform = `translateY(${f.top - top}px)`;
        row.getBoundingClientRect();
        row.style.transition = 'transform 260ms cubic-bezier(.2,.9,.3,1.2)';
        row.style.transform = '';
      }
    }
    requestAnimationFrame(() => rows.forEach((r) => { if (!f || r.dataset.key !== f.key) r.style.transition = ''; }));
  }, [items]);

  const move = (from, to) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = items.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  function onPointerDown(e, index) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const rows = [...listRef.current.children];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 8;
    drag.current = {
      index, target: index, id: e.pointerId, startY: e.clientY, lastY: e.clientY,
      scroll0: window.scrollY, rows, rects, gap, raf: 0,
    };
    rows.forEach((r, i) => {
      if (i !== index) r.style.transition = 'transform 180ms ease';
    });
    rows[index].classList.add('is-dragging');
    rows[index].style.transition = 'none';
    e.currentTarget.setPointerCapture?.(e.pointerId);
    haptic(12);
    sound.play('pop');
    autoScroll();
  }

  function layout() {
    const d = drag.current;
    if (!d) return;
    const dy = d.lastY - d.startY + (window.scrollY - d.scroll0);
    const { rects, rows, index } = d;
    const h = rects[index].height + d.gap;
    rows[index].style.transform = `translateY(${dy}px) scale(1.03)`;
    const mid = rects[index].top + rects[index].height / 2 + dy;
    let target = index;
    for (let i = index - 1; i >= 0; i--) if (mid < rects[i].top + rects[i].height / 2) target = i;
    for (let i = index + 1; i < rects.length; i++) if (mid > rects[i].top + rects[i].height / 2) target = i;
    if (target !== d.target) {
      d.target = target;
      haptic(6);
      sound.play('tick');
    }
    rows.forEach((r, i) => {
      if (i === index) return;
      let shift = 0;
      if (index < target && i > index && i <= target) shift = -h;
      if (index > target && i >= target && i < index) shift = h;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function autoScroll() {
    const d = drag.current;
    if (!d) return;
    const edge = 90;
    const bottomEdge = innerHeight - 150;
    let v = 0;
    if (d.lastY < edge) v = -Math.ceil((edge - d.lastY) / 6);
    else if (d.lastY > bottomEdge) v = Math.ceil((d.lastY - bottomEdge) / 6);
    if (v) {
      window.scrollBy(0, v);
      layout();
    }
    d.raf = requestAnimationFrame(autoScroll);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.lastY = e.clientY;
    layout();
  }

  function onPointerUp(e) {
    const d = drag.current;
    if (!d || (e && e.pointerId !== d.id)) return;
    drag.current = null;
    cancelAnimationFrame(d.raf);
    const row = d.rows[d.index];
    const top = row.getBoundingClientRect().top;
    row.classList.remove('is-dragging');
    if (d.target !== d.index) {
      flip.current = { key: row.dataset.key, top };
      move(d.index, d.target);
      haptic(15);
      sound.play('pop');
    } else {
      d.rows.forEach((r) => {
        r.style.transition = 'transform 200ms ease';
        r.style.transform = '';
      });
    }
  }

  function onKeyDown(e, index) {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      move(index, index - 1);
    } else if (e.key === 'ArrowDown' && index < items.length - 1) {
      e.preventDefault();
      move(index, index + 1);
    }
  }

  return html`
    <ol class=${cx('sortable', className)} ref=${listRef}>
      ${items.map((item, i) => html`
        <li key=${item} data-key=${item} class="sortable-row">
          ${renderItem(item, i)}
          <button type="button" class="drag-handle" aria-label=${`Mover ${getLabel(item)} (posición ${i + 1}). Usa flechas arriba/abajo`}
            onPointerDown=${(e) => onPointerDown(e, i)} onPointerMove=${onPointerMove}
            onPointerUp=${onPointerUp} onPointerCancel=${onPointerUp} onKeyDown=${(e) => onKeyDown(e, i)}>
            <span aria-hidden="true">☰</span>
          </button>
        </li>`)}
    </ol>`;
}
