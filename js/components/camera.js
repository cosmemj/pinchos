// Cámara integrada a pantalla completa (getUserMedia) con temporizador, linterna y cambio de cámara.
import { html, render, useState, useEffect, useRef } from '../lib.js';
import { cx, haptic, sleep } from '../util.js';
import { sound, burst } from '../fx.js';
import { drawToCanvas, makePhotoSet, pickImageFile, fileToPhotoSet } from '../image.js';
import { Spinner } from './ui.js';

const ASPECT = 3 / 4; // foto vertical 3:4 (lo que ves es lo que se guarda)

function cameraErrorText(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError')
    return 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o usa la cámara del móvil.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No encuentro ninguna cámara en este dispositivo.';
  if (n === 'NotReadableError') return 'La cámara está ocupada por otra app. Ciérrala y vuelve a intentarlo.';
  return 'No se ha podido abrir la cámara integrada.';
}

/** Abre la cámara. Devuelve {full, thumb} o null si se cancela. */
export function takePhoto({ title = 'Foto del pincho', hint = 'Saca al cocinero con su pincho 📸' } = {}) {
  sound.unlock();
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'portal';
    document.body.appendChild(host);
    document.documentElement.classList.add('has-camera');
    const finish = (result) => {
      render(null, host);
      host.remove();
      document.documentElement.classList.remove('has-camera');
      resolve(result || null);
    };
    render(html`<${CameraOverlay} title=${title} hint=${hint} onDone=${finish} />`, host);
  });
}

/** Elige una foto de la galería (o la cámara del sistema con capture). Devuelve {full, thumb} o null. */
export async function pickPhoto({ capture = null } = {}) {
  const file = await pickImageFile({ capture });
  if (!file) return null;
  return fileToPhotoSet(file);
}

