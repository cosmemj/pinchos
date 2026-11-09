// Caché en memoria de las fotos grandes (se descargan solo cuando hacen falta).
import { useState, useEffect } from './lib.js';
import { appState } from './store.js';

const cache = new Map(); // clave -> Promise<string|null>
const ready = new Map(); // clave -> foto ya descargada (se pinta al instante, sin parpadeo miniatura → foto)
const keyOf = (code, id, v) => `${code}/${id}/${v || 0}`;

export function getPhoto(code, dish) {
  if (!dish?.photoV) return Promise.resolve(null);
  const key = keyOf(code, dish.id, dish.photoV);
  if (!cache.has(key)) {
    const { backend } = appState.get();
    const p = backend
      .getPhoto(code, dish.id)
      .then((src) => {
        if (src) ready.set(key, src);
        else cache.delete(key); // aún no sincronizada: reintentar más tarde
        return src;
      })
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, p);
  }
  return cache.get(key);
}

export function primePhoto(code, id, v, src) {
  if (!v || !src) return;
  const key = keyOf(code, id, v);
  cache.set(key, Promise.resolve(src));
  ready.set(key, src);
}

function photoState(code, dish) {
  const src = dish?.photoV ? ready.get(keyOf(code, dish.id, dish.photoV)) : null;
  return src ? { src, full: true } : { src: dish?.thumb || null, full: false };
}

/** Foto grande de un pincho; mientras carga devuelve la miniatura. */
export function usePhoto(code, dish) {
  const [state, setState] = useState(() => photoState(code, dish));
  useEffect(() => {
    let alive = true;
    const now = photoState(code, dish);
    setState((s) => (s.src === now.src && s.full === now.full ? s : now));
    if (dish?.photoV && !now.full) {
      getPhoto(code, dish).then((src) => {
        if (alive && src) setState({ src, full: true });
      });
    }
    return () => {
      alive = false;
    };
  }, [code, dish?.id, dish?.photoV, dish?.thumb]);
  return state;
}

const keep = new Map(); // src -> Image ya decodificada (se vacía al superar unas pocas decenas)

/** Precarga varias fotos con límite de tiempo. Devuelve Map id -> src. */
export async function preloadPhotos(code, dishes, timeoutMs = 4000) {
  const out = new Map();
  if (keep.size > 40) keep.clear();
  const jobs = dishes.map(async (d) => {
    const src = await getPhoto(code, d);
    const final = src || d.thumb || null;
    if (final) {
      out.set(d.id, final);
      // decode(): la foto queda ya decodificada, así no aparece un instante en blanco al mostrarse.
      const img = new Image();
      img.src = final;
      await (img.decode ? img.decode().catch(() => {}) : new Promise((res) => { img.onload = img.onerror = res; }));
      keep.set(final, img); // mantener la referencia evita que el navegador descarte la decodificación
    }
  });
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeoutMs))]);
  for (const d of dishes) if (!out.has(d.id) && d.thumb) out.set(d.id, d.thumb);
  return out;
}
