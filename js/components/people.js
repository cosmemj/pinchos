import { html, useState, useEffect, useRef } from '../lib.js';
import { cx, haptic, saveProfile, friendlyError, forgetRoom, plural } from '../util.js';
import { sound } from '../fx.js';
import { navigate } from '../router.js';
import { normalizeSettings, isChef } from '../scoring.js';
import {
  Button, Avatar, Sheet, Field, EmojiPicker, Toggle, toast, toastError, confirmDialog,
} from './ui.js';
import { SettingsForm } from './settings.js';
import { RulesCard, VoteProgress } from './vote.js';
import { shareRoom } from './share.js';

const PHASES = [
  { id: 'lobby', label: 'Pinchos', emoji: '🍢' },
  { id: 'voting', label: 'Votación', emoji: '🗳️' },
  { id: 'results', label: 'Gala', emoji: '🏆' },
];

export function PhaseStepper({ phase }) {
  const idx = PHASES.findIndex((p) => p.id === phase);
  return html`
    <ol class="phase-stepper" aria-label="Fases del concurso">
      ${PHASES.map((p, i) => html`
        <li key=${p.id} class=${cx('phase-step', i < idx && 'is-done', i === idx && 'is-current')}>
          <span class="phase-dot">${i < idx ? '✓' : p.emoji}</span><span class="phase-label">${p.label}</span>
        </li>`)}
    </ol>`;
}

function ProfileSheet({ ctx, open, onClose }) {
  const { me, backend, code } = ctx;
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(me.name);
      setAvatar(me.avatar);
    }
  }, [open]);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await backend.updatePlayer(code, me.id, { name: name.trim().slice(0, 30), avatar });
      saveProfile({ name: name.trim(), avatar });
      toast('Perfil actualizado', { icon: avatar });
      onClose();
    } catch (e) {
      toastError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return html`
    <${Sheet} open=${open} onClose=${onClose} title="Tu perfil"
      footer=${html`<${Button} block size="lg" loading=${busy} onClick=${save} disabled=${!name.trim()}>Guardar</${Button}>`}>
      <div class="profile-edit">
        <div class="me-row">
          <${Avatar} emoji=${avatar} name=${name} size=${56} />
          <${Field} label="Tu nombre">
            <input class="input" value=${name} maxlength="30" onInput=${(e) => setName(e.currentTarget.value)} />
          </${Field}>
        </div>
        <${EmojiPicker} value=${avatar} onChange=${setAvatar} />
      </div>
    <//>`;
}

function PlayerMenu({ ctx, player: current, onClose }) {
  const { room, backend, code } = ctx;
  const last = useRef(current);
  if (current) last.current = current;
  const player = current || last.current;
  const isCo = (room.coHosts || []).includes(player?.id);
  const toggleCo = async () => {
    try {
      const co = new Set(room.coHosts || []);
      if (isCo) co.delete(player.id);
      else co.add(player.id);
      await backend.updateRoom(code, { coHosts: [...co] });
      toast(isCo ? `${player.name} ya no es co-anfitrión` : `${player.name} ahora es co-anfitrión 👑`, { icon: '👑' });
      onClose();
    } catch (e) {
      toastError(friendlyError(e));
    }
  };
  const kick = async () => {
    const ok = await confirmDialog({
      title: `¿Expulsar a ${player.name}?`,
      message: 'Se borrará su voto. Podría volver a entrar con el enlace (útil para quitar duplicados).',
      confirm: 'Expulsar', danger: true, emoji: '🚪',
    });
    if (!ok) return;
    try {
      await backend.removePlayer(code, player.id);
      if (isCo) await backend.updateRoom(code, { coHosts: (room.coHosts || []).filter((x) => x !== player.id) });
      toast(`${player.name} ha salido de la sala`, { icon: '🚪' });
      onClose();
    } catch (e) {
      toastError(friendlyError(e));
    }
  };
  return html`
    <${Sheet} open=${!!current} onClose=${onClose} title=${player ? player.name : ''}>
      ${player ? html`
        <div class="menu-list">
          <${Button} variant="secondary" block icon="👑" onClick=${toggleCo}>${isCo ? 'Quitar co-anfitrión' : 'Hacer co-anfitrión'}</${Button}>
          <p class="field-hint">Un co-anfitrión puede abrir/cerrar la votación y lanzar la gala (por si se te acaba la batería 🔋).</p>
          <${Button} variant="danger-ghost" block icon="🚪" onClick=${kick}>Expulsar de la sala</${Button}>
        </div>` : null}
    <//>`;
}

