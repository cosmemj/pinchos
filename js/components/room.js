import { html, useState, useEffect, useMemo, useRef } from '../lib.js';
import { appState, useStore } from '../store.js';
import { navigate } from '../router.js';
import {
  cx, haptic, local, rememberRoom, forgetRoom, getProfile, saveProfile, friendlyError, joinNames, plural,
} from '../util.js';
import { sound, burst } from '../fx.js';
import { computeResults, chefLabel } from '../scoring.js';
import {
  Button, IconButton, Avatar, AvatarStack, EmojiPicker, Field, Spinner, Empty, Logo,
  toast, toastError, confirmDialog,
} from './ui.js';
import { DishesTab } from './dishes.js';
import { VoteTab } from './vote.js';
import { ResultsTab } from './results.js';
import { PeopleTab } from './people.js';
import { Reveal } from './reveal.js';
import { ShareSheet } from './share.js';
import { DemoBanner } from './home.js';

const PHASE_SUB = { lobby: 'Fase de pinchos', voting: 'Votación abierta', results: 'Resultados' };

// ============================================================================
export function RoomRoute({ code }) {
  const { backend, uid } = useStore(appState);
  const [room, setRoom] = useState(undefined);
  const [players, setPlayers] = useState(null);
  const [dishes, setDishes] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setRoom(undefined);
    setPlayers(null);
    setDishes(null);
    setError(null);
    const onErr = (e) => {
      console.error(e);
      setError(e);
    };
    const unsubs = [
      backend.watchRoom(code, setRoom, onErr),
      backend.watchPlayers(code, setPlayers, onErr),
      backend.watchDishes(code, setDishes, onErr),
    ];
    return () => unsubs.forEach((u) => u());
    // uid: si la sesión cambia, Firestore corta las escuchas abiertas; nos volvemos a suscribir con la nueva.
  }, [code, attempt, uid]);

  const sortedDishes = useMemo(
    () => (dishes
      ? [...dishes].sort((a, b) => (a.num || 0) - (b.num || 0)).map((d) => ({ ...d, chefName: chefLabel(d, players) }))
      : null),
    [dishes, players],
  );

  if (error && (room === undefined || players === null)) {
    return html`
      <div class="view center-view">
        <${Empty} emoji="📡" title="No hemos podido abrir la sala" text=${friendlyError(error)}>
          <${Button} icon="🔄" onClick=${() => setAttempt((n) => n + 1)}>Reintentar</${Button}>
          <${Button} variant="ghost" onClick=${() => navigate('/')}>Ir al inicio</${Button}>
        </${Empty}>
      </div>`;
  }
  if (room === undefined || players === null || sortedDishes === null) return html`<${RoomSkeleton} code=${code} />`;
  if (room === null) {
    return html`
      <div class="view center-view">
        <${Empty} emoji="🕵️" title=${`No existe la sala ${code}`} text="Revisa el código o pide que te reenvíen el enlace. Puede que el anfitrión la haya borrado.">
          <${Button} onClick=${() => { forgetRoom(code); navigate('/'); }}>Ir al inicio</${Button}>
        </${Empty}>
      </div>`;
  }
  const me = players.find((p) => p.id === uid);
  if (!me) return html`<${JoinScreen} code=${code} room=${room} players=${players} dishes=${sortedDishes} />`;
  return html`<${RoomView} code=${code} room=${room} players=${players} dishes=${sortedDishes} me=${me} />`;
}

function RoomSkeleton({ code }) {
  return html`
    <div class="view room-loading">
      <div class="loading-logo"><${Logo} size=${84} /></div>
      <${Spinner} size=${30} />
      <p class="muted">Entrando en la sala <b>${code}</b>…</p>
    </div>`;
}

