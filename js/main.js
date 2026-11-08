import { html, render, useErrorBoundary } from './lib.js';
import { appState, useStore } from './store.js';
import { useRoute } from './router.js';
import { createBackend, isFirebaseConfigured } from './backend/index.js';
import { friendlyError } from './util.js';
import { Toasts, DialogHost, Button, Logo, Spinner } from './components/ui.js';
import { Home } from './components/home.js';
import { CreateRoom } from './components/create.js';
import { RoomRoute } from './components/room.js';

function Splash() {
  return html`
    <div class="view splash">
      <div class="splash-logo"><${Logo} size=${96} /></div>
      <${Spinner} size=${28} />
      <div class="splash-text">Calentando la plancha…</div>
    </div>`;
}

function BootError({ error }) {
  const code = String(error?.code || '');
  const authOff = code.includes('operation-not-allowed') || code.includes('admin-restricted');
  return html`
    <div class="view center-view boot-error">
      <div class="empty">
        <div class="empty-emoji">🔌</div>
        <h3 class="empty-title">No se ha podido conectar</h3>
        <p class="empty-text">${friendlyError(error)}</p>
        ${authOff
          ? html`<p class="empty-text small">En Firebase Console: <b>Authentication → Método de acceso → Anónimo → Habilitar</b>.</p>`
          : null}
        <${Button} icon="🔄" onClick=${() => location.reload()}>Reintentar</${Button}>
        ${isFirebaseConfigured()
          ? html`<${Button} variant="ghost" onClick=${() => {
              try { sessionStorage.setItem('pdo:forceDemo', '1'); } catch { /* */ }
              location.reload();
            }}>Probar en modo demo</${Button}>`
          : null}
      </div>
    </div>`;
}

function Crash({ error, onRetry }) {
  return html`
    <div class="view center-view">
      <div class="empty">
        <div class="empty-emoji">🫠</div>
        <h3 class="empty-title">Ups, algo se ha quemado en la plancha</h3>
        <p class="empty-text">${String(error?.message || error || '')}</p>
        <${Button} icon="🔄" onClick=${() => location.reload()}>Recargar</${Button}>
        <${Button} variant="ghost" onClick=${onRetry}>Intentar seguir</${Button}>
      </div>
    </div>`;
}

function App() {
  const st = useStore(appState);
  const route = useRoute();
  const [crash, resetCrash] = useErrorBoundary((e) => console.error(e));
  if (crash) return html`<${Crash} error=${crash} onRetry=${resetCrash} />`;
  let view;
  if (st.status === 'booting') view = html`<${Splash} />`;
  else if (st.status === 'error') view = html`<${BootError} error=${st.error} />`;
  else if (route.name === 'create') view = html`<${CreateRoom} key="create" />`;
  else if (route.name === 'room') view = html`<${RoomRoute} key=${route.key} code=${route.code} />`;
  else view = html`<${Home} key="home" />`;
  return html`
    ${!st.online ? html`<div class="offline-bar" role="status">📡 Sin conexión · los cambios se enviarán al volver</div>` : null}
    ${view}
    <${Toasts} />
    <${DialogHost} />`;
}

async function boot() {
  try {
    const backend = await createBackend();
    const uid = await backend.init();
    appState.patch({ status: 'ready', backend, uid });
  } catch (e) {
    console.error(e);
    appState.patch({ status: 'error', error: e });
  }
}

addEventListener('online', () => appState.patch({ online: true }));
addEventListener('offline', () => appState.patch({ online: false }));

const root = document.getElementById('app');
root.textContent = '';
render(html`<${App} />`, root);
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