function HostPanel({ ctx, hostActions }) {
  const { room, dishes, isOwner } = ctx;
  const saved = normalizeSettings(room.settings);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setDraft(saved), [savedKey]);
  const dirty = JSON.stringify(draft) !== savedKey;
  const locked = room.phase !== 'lobby';

  const save = async () => {
    setBusy(true);
    await hostActions.saveSettings(draft);
    setBusy(false);
  };

  return html`
    <section class="card host-panel">
      <div class="host-card-title">👑 Panel del anfitrión</div>
      <div class="host-main-action">
        ${room.phase === 'lobby' ? html`<${Button} size="lg" block icon="🗳️" onClick=${hostActions.openVoting}>Abrir votación</${Button}>` : null}
        ${room.phase === 'voting' ? html`<${Button} size="lg" block icon="🏆" onClick=${hostActions.closeAndReveal}>Cerrar votación y lanzar la gala</${Button}>` : null}
        ${room.phase === 'results' ? html`<${Button} size="lg" block icon="🔁" onClick=${hostActions.replayForAll}>Repetir la gala para todos</${Button}>` : null}
      </div>
      <div class="host-secondary">
        ${room.phase === 'voting' ? html`<${Button} variant="ghost" icon="↩️" onClick=${hostActions.backToLobby}>Volver a fase de pinchos</${Button}>` : null}
        ${room.phase === 'results' ? html`<${Button} variant="ghost" icon="↩️" onClick=${hostActions.reopenVoting}>Reabrir votación</${Button}>` : null}
      </div>

      <details class="host-details">
        <summary>⚙️ Reglas del concurso${locked ? ' (bloqueadas durante la votación)' : ''}</summary>
        <${SettingsForm} value=${draft} onChange=${setDraft} disabled=${locked} totalDishes=${dishes.length} />
        ${dirty && !locked ? html`<${Button} block loading=${busy} icon="💾" onClick=${save}>Guardar reglas</${Button}>` : null}
        ${locked ? html`<p class="field-hint">Para cambiar las reglas, vuelve a la fase de pinchos.</p>` : null}
      </details>

      <details class="host-details danger-zone">
        <summary>🧨 Zona peligrosa</summary>
        <div class="menu-list">
          <${Button} variant="danger-ghost" block icon="🧹" onClick=${hostActions.clearVotes}>Borrar todos los votos</${Button}>
          ${isOwner ? html`<${Button} variant="danger" block icon="🗑️" onClick=${hostActions.deleteRoom}>Eliminar el concurso</${Button}>` : null}
        </div>
      </details>
    </section>`;
}

export function PeopleTab({ ctx, hostActions, onShare }) {
  const { room, players, me, uid, isHost, isOwner, dishes, code } = ctx;
  const [profile, setProfile] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [muted, setMuted] = useState(sound.muted);
  useEffect(() => sound.onChange(setMuted), []);
  const sorted = [...players].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

  const leave = async () => {
    const ok = await confirmDialog({
      title: 'Salir de la sala', message: 'La quitaremos de tu lista. Podrás volver con el enlace cuando quieras.',
      confirm: 'Salir', emoji: '👋',
    });
    if (!ok) return;
    forgetRoom(code);
    navigate('/');
  };

  return html`
    <section class="tab people-tab">
      <button type="button" class="card invite-card" onClick=${onShare}>
        <span class="invite-text">
          <span class="invite-kicker">Código de la sala</span>
          <span class="invite-code">${code}</span>
          <span class="invite-sub">Toca para invitar por WhatsApp o enseñar el QR</span>
        </span>
        <span class="invite-qr" aria-hidden="true">📲</span>
      </button>

      <${PhaseStepper} phase=${room.phase} />

      ${isHost ? html`<${HostPanel} ctx=${ctx} hostActions=${hostActions} />` : null}
      ${room.phase === 'voting' ? html`<${VoteProgress} ctx=${ctx} />` : null}

      <div class="tab-head">
        <h2 class="tab-title">En la sala <span class="count-pill">${players.length}</span></h2>
        <button type="button" class="link-btn" onClick=${() => shareRoom(room, code)}>＋ Invitar</button>
      </div>
      <ul class="player-list">
        ${sorted.map((p, i) => {
          const cooked = dishes.filter((d) => isChef(d, p.id)).length;
          const role = p.id === room.hostUid ? 'Anfitrión' : (room.coHosts || []).includes(p.id) ? 'Co-anfitrión' : '';
          return html`
            <li key=${p.id} class=${cx('player-row', p.id === uid && 'is-me')} style=${{ '--i': i }}>
              <${Avatar} emoji=${p.avatar} name=${p.name} size=${44} />
              <span class="player-text">
                <span class="player-name">${p.name}${p.id === uid ? html` <span class="tag">tú</span>` : null}</span>
                <span class="player-sub">
                  ${role ? html`<span class="role">👑 ${role}</span>` : null}
                  ${cooked ? html`<span>🍢 ${plural(cooked, 'pincho', 'pinchos')}</span>` : null}
                </span>
              </span>
              ${room.phase === 'voting'
                ? p.votedAt
                  ? html`<span class="status-badge is-done">✓ Votado</span>`
                  : html`<span class="status-badge">Pensando…</span>`
                : null}
              ${p.id === uid
                ? html`<button type="button" class="icon-btn" aria-label="Editar mi perfil" onClick=${() => setProfile(true)}>✏️</button>`
                : isOwner
                  ? html`<button type="button" class="icon-btn" aria-label=${`Opciones de ${p.name}`} onClick=${() => { haptic(8); setMenuFor(p); }}>⋯</button>`
                  : null}
            </li>`;
        })}
      </ul>

      <${RulesCard} ctx=${ctx} />

      <div class="card settings-card">
        <${Toggle} checked=${!muted} onChange=${(on) => { sound.unlock(); sound.setMuted(!on); }}
          label="Sonidos y música" hint="Redoble de tambor y fanfarria en la gala 🥁" />
      </div>

      <div class="center-cta">
        <${Button} variant="ghost" icon="👋" onClick=${leave}>Salir de la sala</${Button}>
      </div>

      <${ProfileSheet} ctx=${{ ...ctx, me }} open=${profile} onClose=${() => setProfile(false)} />
      <${PlayerMenu} ctx=${ctx} player=${menuFor} onClose=${() => setMenuFor(null)} />
    </section>`;
}
