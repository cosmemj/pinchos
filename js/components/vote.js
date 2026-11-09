import { html, useState, useEffect, useMemo, useRef } from '../lib.js';
import { cx, haptic, friendlyError, joinNames, plural, reducedMotion, sleep } from '../util.js';
import { sound, burst } from '../fx.js';
import {
  MODES, normalizeSettings, eligibleDishes, picksNeeded, pointsTable, slotsFor, isChef,
} from '../scoring.js';
import { Button, Avatar, DishImage, Empty, Spinner, Portal, toast, toastError } from './ui.js';
import { DishCard, isHiddenFor } from './dishes.js';
import { SortableList } from './sortable.js';
import { PointsChips } from './settings.js';

const MEDALS = ['🥇', '🥈', '🥉'];
export const medal = (i) => MEDALS[i] || `${i + 1}º`;

export function VoteTab({ ctx, hostActions }) {
  const { room } = ctx;
  if (room.phase === 'lobby') return html`<${VoteWaiting} ctx=${ctx} hostActions=${hostActions} />`;
  return html`<${VotingFlow} ctx=${ctx} hostActions=${hostActions} />`;
}

// ---------------------------------------------------------------------------
export function RulesCard({ ctx }) {
  const { room, dishes } = ctx;
  const s = normalizeSettings(room.settings);
  const m = MODES[s.mode];
  return html`
    <div class="card rules-card">
      <div class="rules-head"><span class="rules-emoji">📜</span><h3>Cómo se puntúa</h3></div>
      <p class="rules-line"><b>${m.label}:</b> ${m.desc.toLowerCase()}.</p>
      <${PointsChips} settings=${s} totalDishes=${dishes.length} />
      <ul class="rules-list">
        <li>${s.allowSelfVote ? '✅ Se puede votar el pincho propio.' : '🙅 No puedes votar tu propio pincho.'}</li>
        ${s.blind ? html`<li>🙈 Votación a ciegas: fotos y autores se desvelan en la gala.</li>` : null}
        <li>⚖️ Empate a puntos: gana quien tenga más 1º puestos, luego más 2º…</li>
        <li>✏️ Puedes cambiar tu voto hasta que se cierre la votación.</li>
      </ul>
    </div>`;
}

function VoteWaiting({ ctx, hostActions }) {
  const { room, isHost, dishes } = ctx;
  return html`
    <section class="tab vote-waiting">
      <div class="waiting-art" aria-hidden="true"><span class="waiting-main">🗳️</span><span class="waiting-clock">⏳</span></div>
      <h2 class="tab-title center">La votación aún no ha empezado</h2>
      <p class="center muted">
        ${isHost
          ? `Cuando hayáis probado todos los pinchos, abre la votación. Ahora hay ${plural(dishes.length, 'pincho', 'pinchos')}.`
          : `Cuando hayáis probado todos los pinchos, ${room.hostName || 'el anfitrión'} abrirá la votación. ¡Mientras, haz la foto de tu pincho!`}
      </p>
      ${isHost ? html`<div class="center-cta"><${Button} size="lg" icon="🗳️" onClick=${hostActions.openVoting}>Abrir votación</${Button}></div>` : null}
      <${RulesCard} ctx=${ctx} />
    </section>`;
}

// ---------------------------------------------------------------------------
function VotingFlow({ ctx, hostActions }) {
  const { backend, code, me } = ctx;
  const [myVote, setMyVote] = useState(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    backend.getMyVote(code)
      .then((v) => alive && setMyVote(v))
      .catch(() => alive && setMyVote(null));
    return () => {
      alive = false;
    };
  }, [code, me.id]);

  // Si el anfitrión borra los votos, volvemos a la papeleta.
  useEffect(() => {
    if (!me.votedAt && myVote) setMyVote(null);
  }, [me.votedAt]);

  if (myVote === undefined) return html`<div class="tab center-load"><${Spinner} size=${30} /></div>`;
  if (myVote && !editing) {
    return html`<${VoteSummary} ctx=${ctx} vote=${myVote} hostActions=${hostActions} onEdit=${() => { setEditing(true); window.scrollTo(0, 0); }} />`;
  }
  return html`
    <${VoteBuilder} ctx=${ctx} initial=${myVote?.ranking}
      onCancel=${myVote ? () => setEditing(false) : null}
      onSubmitted=${(ranking) => {
        setMyVote({ ranking, at: Date.now() });
        setEditing(false);
        window.scrollTo(0, 0);
      }} />`;
}