// ============================================================================
function JoinScreen({ code, room, players, dishes }) {
  const { backend } = useStore(appState);
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [busy, setBusy] = useState(false);
  const taken = players.some((p) => (p.name || '').trim().toLowerCase() === name.trim().toLowerCase());

  const join = async (e) => {
    e?.preventDefault();
    if (!name.trim() || busy) {
      haptic([30, 40, 30]);
      return;
    }
    setBusy(true);
    try {
      const p = { name: name.trim().slice(0, 30), avatar };
      saveProfile(p);
      await backend.joinRoom(code, p);
      sound.play('success');
      burst({ fy: 0.7, count: 80, speed: 12 });
      toast(`¡Bienvenido, ${p.name}!`, { icon: avatar });
    } catch (err) {
      toastError(friendlyError(err));
      setBusy(false);
    }
  };

  return html`
    <form class="view join" onSubmit=${join}>
      <header class="topbar">
        <${IconButton} label="Inicio" onClick=${() => navigate('/')}>←</${IconButton}>
        <span class="topbar-title"></span>
        <span class="icon-btn-spacer"></span>
      </header>
      <div class="join-hero">
        <div class="join-logo"><${Logo} size=${76} /></div>
        <p class="join-kicker">Te han invitado a</p>
        <h1 class="join-name">${room.name}</h1>
        <p class="join-meta">Organiza <b>${room.hostName || 'alguien'}</b> · ${plural(players.length, 'persona', 'personas')} · ${plural(dishes.length, 'pincho', 'pinchos')}</p>
        ${players.length ? html`<${AvatarStack} players=${players} max=${7} size=${34} />` : null}
        ${room.phase === 'results' ? html`<p class="join-note">🏆 La votación ya ha terminado, pero puedes ver la gala y los resultados.</p>` : null}
        ${room.phase === 'voting' ? html`<p class="join-note">🗳️ ¡La votación está abierta! Entra rápido.</p>` : null}
      </div>
      <section class="card form-card">
        <div class="me-row">
          <${Avatar} emoji=${avatar} name=${name} size=${56} />
          <${Field} label="¿Cómo te llamas?">
            <input class="input input-lg" value=${name} maxlength="30" placeholder="Tu nombre" autocomplete="given-name"
              onInput=${(e) => setName(e.currentTarget.value)} />
          </${Field}>
        </div>
        ${taken && name.trim() ? html`<p class="field-hint warn">Ya hay alguien con ese nombre. Si no eres tú, añade tu inicial 😉</p>` : null}
        <${EmojiPicker} value=${avatar} onChange=${setAvatar} />
      </section>
      <div class="sticky-cta">
        <${Button} type="submit" size="lg" block loading=${busy} disabled=${!name.trim()} icon="🎉">Entrar a la sala</${Button}>
      </div>
      <${DemoBanner} />
    </form>`;
}

// ============================================================================
function usePresenceToasts(players, dishes, uid) {
  const prev = useRef(null);
  useEffect(() => {
    const snap = { players: new Map(players.map((p) => [p.id, p])), dishes: new Set(dishes.map((d) => d.id)) };
    const old = prev.current;
    prev.current = snap;
    if (!old) return;
    for (const p of players) {
      if (p.id === uid) continue;
      const o = old.players.get(p.id);
      if (!o) {
        toast(`${p.name} se ha unido`, { icon: p.avatar || '👋' });
        sound.play('join');
      } else if (p.votedAt && !o.votedAt) {
        toast(`${p.name} ya ha votado`, { icon: '✅' });
      }
    }
    for (const d of dishes) {
      if (!old.dishes.has(d.id) && d.createdBy !== uid) toast(`Nuevo pincho: ${d.name}`, { icon: '🍢' });
    }
  }, [players, dishes]);
}

