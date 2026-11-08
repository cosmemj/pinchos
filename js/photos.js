// Caché en memoria de las fotos grandes (se descargan solo cuando hacen falta).
import { useState, useEffect } from './lib.js';
import { appState } from './store.js';

const cache = new Map(); // clave -> Promise<string|null>
const keyOf = (code, id, v) => `${code}/${id}/${v || 0}`;

export function getPhoto(code, dish) {
  if (!dish?.photoV) return Promise.resolve(null);
  const key = keyOf(code, dish.id, dish.photoV);
  if (!cache.has(key)) {
    const { backend } = appState.get();
    const p = backend
      .getPhoto(code, dish.id)
      .then((src) => {
        if (!src) cache.delete(key); // aún no sincronizada: reintentar más tarde
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
  if (v && src) cache.set(keyOf(code, id, v), Promise.resolve(src));
}

/** Foto grande de un pincho; mientras carga devuelve la miniatura. */
export function usePhoto(code, dish) {
  const [state, setState] = useState({ src: dish?.thumb || null, full: false });
  useEffect(() => {
    let alive = true;
    setState({ src: dish?.thumb || null, full: false });
    if (dish?.photoV) {
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

/** Precarga varias fotos con límite de tiempo. Devuelve Map id -> src. */
export async function preloadPhotos(code, dishes, timeoutMs = 4000) {
  const out = new Map();
  const jobs = dishes.map(async (d) => {
    const src = await getPhoto(code, d);
    const final = src || d.thumb || null;
    if (final) {
      out.set(d.id, final);
      await new Promise((res) => {
        const img = new Image();
        img.onload = img.onerror = res;
        img.src = final;
      });
    }
  });
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeoutMs))]);
  for (const d of dishes) if (!out.has(d.id) && d.thumb) out.set(d.id, d.thumb);
  return out;
}