function CameraOverlay({ title, hint, onDone }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [status, setStatus] = useState('starting'); // starting | ready | error | preview | processing
  const [error, setError] = useState('');
  const [shot, setShot] = useState(null); // { canvas, url }
  const [multiCam, setMultiCam] = useState(false);
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [timer, setTimer] = useState(false);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(0);
  const busy = useRef(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      stop();
      setStatus('starting');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara integrada.');
        setStatus('error');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        const v = videoRef.current;
        v.srcObject = s;
        await v.play().catch(() => {});
        setStatus('ready');
        const track = s.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() || {};
        setTorch({ supported: !!caps.torch, on: false });
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          setMultiCam(devs.filter((d) => d.kind === 'videoinput').length > 1);
        } catch {
          setMultiCam(false);
        }
      } catch (e) {
        if (cancelled) return;
        setError(cameraErrorText(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      stop();
    };
  }, []);

  const close = (result = null) => {
    stop();
    onDone(result);
  };

  async function capture() {
    if (busy.current || status !== 'ready') return;
    busy.current = true;
    try {
      if (timer) {
        for (let i = 3; i > 0; i--) {
          setCount(i);
          sound.play('beep');
          haptic(15);
          await sleep(850);
        }
        setCount(0);
      }
      const v = videoRef.current;
      if (!v?.videoWidth) return;
      const canvas = drawToCanvas(v, { maxSide: 1600, crop: ASPECT, mirror: facing === 'user' });
      setFlash((f) => f + 1);
      sound.play('shutter');
      haptic(25);
      setShot({ canvas, url: canvas.toDataURL('image/jpeg', 0.85) });
      setStatus('preview');
    } finally {
      busy.current = false;
    }
  }

  async function usePhoto() {
    if (!shot) return;
    setStatus('processing');
    await sleep(30);
    const set = makePhotoSet(shot.canvas);
    sound.play('success');
    burst({ fy: 0.75, count: 40, speed: 9 });
    close(set);
  }

  async function fromGallery(capture = null) {
    try {
      const file = await pickImageFile({ capture });
      if (!file) return;
      setStatus('processing');
      const set = await fileToPhotoSet(file);
      close(set);
    } catch (e) {
      setError(e.message || 'No se ha podido leer la foto.');
      setStatus('error');
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on }] });
      setTorch((t) => ({ ...t, on: !t.on }));
      haptic(10);
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  const retake = () => {
    setShot(null);
    setStatus(streamRef.current ? 'ready' : 'starting');
    sound.play('unpop');
  };

  return html`
    <div class="camera" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="camera-top">
        <button type="button" class="icon-btn icon-btn-glass" aria-label="Cerrar cámara" onClick=${() => close(null)}>✕</button>
        <div class="camera-title">${title}</div>
        ${torch.supported && status === 'ready'
          ? html`<button type="button" class=${cx('icon-btn icon-btn-glass', torch.on && 'is-on')} aria-label="Linterna" onClick=${toggleTorch}>🔦</button>`
          : html`<span class="icon-btn-spacer"></span>`}
      </div>

      <div class="camera-stage">
        <div class=${cx('viewfinder', facing === 'user' && 'is-mirror')}>
          <video ref=${videoRef} autoplay playsinline muted class=${cx(status === 'preview' && 'is-hidden')}></video>
          ${shot && status !== 'ready' ? html`<img class="viewfinder-shot" src=${shot.url} alt="Foto tomada" />` : null}
          <span class="vf-corner tl"></span><span class="vf-corner tr"></span>
          <span class="vf-corner bl"></span><span class="vf-corner br"></span>
          ${status === 'starting' ? html`<div class="vf-msg"><${Spinner} size=${34} /><span>Abriendo cámara…</span></div>` : null}
          ${status === 'processing' ? html`<div class="vf-msg"><${Spinner} size=${34} /><span>Preparando foto…</span></div>` : null}
          ${status === 'error'
            ? html`<div class="vf-msg vf-error">
                <span class="vf-error-emoji">📷</span>
                <span>${error}</span>
                <button type="button" class="btn btn-primary" onClick=${() => fromGallery('environment')}><span class="btn-icon">📱</span><span class="btn-label">Usar la cámara del móvil</span></button>
              </div>`
            : null}
          ${count ? html`<div class="vf-count" key=${count}>${count}</div>` : null}
          ${flash ? html`<div class="vf-flash" key=${`f${flash}`}></div>` : null}
        </div>
        ${status === 'ready' && hint ? html`<p class="camera-hint">${hint}</p>` : null}
      </div>

      <div class="camera-bar">
        ${status === 'preview' || status === 'processing'
          ? html`
            <button type="button" class="btn btn-ghost" onClick=${retake} disabled=${status === 'processing'}>
              <span class="btn-icon">↺</span><span class="btn-label">Repetir</span></button>
            <button type="button" class="btn btn-primary btn-lg" onClick=${usePhoto} disabled=${status === 'processing'}>
              <span class="btn-icon">✓</span><span class="btn-label">Usar foto</span></button>`
          : html`
            <button type="button" class="cam-side" onClick=${() => fromGallery()} aria-label="Elegir de la galería">
              <span class="cam-side-icon">🖼️</span><span>Galería</span></button>
            <button type="button" class=${cx('shutter', status !== 'ready' && 'is-disabled', count && 'is-counting')}
              onClick=${capture} aria-label="Hacer foto" disabled=${status !== 'ready'}>
              <span class="shutter-ring"></span><span class="shutter-core"></span></button>
            <div class="cam-side-group">
              <button type="button" class=${cx('cam-side', timer && 'is-on')} onClick=${() => { setTimer((t) => !t); haptic(8); }} aria-label="Temporizador 3 segundos">
                <span class="cam-side-icon">⏱️</span><span>${timer ? '3 s' : 'Timer'}</span></button>
              ${multiCam
                ? html`<button type="button" class="cam-side" onClick=${() => { setFacing((f) => (f === 'user' ? 'environment' : 'user')); haptic(10); sound.play('whoosh'); }} aria-label="Cambiar de cámara">
                    <span class="cam-side-icon">🔄</span><span>Girar</span></button>`
                : null}
            </div>`}
      </div>
    </div>`;
}