function useHostActions(ctx) {
  const { backend, code, room, players, dishes } = ctx;
  const run = async (fn, okMsg) => {
    try {
      await fn();
      if (okMsg) toast(okMsg.text, { icon: okMsg.icon });
      return true;
    } catch (e) {
      toastError(friendlyError(e));
      return false;
    }
  };
  return {
    async openVoting() {
      if (dishes.length < 2) {
        toastError('Necesitáis al menos 2 pinchos para votar');
        return;
      }
      const noPhoto = dishes.filter((d) => !d.photoV).length;
      const ok = await confirmDialog({
        title: '¿Abrimos la votación?',
        message: `${plural(dishes.length, 'pincho', 'pinchos')} en juego${noPhoto ? ` (${noPhoto} sin foto)` : ''}. A partir de ahora solo tú podrás añadir pinchos.`,
        confirm: '¡Abrir votación!', emoji: '🗳️',
      });
      if (!ok) return;
      await run(() => backend.updateRoom(code, { phase: 'voting', votingOpenedAt: backend.serverTime() }));
    },
    async closeAndReveal() {
      const voted = players.filter((p) => p.votedAt);
      const missing = players.filter((p) => !p.votedAt);
      if (!voted.length) {
        toastError('Todavía no ha votado nadie');
        return;
      }
      const ok = await confirmDialog({
        title: 'Cerrar votación y lanzar la gala',
        message: missing.length
          ? `Faltan por votar: ${joinNames(missing.map((p) => p.name))}. Si cierras ahora, no contarán.`
          : '¡Ha votado todo el mundo! Que empiece el espectáculo.',
        confirm: 'Cerrar y revelar 🏆', emoji: missing.length ? '⏳' : '🥁',
      });
      if (!ok) return;
      sound.unlock();
      await run(async () => {
        const votes = await backend.getVotes(code);
        const results = computeResults({ dishes, votes, settings: room.settings });
        await backend.updateRoom(code, {
          phase: 'results', results, revealSeq: backend.inc(1), revealAt: backend.serverTime(), closedAt: backend.serverTime(),
        });
      });
    },
    async reopenVoting() {
      const ok = await confirmDialog({
        title: '¿Reabrir la votación?', message: 'Se ocultarán los resultados y se podrá volver a votar. Los votos actuales se mantienen.',
        confirm: 'Reabrir', emoji: '↩️',
      });
      if (!ok) return;
      await run(() => backend.updateRoom(code, { phase: 'voting', results: null }), { text: 'Votación reabierta', icon: '🗳️' });
    },
    async backToLobby() {
      const ok = await confirmDialog({
        title: '¿Volver a la fase de pinchos?', message: 'Se podrán añadir pinchos y cambiar las reglas. Los votos emitidos se guardan.',
        confirm: 'Volver', emoji: '🍢',
      });
      if (!ok) return;
      await run(() => backend.updateRoom(code, { phase: 'lobby' }));
    },
    async replayForAll() {
      sound.unlock();
      await run(() => backend.updateRoom(code, { revealSeq: backend.inc(1), revealAt: backend.serverTime() }));
    },
    async saveSettings(settings) {
      await run(() => backend.updateRoom(code, { settings }), { text: 'Reglas guardadas', icon: '📜' });
    },
    async clearVotes() {
      const ok = await confirmDialog({
        title: '¿Borrar todos los votos?', message: 'Todo el mundo tendrá que volver a votar. No se puede deshacer.',
        confirm: 'Borrar votos', danger: true, emoji: '🧹',
      });
      if (!ok) return;
      await run(async () => {
        await backend.clearVotes(code);
        if (room.phase === 'results') await backend.updateRoom(code, { phase: 'voting', results: null });
      }, { text: 'Votos borrados', icon: '🧹' });
    },
    async deleteRoom() {
      const ok = await confirmDialog({
        title: '¿Eliminar el concurso?', message: 'Se borrarán la sala, los pinchos, las fotos y los votos para todos. No se puede deshacer.',
        confirm: 'Eliminar para siempre', danger: true, emoji: '💣',
      });
      if (!ok) return;
      const done = await run(() => backend.deleteRoom(code), { text: 'Concurso eliminado', icon: '🗑️' });
      if (done) {
        forgetRoom(code);
        navigate('/');
      }
    },
  };
}

