import { html, useState, useEffect } from '../lib.js';
import { roomLink, copyText, nativeShare, whatsappLink, haptic } from '../util.js';
import { sound } from '../fx.js';
import { Sheet, Button, toast } from './ui.js';

export function inviteText(room) {
  return `🍢 ¡Únete al concurso de pinchos “${room.name}”! Haz la foto de tu pincho y vota a tus favoritos aquí:`;
}

export async function shareRoom(room, code) {
  const url = roomLink(code);
  const text = inviteText(room);
  const r = await nativeShare({ title: `Pincho de Oro · ${room.name}`, text, url });
  if (r === 'unsupported') {
    const ok = await copyText(`${text} ${url}`);
    toast(ok ? 'Enlace copiado. ¡Pégalo en el grupo!' : url, { icon: '🔗' });
  }
}

function QR({ text }) {
  const [svg, setSvg] = useState(null);
  useEffect(() => {
    let alive = true;
    import('../../vendor/qrcode.js').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      if (alive) setSvg({ n, d });
    }).catch(() => alive && setSvg(false));
    return () => {
      alive = false;
    };
  }, [text]);
  if (svg === false) return null;
  return html`
    <div class="qr-frame">
      ${svg
        ? html`<svg class="qr" viewBox=${`-2 -2 ${svg.n + 4} ${svg.n + 4}`} shape-rendering="crispEdges" role="img" aria-label="Código QR de la sala">
            <rect x="-2" y="-2" width=${svg.n + 4} height=${svg.n + 4} fill="#ffffff" rx="1.5" />
            <path d=${svg.d} fill="#0b0716" />
          </svg>`
        : html`<div class="qr qr-loading"></div>`}
    </div>`;
}

export function ShareSheet({ open, onClose, room, code, fresh = false }) {
  const url = roomLink(code);
  const text = inviteText(room);
  const copy = async () => {
    const ok = await copyText(url);
    haptic(12);
    sound.play('pop');
    toast(ok ? '¡Enlace copiado!' : 'No se pudo copiar, mantén pulsado el enlace', { icon: '🔗' });
  };
  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${fresh ? '¡Sala creada! 🎉' : 'Invitar a la cuadrilla'}>
      <div class="share">
        ${fresh ? html`<p class="share-lead">Pasa este enlace por el grupo de WhatsApp. Quien lo abra entra directo a la sala.</p>` : null}
        <div class="share-code-label">Código de la sala</div>
        <div class="share-code" aria-label=${`Código ${code.split('').join(' ')}`}>
          ${code.split('').map((ch, i) => html`<span key=${i} style=${{ '--i': i }}>${ch}</span>`)}
        </div>
        <${QR} text=${url} />
        <button type="button" class="share-link" onClick=${copy} title="Copiar enlace">${url.replace(/^https?:\/\//, '')}</button>
        <div class="share-actions">
          <a class="btn btn-whatsapp btn-block" href=${whatsappLink(`${text} ${url}`)} target="_blank" rel="noopener"
            onClick=${() => haptic(10)}><span class="btn-icon">💬</span><span class="btn-label">Enviar por WhatsApp</span></a>
          <div class="share-row">
            <${Button} variant="secondary" icon="📤" onClick=${() => shareRoom(room, code)}>Compartir</${Button}>
            <${Button} variant="secondary" icon="🔗" onClick=${copy}>Copiar</${Button}>
          </div>
        </div>
      </div>
    <//>`;
}
