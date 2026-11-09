import { html, useState } from '../lib.js';
import { appState, useStore } from '../store.js';
import { navigate } from '../router.js';
import { getProfile, saveProfile, rememberRoom, friendlyError, haptic } from '../util.js';
import { sound, burst } from '../fx.js';
import { DEFAULT_SETTINGS } from '../scoring.js';
import { Button, Field, EmojiPicker, IconButton, toastError, Avatar } from './ui.js';
import { SettingsForm } from './settings.js';

export function CreateRoom() {
  const { backend } = useStore(appState);
  const profile = getProfile();
  const [name, setName] = useState(`Pinchos ${new Date().getFullYear()}`);
  const [me, setMe] = useState({ name: profile.name, avatar: profile.avatar });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const valid = name.trim().length >= 2 && me.name.trim().length >= 1;

  async function create(e) {
    e?.preventDefault();
    setTouched(true);
    if (!valid || busy) {
      haptic([30, 40, 30]);
      return;
    }
    setBusy(true);
    try {
      const player = { name: me.name.trim().slice(0, 30), avatar: me.avatar };
      saveProfile(player);
      const code = await backend.createRoom({ name: name.trim().slice(0, 50), settings, player });
      rememberRoom({ code, name: name.trim(), phase: 'lobby', host: true });
      sound.play('success');
      burst({ fy: 0.8, count: 90, speed: 13 });
      try {
        sessionStorage.setItem(`pdo:fresh:${code}`, '1');
      } catch {
        /* sin sessionStorage */
      }
      navigate(`/sala/${code}`);
    } catch (err) {
      toastError(friendlyError(err));
      setBusy(false);
    }
  }

  return html`
    <form class="view create" onSubmit=${create}>
      <header class="topbar">
        <${IconButton} label="Volver" onClick=${() => navigate('/')}>←</${IconButton}>
        <h1 class="topbar-title">Nuevo concurso</h1>
        <span class="icon-btn-spacer"></span>
      </header>

      <section class="card form-card">
        <div class="step-label"><span>1</span> El concurso</div>
        <${Field} label="Nombre del concurso" counter=${`${name.length}/50`}>
          <input class="input input-lg" value=${name} maxlength="50" placeholder="Pinchos 2026"
            onInput=${(e) => setName(e.currentTarget.value)} />
        </${Field}>
      </section>

      <section class="card form-card">
        <div class="step-label"><span>2</span> Tú, el anfitrión</div>
        <div class="me-row">
          <${Avatar} emoji=${me.avatar} name=${me.name} size=${56} />
          <${Field} label="Tu nombre">
            <input class="input" value=${me.name} maxlength="30" placeholder="¿Cómo te llamas?" autocomplete="given-name"
              aria-invalid=${touched && !me.name.trim()}
              onInput=${(e) => setMe({ ...me, name: e.currentTarget.value })} />
          </${Field}>
        </div>
        <${EmojiPicker} value=${me.avatar} onChange=${(avatar) => setMe({ ...me, avatar })} />
      </section>

      <section class="card form-card">
        <div class="step-label"><span>3</span> Las reglas</div>
        <${SettingsForm} value=${settings} onChange=${setSettings} />
      </section>

      <div class="sticky-cta">
        <${Button} type="submit" size="lg" block loading=${busy} icon="🎉">Crear sala</${Button}>
        ${touched && !valid ? html`<p class="form-error">Pon un nombre al concurso y el tuyo 😉</p>` : null}
      </div>
    </form>`;
}