// ============================================================================
function RoomView({ code, room, players, dishes, me }) {
  const { backend, uid } = useStore(appState);
  const isOwner = room.hostUid === uid;
  const isHost = isOwner || (room.coHosts || []).includes(uid);
  const [tab, setTab] = useState(room.phase === 'lobby' ? 'dishes' : 'vote');
  const [share, setShare] = useState(() => {
    try {
      const k = `pdo:fresh:${code}`;
      const fresh = sessionStorage.getItem(k);
      sessionStorage.removeItem(k);
      return fresh ? 'fresh' : null;
    } catch {
      return null;
    }
  });
  // 0 = gala cerrada; cualquier otro número identifica cada pase (cambia la key → la gala empieza de cero,
  // también si ya estaba abierta y el anfitrión la repite para todos).
  const [reveal, setReveal] = useState(0);
  const revealRuns = useRef(0);
  const revealClosedAt = useRef(0);
  const openReveal = () => {
    revealRuns.current += 1;
    setReveal(revealRuns.current);
  };
  const ctx = { backend, code, room, players, dishes, me, uid, isHost, isOwner };
  const hostActions = useHostActions(ctx);

  useEffect(() => {
    rememberRoom({ code, name: room.name, phase: room.phase, host: isOwner });
  }, [room.name, room.phase, isOwner]);

  useEffect(() => {
    document.title = `${room.name} · Pincho de Oro`;
    return () => {
      document.title = 'Pincho de Oro · Concurso de pinchos';
    };
  }, [room.name]);

  // Cambios de fase
  const prevPhase = useRef(room.phase);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = room.phase;
    if (prev === room.phase) return;
    if (room.phase === 'voting' && prev === 'lobby') {
      toast('¡La votación está abierta!', { icon: '🗳️', ms: 3500 });
      sound.play('success');
      haptic([20, 40, 20]);
      setTab('vote');
    } else if (room.phase === 'voting' && prev === 'results') {
      toast('Se ha reabierto la votación', { icon: '↩️' });
      setTab('vote');
    } else if (room.phase === 'lobby') {
      toast('Volvemos a la fase de pinchos', { icon: '🍢' });
      setTab('dishes');
    } else if (room.phase === 'results') {
      setTab('vote');
    }
  }, [room.phase]);

  // Lanzar la gala automáticamente cuando el anfitrión la dispara (sincronizado para todos)
  useEffect(() => {
    if (room.phase !== 'results' || !room.results) return;
    const key = `pdo:seen:${code}:${uid}`;
    const seen = Number(local.get(key, 0)) || 0;
    const seq = Number(room.revealSeq) || 0;
    if (seq > seen) {
      local.set(key, seq);
      const recent = !room.revealAt || Date.now() - room.revealAt < 15 * 60 * 1000;
      if (recent) openReveal();
    }
  }, [room.revealSeq, room.phase, !!room.results]);

  usePresenceToasts(players, dishes, uid);

  const goTab = (t) => {
    if (t === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    haptic(8);
    sound.play('tick');
    setTab(t);
    window.scrollTo(0, 0);
  };

  const voted = players.filter((p) => p.votedAt).length;
  const results = room.phase === 'results';

  let content;
  if (tab === 'dishes') content = html`<${DishesTab} ctx=${ctx} />`;
  else if (tab === 'people') content = html`<${PeopleTab} ctx=${ctx} hostActions=${hostActions} onShare=${() => setShare('normal')} />`;
  else if (results) {
    const replay = () => {
      // Un segundo toque justo al cerrar la gala no debe volver a abrirla.
      if (Date.now() - revealClosedAt.current < 700) return;
      sound.unlock();
      openReveal();
    };
    content = html`<${ResultsTab} ctx=${ctx} hostActions=${hostActions} onReplay=${replay} />`;
  } else content = html`<${VoteTab} ctx=${ctx} hostActions=${hostActions} />`;

  return html`
    <div class=${cx('view room', `phase-${room.phase}`)}>
      <header class="topbar room-top">
        <${IconButton} label="Inicio" onClick=${() => navigate('/')}>←</${IconButton}>
        <div class="room-title">
          <span class="room-name">${room.name}</span>
          <span class="room-sub">${PHASE_SUB[room.phase] || ''} · ${plural(players.length, 'persona', 'personas')}</span>
        </div>
        <button type="button" class="code-pill" onClick=${() => { haptic(8); setShare('normal'); }} aria-label=${`Invitar. Código ${code}`}>
          <span class="code-pill-icon">📲</span><span>${code}</span>
        </button>
      </header>

      ${room.phase === 'voting' && tab !== 'vote'
        ? html`<button type="button" class="phase-banner voting" onClick=${() => goTab('vote')}>
            <span class="pb-emoji">🗳️</span>
            <span class="pb-text"><b>${me.votedAt ? 'Ya has votado' : '¡Votación abierta!'}</b> · ${voted}/${players.length} han votado</span>
            <span class="pb-go">${me.votedAt ? 'Ver' : 'Votar'} →</span>
          </button>`
        : null}
      ${results && tab !== 'vote'
        ? html`<button type="button" class="phase-banner results" onClick=${() => goTab('vote')}>
            <span class="pb-emoji">🏆</span><span class="pb-text"><b>¡Ya hay ganador!</b> Mira los resultados</span><span class="pb-go">→</span>
          </button>`
        : null}

      <main class="room-main" key=${tab}>${content}</main>

      <nav class="bottom-nav" aria-label="Secciones de la sala">
        <button type="button" class=${cx('nav-btn', tab === 'dishes' && 'is-active')} onClick=${() => goTab('dishes')} aria-current=${tab === 'dishes'}>
          <span class="nav-icon">🍢</span><span class="nav-label">Pinchos</span>
          ${dishes.length ? html`<span class="nav-badge">${dishes.length}</span>` : null}
        </button>
        <button type="button" class=${cx('nav-btn nav-main', tab === 'vote' && 'is-active')} onClick=${() => goTab('vote')} aria-current=${tab === 'vote'}>
          <span class="nav-icon">${results ? '🏆' : '🗳️'}</span><span class="nav-label">${results ? 'Gala' : 'Votar'}</span>
          ${room.phase === 'voting' && !me.votedAt ? html`<span class="nav-dot"></span>` : null}
        </button>
        <button type="button" class=${cx('nav-btn', tab === 'people' && 'is-active')} onClick=${() => goTab('people')} aria-current=${tab === 'people'}>
          <span class="nav-icon">👥</span><span class="nav-label">Sala</span>
          <span class="nav-badge">${players.length}</span>
        </button>
      </nav>

      <${ShareSheet} open=${!!share} fresh=${share === 'fresh'} onClose=${() => setShare(null)} room=${room} code=${code} />
      ${reveal && room.results
        ? html`<${Reveal} key=${reveal} ctx=${ctx}
            onLeave=${() => { setTab('vote'); window.scrollTo(0, 0); }}
            onClose=${() => { revealClosedAt.current = Date.now(); setReveal(0); }} />`
        : null}
    </div>`;
}
