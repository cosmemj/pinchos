// La GALA: revelación animada del Top 5, del último al primero.
import { html, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from '../lib.js';
import { cx, haptic, joinNames, reducedMotion } from '../util.js';
import { sound, cannons, fireworks, burst, clearConfetti, mountConfetti, warmConfetti } from '../fx.js';
import { revealGroups } from '../scoring.js';
import { preloadPhotos } from '../photos.js';
import { Portal, CountUp, Spinner, DishImage } from './ui.js';

const T = reducedMotion()
  ? { intro: 1600, pos: 2600, suspense: 1800, winner: 3200 }
  : { intro: 3000, pos: 4300, suspense: 3600, winner: 6000 };
const WINNER_EMOJIS = ['🏆', '🍢', '⭐', '👑', '🎉'];
const LEAVE_MS = reducedMotion() ? 0 : 400; // = retardo + duración de .reveal.is-leaving en el CSS

/** Para un pase de la gala: cancela la espera en curso, los temporizadores, el redoble y los fuegos. */
function stopRun(c) {
  c.alive = false;
  c.cancel?.();
  c.stops?.forEach((f) => f());
}

function SoundToggle() {
  const [muted, setMuted] = useState(sound.muted);
  useEffect(() => sound.onChange(setMuted), []);
  return html`
    <button type="button" class="icon-btn icon-btn-glass" aria-label=${muted ? 'Activar sonido' : 'Silenciar'}
      onClick=${(e) => { e.stopPropagation(); sound.unlock(); sound.setMuted(!muted); }}>${muted ? '🔇' : '🔊'}</button>`;
}

function RevealCard({ entry, src, delay = 0, big = false }) {
  return html`
    <div class=${cx('reveal-card', big && 'is-big')} style=${{ '--d': `${delay}ms` }}>
      <div class="reveal-photo"><${DishImage} src=${src} num=${entry.num} alt=${entry.name} eager /></div>
      <div class="reveal-name">${entry.name}</div>
      ${entry.chefName ? html`<div class="reveal-chef">${big ? 'de ' : ''}${entry.chefName}</div>` : null}
      <div class="reveal-points"><${CountUp} value=${entry.points} delay=${delay + 700} duration=${1200} /> <small>pts</small></div>
    </div>`;
}

export function Reveal({ ctx, onClose, onLeave }) {
  const { room, dishes, code } = ctx;
  const results = room.results;
  const groups = useMemo(() => revealGroups(results), [results]);
  const dishMap = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const [photos, setPhotos] = useState(() => new Map());
  const [stage, setStage] = useState({ name: 'loading' });
  const [needsTap, setNeedsTap] = useState(!sound.ready && !sound.muted);
  const [runId, setRunId] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const ctl = useRef({});
  const rootRef = useRef(null);
  const mounted = useRef(true);
  const exit = useRef({ on: false, timer: 0 });
  const cb = useRef({});
  cb.current = { onClose, onLeave };
  const last = groups.length - 1;

  // Salida con un fundido corto: sin corte brusco y sin que un segundo toque caiga en la página de debajo
  // (antes podía pulsar "Ver la gala otra vez" sin querer y la gala se volvía a abrir).
  const leave = useCallback((e) => {
    e?.stopPropagation?.();
    if (exit.current.on) return;
    exit.current.on = true;
    stopRun(ctl.current);
    cb.current.onLeave?.();
    // La página de debajo vuelve a pintarse; el fundido arranca despacio y le da tiempo.
    document.documentElement.classList.add('reveal-leaving');
    setLeaving(true);
    exit.current.timer = setTimeout(() => cb.current.onClose?.(), LEAVE_MS);
  }, []);

  useEffect(() => {
    const c = { alive: true, skip: null, cancel: null, stops: [] };
    ctl.current = c;
    const wait = (ms) => new Promise((resolve, reject) => {
      const t = setTimeout(() => { c.skip = null; resolve(); }, ms);
      c.skip = () => { clearTimeout(t); c.skip = null; resolve(); };
      c.cancel = () => { clearTimeout(t); reject(new Error('cancel')); };
    });
    const later = (ms, fn) => {
      const t = setTimeout(() => c.alive && fn(), ms);
      c.stops.push(() => clearTimeout(t));
    };

    (async () => {
      try {
        setStage({ name: 'loading' });
        warmConfetti(WINNER_EMOJIS); // texturas listas antes del momento cumbre
        const entries = groups.flatMap((g) => g.entries);
        const map = await preloadPhotos(code, entries.map((e) => dishMap.get(e.id) || { id: e.id }), 4500);
        // Aunque se haya pulsado "Saltar" mientras cargaba, el ganador debe salir con su foto.
        if (mounted.current) setPhotos(map);
        if (!c.alive) return;
        if (!groups.length) {
          setStage({ name: 'empty' });
          return;
        }
        setStage({ name: 'intro' });
        sound.play('whoosh');
        await wait(T.intro);

        for (let i = 0; i < last; i++) {
          setStage({ name: 'pos', i });
          sound.play('boom');
          haptic(30);
          later(750, () => sound.play('ding'));
          later(1900, () => burst({ fy: 0.42, count: 26, speed: 6, gravity: 0.15, size: 0.8 }));
          await wait(T.pos);
        }

        setStage({ name: 'suspense' });
        const stopRoll = sound.drumroll(T.suspense / 1000);
        c.stops.push(stopRoll);
        haptic([20, 80, 20, 80, 20, 80]);
        await wait(T.suspense);
        stopRoll();

        setStage({ name: 'winner' });
        c.celebrated = true;
        sound.play('crash');
        sound.play('fanfare');
        haptic([80, 40, 160]);
        cannons({ emojis: WINNER_EMOJIS, count: 75 });
        c.stops.push(fireworks(T.winner - 1800));
        later(1600, () => cannons({ count: 36 }));
        await wait(T.winner);
        setStage({ name: 'end' });
      } catch {
        /* cancelado (saltar/cerrar) */
      }
    })();

    return () => stopRun(c);
  }, [runId]);

  // Antes del primer pintado: mientras dura la gala, la página de debajo no se pinta (ver CSS). Así es
  // imposible que se vea el podio por detrás, y el móvil no gasta en animar dos pantallas a la vez.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove('reveal-leaving');
    root.classList.add('has-reveal');
    return () => root.classList.remove('has-reveal', 'reveal-leaving');
  }, []);

  useEffect(() => {
    if (rootRef.current) mountConfetti(rootRef.current);

    // Mantener la pantalla encendida durante la gala (si el navegador lo permite). El navegador suelta el
    // bloqueo al cambiar de app, así que lo pedimos de nuevo al volver.
    // `asking` evita pedir dos bloqueos a la vez (p. ej. al volver a la app antes de que llegue el primero):
    // el que se quedara sin guardar en `lock` ya no se soltaría al cerrar la gala.
    let lock = null;
    let asking = false;
    const askLock = () => {
      if (!navigator.wakeLock || asking || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      asking = true;
      navigator.wakeLock.request('screen').then((l) => {
        if (mounted.current) lock = l;
        else l.release().catch(() => {});
      }).catch(() => {}).finally(() => { asking = false; });
    };
    askLock();
    document.addEventListener('visibilitychange', askLock);

    const onKey = (e) => {
      if (e.key === 'Escape') leave();
      if (e.key === ' ' || e.key === 'ArrowRight') ctl.current.skip?.();
    };
    addEventListener('keydown', onKey);
    return () => {
      mounted.current = false;
      clearTimeout(exit.current.timer);
      removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', askLock);
      clearConfetti();
      mountConfetti(document.body);
      lock?.release().catch(() => {});
    };
  }, []);

  const skipToEnd = (e) => {
    e?.stopPropagation();
    if (exit.current.on) return;
    stopRun(ctl.current);
    setStage({ name: groups.length ? 'end' : 'empty' });
    if (groups.length && ctl.current.celebrated !== true) {
      ctl.current.celebrated = true;
      sound.play('fanfare');
      cannons({ count: 60, emojis: WINNER_EMOJIS });
    }
  };
  const replay = (e) => {
    e?.stopPropagation();
    if (exit.current.on) return;
    clearConfetti();
    setRunId((n) => n + 1);
  };
  const advance = () => {
    if (exit.current.on) return;
    if (needsTap) {
      // El primer toque solo activa el sonido (no salta el paso actual)
      sound.unlock();
      setNeedsTap(false);
      return;
    }
    ctl.current.skip?.();
  };

  const s = stage.name;
  const revealedCount = s === 'pos' ? stage.i : ['suspense', 'winner', 'end'].includes(s) ? last : 0;
  const board = groups.slice(0, revealedCount).reverse();
  const winner = groups[last];
  const winnerChefs = winner ? [...new Set(winner.entries.map((e) => e.chefName).filter(Boolean))] : [];

  return html`
    <${Portal}>
      <div ref=${rootRef} class=${cx('reveal', `stage-${s}`, leaving && 'is-leaving')} role="dialog" aria-modal="true" aria-label="Gala de resultados" onClick=${advance}>
        <div class="reveal-bg" aria-hidden="true">
          <div class="beam beam-1"></div><div class="beam beam-2"></div><div class="beam beam-3"></div>
          <div class="reveal-floor"></div>
          ${s === 'winner' || s === 'end' ? html`<div class="sunburst"></div>` : null}
          ${s === 'suspense' ? html`<div class="pulse-ring"></div>` : null}
        </div>

        <header class="reveal-top" onClick=${(e) => e.stopPropagation()}>
          <span class="reveal-brand">🏆 ${room.name}</span>
          <div class="reveal-controls">
            <${SoundToggle} />
            ${s !== 'end' && s !== 'empty'
              ? html`<button type="button" class="reveal-skip" onClick=${skipToEnd}>Saltar ⏭</button>`
              : null}
            <button type="button" class="icon-btn icon-btn-glass" aria-label="Cerrar gala" onClick=${leave}>✕</button>
          </div>
        </header>

        <main class="reveal-stage" aria-live="polite">
          ${s === 'loading' ? html`<div class="reveal-loading"><${Spinner} size=${36} /><span>Preparando la gala…</span></div>` : null}

          ${s === 'empty' ? html`
            <div class="reveal-intro">
              <h2 class="neon-sign">Sin puntos que repartir</h2>
              <p class="reveal-sub">Nadie ha votado todavía 🤷</p>
            </div>` : null}

          ${s === 'intro' ? html`
            <div class="reveal-intro" key="intro">
              <div class="reveal-kicker">✨ Gala de premios ✨</div>
              <h2 class="neon-sign">Los mejores pinchos de</h2>
              <div class="reveal-roomname">${room.name}</div>
              <p class="reveal-sub">${results.voters} ${results.voters === 1 ? 'voto' : 'votos'} · ¡que empiece el espectáculo!</p>
            </div>` : null}

          ${s === 'pos' ? html`
            <div class="reveal-step" key=${`pos${stage.i}-${runId}`}>
              <div class="reveal-rank"><span class="rank-num">${groups[stage.i].rank}</span><span class="rank-o">º</span></div>
              ${groups[stage.i].entries.length > 1 ? html`<div class="reveal-tie">¡Empate!</div>` : null}
              <div class=${cx('reveal-cards', groups[stage.i].entries.length > 1 && 'is-multi')}>
                ${groups[stage.i].entries.map((e, k) => html`<${RevealCard} key=${e.id} entry=${e} src=${photos.get(e.id)} delay=${450 + k * 160} />`)}
              </div>
            </div>` : null}

          ${s === 'suspense' ? html`
            <div class="reveal-suspense" key="sus">
              <h2 class="neon-sign gold">Y el Pincho de Oro<br />es para…</h2>
              <div class="mystery-card"><span>?</span></div>
            </div>` : null}

          ${(s === 'winner' || s === 'end') && winner ? html`
            <div class=${cx('reveal-winner', s === 'end' && 'is-end')} key=${`win-${runId}`}>
              <div class=${cx('winner-label', winner.entries.length > 1 && 'is-double')}>${winner.entries.length > 1 ? 'Doble Pincho de Oro' : 'Pincho de Oro'}</div>
              <div class="winner-crown" aria-hidden="true">👑</div>
              <div class=${cx('reveal-cards', winner.entries.length > 1 && 'is-multi')}>
                ${winner.entries.map((e, k) => html`<${RevealCard} key=${e.id} entry=${e} src=${photos.get(e.id)} delay=${200 + k * 160} big />`)}
              </div>
              ${s === 'end' ? html`<div class="winner-congrats">¡Enhorabuena${winnerChefs.length ? `, ${joinNames(winnerChefs)}` : ''}! 🎉</div>` : null}
            </div>` : null}
        </main>

        ${board.length ? html`
          <footer class="reveal-board">
            ${board.map((g) => g.entries.map((e) => html`
              <div class="board-row" key=${e.id}>
                <span class="board-rank">${g.rank}º</span>
                <${DishImage} src=${dishMap.get(e.id)?.thumb || photos.get(e.id)} num=${e.num} className="board-thumb" eager />
                <span class="board-name">${e.name}${e.chefName ? html` <small>· ${e.chefName}</small>` : null}</span>
                <span class="board-pts">${e.points}</span>
              </div>`))}
          </footer>` : null}

        ${s === 'end' || s === 'empty' ? html`
          <div class="reveal-end" onClick=${(e) => e.stopPropagation()}>
            <button type="button" class="btn btn-primary btn-lg btn-block" onClick=${leave}><span class="btn-label">Ver clasificación completa</span></button>
            ${groups.length ? html`<button type="button" class="btn btn-ghost" onClick=${replay}><span class="btn-icon">🔁</span><span class="btn-label">Repetir</span></button>` : null}
          </div>` : null}

        ${needsTap && s !== 'end' ? html`<div class="reveal-sound-pill">🔊 Toca la pantalla para activar el sonido</div>` : null}
        ${(s === 'pos' || s === 'intro') && !board.length ? html`<div class="reveal-hint">Toca para avanzar</div>` : null}
      </div>
    <//>`;
}
