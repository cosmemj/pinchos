import { html, useState, useRef, useEffect } from '../lib.js';
import { appState, useStore } from '../store.js';
import { navigate, cleanCode } from '../router.js';
import { cx, getRecentRooms, forgetRoom, haptic, timeAgo, CODE_LENGTH, friendlyError } from '../util.js';
import { sound } from '../fx.js';
import { Logo, Button, Spinner, toast } from './ui.js';

const PHASE_LABEL = { lobby: 'Preparando', voting: 'Votando', results: 'Resultados' };
const FLOATERS = ['🍤', '🧀', '🫒', '🥖', '🍅', '🌶️', '🍄', '🥓', '🦐', '🍳'];

export function NeonTitle() {
  return html`
    <h1 class="neon-title" aria-label="Pincho de Oro">
      <span class="neon-title-a">Pincho</span>
      <span class="neon-title-b">de <em>Oro</em></span>
    </h1>`;
}

export function DemoBanner() {
  const { backend } = useStore(appState);
  if (backend?.kind !== 'local') return null;
  return html`
    <div class="demo-banner" role="note">
      <strong>Modo demo</strong> · los datos solo viven en este navegador. Abre otra pestaña para simular a otro amigo.
      Para jugar con móviles reales, configura Firebase (ver README).
    </div>`;
}

function JoinByCode() {
  const { backend } = useStore(appState);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const go = async (c) => {
    if (c.length < 4 || busy) return;
    setBusy(true);
    try {
      const room = await backend.getRoom(c);
      if (!room) {
        setShake((s) => s + 1);
        sound.play('error');
        haptic([30, 40, 30]);
        toast(`No existe ninguna sala “${c}”`, { icon: '🤷' });
        return;
      }
      sound.play('success');
      navigate(`/sala/${c}`);
    } catch (e) {
      toast(friendlyError(e), { icon: '⚠️', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return html`<${Button} variant="secondary" size="lg" block icon="🔑" onClick=${() => setOpen(true)}>Tengo un código</${Button}>`;
  }
  return html`
    <form class=${cx('code-entry', shake && 'shake')} key=${shake} onSubmit=${(e) => { e.preventDefault(); go(code); }}>
      <label class="code-entry-label" for="code-input">Código de la sala</label>
      <div class="code-entry-row">
        <input id="code-input" ref=${inputRef} class="code-input" value=${code} maxlength=${CODE_LENGTH}
          autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="ABCDE"
          onInput=${(e) => {
            const c = cleanCode(e.currentTarget.value).slice(0, CODE_LENGTH);
            setCode(c);
            if (c.length === CODE_LENGTH) go(c);
          }} />
        <button type="submit" class="btn btn-primary code-go" disabled=${code.length < 4 || busy} aria-label="Entrar">
          ${busy ? html`<${Spinner} />` : html`<span class="btn-label">→</span>`}
        </button>
      </div>
    </form>`;
}

export function Home() {
  const [recent, setRecent] = useState(getRecentRooms);
  return html`
    <div class="view home">
      <div class="home-floaters" aria-hidden="true">
        ${FLOATERS.map((e, i) => html`<span key=${i} style=${{ '--i': i, '--x': `${(i * 37) % 100}%` }}>${e}</span>`)}
      </div>

      <header class="home-hero">
        <div class="home-logo"><${Logo} size=${112} /></div>
        <${NeonTitle} />
        <p class="home-tagline">El concurso de pinchos de la cuadrilla: <b>foto</b>, <b>voto</b> y <b>gala</b> para coronar al mejor.</p>
      </header>

      <div class="home-actions">
        <${Button} size="lg" block icon="✨" onClick=${() => navigate('/crear')}>Crear concurso</${Button}>
        <${JoinByCode} />
      </div>

      ${recent.length
        ? html`
          <section class="home-recent">
            <h2 class="section-title">Tus concursos</h2>
            <ul class="recent-list">
              ${recent.map((r) => html`
                <li key=${r.code} class="recent-item">
                  <button type="button" class="recent-main" onClick=${() => { haptic(8); navigate(`/sala/${r.code}`); }}>
                    <span class="recent-emoji" aria-hidden="true">${r.phase === 'results' ? '🏆' : r.phase === 'voting' ? '🗳️' : '🍢'}</span>
                    <span class="recent-text">
                      <span class="recent-name">${r.name || 'Concurso'}</span>
                      <span class="recent-meta">
                        <span class="chip chip-code">${r.code}</span>
                        ${r.host ? html`<span class="chip chip-host">👑 Anfitrión</span>` : null}
                        ${r.phase ? html`<span class=${cx('chip', `chip-${r.phase}`)}>${PHASE_LABEL[r.phase] || r.phase}</span>` : null}
                        <span class="recent-time">${timeAgo(r.at)}</span>
                      </span>
                    </span>
                  </button>
                  <button type="button" class="recent-remove" aria-label=${`Quitar ${r.name} de la lista`}
                    onClick=${() => { forgetRoom(r.code); setRecent(getRecentRooms()); haptic(8); }}>✕</button>
                </li>`)}
            </ul>
          </section>`
        : html`
          <section class="home-how">
            <h2 class="section-title">¿Cómo funciona?</h2>
            <ol class="how-steps">
              <li><span class="how-n">1</span><span><b>Crea la sala</b> y pasa el enlace por WhatsApp.</span></li>
              <li><span class="how-n">2</span><span><b>Haz la foto</b> de cada cocinero con su pincho.</span></li>
              <li><span class="how-n">3</span><span><b>Votad</b> vuestro Top 3, Top 5 o el ranking completo.</span></li>
              <li><span class="how-n">4</span><span><b>Lanza la gala</b> y descubrid al Pincho de Oro 🏆</span></li>
            </ol>
          </section>`}

      <${DemoBanner} />
      <footer class="home-footer">Hecho con 🍢 y mucho cariño · gratis y sin anuncios</footer>
    </div>`;
}