function flyToSlot(fromEl, toEl, dish, hidden) {
  if (!fromEl || !toEl || reducedMotion()) return;
  const imgEl = fromEl.querySelector('.dish-img') || fromEl;
  const a = imgEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const size = Math.min(a.width, a.height) * 0.8;
  const ghost = document.createElement('div');
  ghost.className = 'fly-ghost';
  if (dish.thumb && !hidden) ghost.style.backgroundImage = `url("${dish.thumb}")`;
  else ghost.textContent = `#${dish.num}`;
  Object.assign(ghost.style, {
    left: `${a.left + a.width / 2 - size / 2}px`,
    top: `${a.top + a.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const s = b.width / size;
  const anim = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 90}px) scale(${(1 + s) / 1.6}) rotate(-14deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)`, opacity: 0.85 },
    ],
    { duration: 540, easing: 'cubic-bezier(.45,.05,.35,1)' },
  );
  anim.onfinish = () => {
    ghost.remove();
    toEl.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  };
}

function VoteBuilder({ ctx, initial, onSubmitted, onCancel }) {
  const { room, dishes, uid, backend, code, me } = ctx;
  const settings = normalizeSettings(room.settings);
  const eligible = useMemo(() => eligibleDishes(dishes, uid, settings), [dishes, uid, settings.allowSelfVote]);
  const eligibleIds = eligible.map((d) => d.id).join(',');
  const need = picksNeeded(settings, eligible.length);
  const table = pointsTable(settings.scoring, slotsFor(settings.mode, dishes.length));
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const initialPicks = useMemo(
    () => (initial || []).filter((id) => eligible.some((d) => d.id === id)).slice(0, need),
    [],
  );
  const [picks, setPicks] = useState(initialPicks);
  const [step, setStep] = useState(need > 0 && initialPicks.length >= need ? 'order' : 'pick');
  const [sending, setSending] = useState(false);
  const [stamp, setStamp] = useState(false);
  const [trayShake, setTrayShake] = useState(0);
  const slotsRef = useRef(null);
  const mode = MODES[settings.mode];
  const title = settings.mode === 'all' ? 'Ordena todos los pinchos' : `Elige tu ${mode.label}`;

  useEffect(() => {
    setPicks((p) => p.filter((id) => eligible.some((d) => d.id === id)).slice(0, need));
  }, [eligibleIds, need]);

  // Si cambian los pinchos durante la votación (se añade o borra uno) y falta alguno, volver a elegir.
  useEffect(() => {
    if (step === 'order' && picks.length < need) setStep('pick');
  }, [picks.length, need, step]);

  // Mantener visible el siguiente hueco en la bandeja
  useEffect(() => {
    const box = slotsRef.current;
    const el = box?.querySelector('.is-next') || box?.lastElementChild;
    if (box && el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [picks.length, trayShake]);

  const complete = need > 0 && picks.length === need;

  function toggle(dish, el) {
    if (!eligible.some((d) => d.id === dish.id)) {
      haptic([20, 30, 20]);
      toast('No puedes votar tu propio pincho 😇', { icon: '🙈' });
      return;
    }
    const idx = picks.indexOf(dish.id);
    if (idx >= 0) {
      setPicks(picks.filter((id) => id !== dish.id));
      sound.play('unpop');
      haptic(8);
      return;
    }
    if (picks.length >= need) {
      setTrayShake((n) => n + 1);
      haptic([20, 30, 20]);
      sound.play('error');
      toast('Ya están todos. Toca uno elegido para quitarlo.', { icon: '✋' });
      return;
    }
    const slot = slotsRef.current?.querySelector(`[data-slot="${picks.length}"]`);
    flyToSlot(el, slot, dish, isHiddenFor(dish, ctx));
    const next = [...picks, dish.id];
    setPicks(next);
    sound.play('pop');
    haptic(12);
    if (next.length === need) setTimeout(() => sound.play('success'), 420);
  }

  async function submit() {
    if (!complete || sending) return;
    setSending(true);
    const slow = setTimeout(() => toast('Tu conexión va lenta… el voto se enviará en cuanto se pueda', { icon: '🐢', ms: 4000 }), 6000);
    try {
      await backend.submitVote(code, picks, me.name);
      clearTimeout(slow);
      setStamp(true);
      sound.play('stamp');
      haptic([50, 30, 90]);
      setTimeout(() => burst({ y: innerHeight * 0.45, count: 120, speed: 14, emojis: ['🗳️', '🍢', '⭐'] }), 180);
      await sleep(1700);
      setStamp(false);
      onSubmitted(picks);
    } catch (e) {
      clearTimeout(slow);
      toastError(friendlyError(e));
      setSending(false);
    }
  }

  if (!eligible.length) {
    return html`<section class="tab"><${Empty} emoji="🤷" title="No hay pinchos que puedas votar" text="Espera a que se añadan más pinchos." /></section>`;
  }

  const stampEl = stamp
    ? html`<${Portal}><div class="stamp-overlay"><div class="stamp"><span>¡Votado!</span><small>${me.name}</small></div></div><//>`
    : null;

  if (step === 'order') {
    return html`
      <section class="tab vote-order">
        <div class="vote-head">
          <div class="vote-steps"><span class="done">1 · Elegir</span><span class="on">2 · Ordenar</span><span>3 · Enviar</span></div>
          <h2 class="tab-title">¿Seguro de tu orden?</h2>
          <p class="muted">Arrastra desde <b>☰</b> para cambiar posiciones. Cada puesto suma estos puntos.</p>
        </div>
        <${SortableList} items=${picks} onChange=${setPicks} className="order-list"
          getLabel=${(id) => dishMap.get(id)?.name || 'pincho'}
          renderItem=${(id, i) => {
            const d = dishMap.get(id);
            if (!d) return null;
            const hidden = isHiddenFor(d, ctx);
            return html`
              <div class=${cx('order-row', `pos-${Math.min(i + 1, 4)}`)}>
                <span class="order-medal">${medal(i)}</span>
                <${DishImage} src=${d.thumb} num=${d.num} hidden=${hidden} className="order-thumb" />
                <span class="order-text">
                  <span class="order-name">#${d.num} ${d.name}</span>
                  <span class="order-chef">${hidden ? '🤫 Autor secreto' : d.chefName || ''}</span>
                </span>
                <span class="order-pts">+${table[i] ?? 0}</span>
              </div>`;
          }} />
        <div class="vote-actions">
          <${Button} size="lg" block icon="🗳️" loading=${sending} onClick=${submit}>Enviar mi voto</${Button}>
          <div class="vote-actions-row">
            <${Button} variant="ghost" icon="←" onClick=${() => setStep('pick')} disabled=${sending}>Cambiar selección</${Button}>
            ${onCancel ? html`<${Button} variant="ghost" onClick=${onCancel} disabled=${sending}>Cancelar</${Button}>` : null}
          </div>
        </div>
        ${stampEl}
      </section>`;
  }

  return html`
    <section class="tab vote-pick">
      <div class="vote-head">
        <div class="vote-steps"><span class="on">1 · Elegir</span><span>2 · Ordenar</span><span>3 · Enviar</span></div>
        <h2 class="tab-title">${title}</h2>
        <p class="muted">Toca los pinchos <b>en orden</b>: el primero que toques será tu nº 1. Toca de nuevo para quitarlo.</p>
      </div>

      <div class="dish-grid vote-grid">
        ${dishes.map((d, i) => {
          const pos = picks.indexOf(d.id) + 1;
          const own = !eligible.some((e) => e.id === d.id);
          return html`
            <div class="dish-cell" key=${d.id} style=${{ '--i': i }}>
              <${DishCard} dish=${d} hidden=${isHiddenFor(d, ctx)} mine=${isChef(d, uid)} selectedPos=${pos}
                disabled=${own} note=${own ? 'No votable' : ''} onClick=${toggle} />
            </div>`;
        })}
      </div>

      <div class=${cx('vote-tray', complete && 'is-complete')} key=${`tray${trayShake}`} data-shake=${trayShake ? '1' : '0'}>
        <div class="tray-info">
          <span class="tray-count"><b>${picks.length}</b>/${need}</span>
          <span class="tray-label">${complete ? '¡Listo!' : settings.mode === 'all' ? 'ordenados' : 'elegidos'}</span>
        </div>
        <div class="tray-slots" ref=${slotsRef}>
          ${Array.from({ length: need }, (_, i) => {
            const id = picks[i];
            const d = id ? dishMap.get(id) : null;
            const hidden = d ? isHiddenFor(d, ctx) : false;
            return html`
              <button type="button" key=${i} data-slot=${i}
                class=${cx('tray-slot', `pos-${Math.min(i + 1, 4)}`, d && 'is-filled', i === picks.length && 'is-next')}
                aria-label=${d ? `Quitar ${d.name} del puesto ${i + 1}` : `Puesto ${i + 1} vacío`}
                onClick=${() => d && toggle(d)}>
                ${d
                  ? d.thumb && !hidden
                    ? html`<img src=${d.thumb} alt="" />`
                    : html`<span class="tray-slot-num">#${d.num}</span>`
                  : html`<span class="tray-slot-n">${i + 1}</span>`}
                ${d ? html`<span class="tray-slot-badge">${i + 1}</span>` : null}
              </button>`;
          })}
        </div>
        <${Button} className="tray-next" disabled=${!complete} onClick=${() => { setStep('order'); window.scrollTo(0, 0); }}>Siguiente →</${Button}>
      </div>
      ${stampEl}
    </section>`;
}

// ---------------------------------------------------------------------------
export function VoteProgress({ ctx }) {
  const { players } = ctx;
  const voted = players.filter((p) => p.votedAt);
  const pct = players.length ? Math.round((voted.length / players.length) * 100) : 0;
  return html`
    <div class="card progress-card">
      <div class="progress-head">
        <span>Han votado <b>${voted.length}</b> de ${players.length}</span>
        <span class="progress-pct">${pct}%</span>
      </div>
      <div class="progress-bar"><span style=${{ width: `${pct}%` }}></span></div>
      <div class="progress-people">
        ${players.map((p) => html`
          <span key=${p.id} class=${cx('progress-person', p.votedAt && 'is-done')} title=${p.name}>
            <${Avatar} emoji=${p.avatar} name=${p.name} size=${34} />
            ${p.votedAt ? html`<span class="progress-tick">✓</span>` : null}
            <span class="progress-name">${p.name}</span>
          </span>`)}
      </div>
    </div>`;
}

function VoteSummary({ ctx, vote, onEdit, hostActions }) {
  const { dishes, room, isHost, players } = ctx;
  const settings = normalizeSettings(room.settings);
  const table = pointsTable(settings.scoring, slotsFor(settings.mode, dishes.length));
  const dishMap = new Map(dishes.map((d) => [d.id, d]));
  const missing = players.filter((p) => !p.votedAt);
  return html`
    <section class="tab vote-summary">
      <div class="summary-hero">
        <div class="summary-check" aria-hidden="true">✅</div>
        <h2 class="tab-title center">¡Tu voto está dentro!</h2>
        <p class="center muted">Puedes cambiarlo hasta que ${isHost ? 'cierres' : `${room.hostName || 'el anfitrión'} cierre`} la votación.</p>
      </div>
      <ol class="summary-list">
        ${(vote.ranking || []).map((id, i) => {
          const d = dishMap.get(id);
          if (!d) return null;
          const hidden = isHiddenFor(d, ctx);
          return html`
            <li key=${id} class=${cx('summary-row', `pos-${Math.min(i + 1, 4)}`)} style=${{ '--i': i }}>
              <span class="order-medal">${medal(i)}</span>
              <${DishImage} src=${d.thumb} num=${d.num} hidden=${hidden} className="order-thumb" />
              <span class="order-text"><span class="order-name">#${d.num} ${d.name}</span>
                <span class="order-chef">${hidden ? '🤫' : d.chefName || ''}</span></span>
              <span class="order-pts">+${table[i] ?? 0}</span>
            </li>`;
        })}
      </ol>
      ${room.phase === 'voting' ? html`<div class="center-cta"><${Button} variant="secondary" icon="✏️" onClick=${onEdit}>Cambiar mi voto</${Button}></div>` : null}
      <${VoteProgress} ctx=${ctx} />
      ${isHost && room.phase === 'voting'
        ? html`
          <div class="card host-card">
            <p class="host-card-text">${missing.length ? `Faltan: ${joinNames(missing.map((p) => p.name))}.` : '¡Ya ha votado todo el mundo! 🥁'}</p>
            <${Button} size="lg" block icon="🏆" onClick=${hostActions.closeAndReveal}>Cerrar votación y lanzar la gala</${Button}>
          </div>`
        : null}
    </section>`;
}
