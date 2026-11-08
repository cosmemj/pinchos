// Utilidades varias (sin dependencias de UI).

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1 para no confundir
export const CODE_LENGTH = 5;

function randomFrom(alphabet, len) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => alphabet[n % alphabet.length]).join('');
}

export const randomCode = (len = CODE_LENGTH) => randomFrom(CODE_ALPHABET, len);
export const randomId = (len = 20) =>
  randomFrom('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', len);

export const cx = (...a) => a.filter(Boolean).join(' ');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function hashHue(str = '') {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

export function slugify(s) {
  return (
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'pincho'
  );
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function joinNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

export const ordinal = (n) => `${n}º`;

// ---------- almacenamiento local seguro ----------
export const local = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* modo privado / sin espacio: no pasa nada */
    }
  },
};

// ---------- avatares ----------
export const AVATARS = [
  '🍤', '🧀', '🥖', '🍳', '🫒', '🥓', '🍄', '🌶️', '🥑', '🍅', '🦐', '🐙',
  '🥚', '🧄', '🥔', '🍖', '🍢', '🥟', '🌮', '🍕', '🥨', '🍩', '🍓', '🍋',
  '🍆', '🥕', '🌽', '🍗', '🦑', '🐟', '🍔', '🧁',
];
export const randomAvatar = () => AVATARS[Math.floor(Math.random() * AVATARS.length)];

export function getProfile() {
  return local.get('pdo:profile', null) || { name: '', avatar: randomAvatar() };
}
export function saveProfile(p) {
  local.set('pdo:profile', { name: p.name || '', avatar: p.avatar || randomAvatar() });
}

// ---------- salas recientes ----------
export function getRecentRooms() {
  const list = local.get('pdo:recent', []);
  return Array.isArray(list) ? list : [];
}
export function rememberRoom(info) {
  if (!info?.code) return;
  const list = getRecentRooms().filter((r) => r.code !== info.code);
  const prev = getRecentRooms().find((r) => r.code === info.code) || {};
  list.unshift({ ...prev, ...info, at: Date.now() });
  local.set('pdo:recent', list.slice(0, 12));
}
export function forgetRoom(code) {
  local.set('pdo:recent', getRecentRooms().filter((r) => r.code !== code));
}

// ---------- enlaces / compartir ----------
export function roomLink(code) {
  const u = new URL(location.href);
  u.hash = '';
  u.search = '';
  u.pathname = u.pathname.replace(/index\.html$/, '');
  u.searchParams.set('sala', code);
  return u.toString();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Comparte con la hoja nativa (WhatsApp, etc.). Devuelve 'shared' | 'cancelled' | 'unsupported'. */
export async function nativeShare(data) {
  if (!navigator.share) return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return e?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// ---------- feedback físico ----------
export function haptic(pattern = 10) {
  try {
    // Sin un toque previo del usuario el navegador lo bloquea (y ensucia la consola)
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* iOS no vibra: sin problema */
  }
}

export const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// ---------- errores legibles ----------
export function friendlyError(e) {
  const code = e?.code || '';
  const msg = String(e?.message || e || '');
  if (code.includes('permission-denied') || msg.includes('permission'))
    return 'No tienes permiso para hacer eso (o la sala ha cambiado de fase).';
  if (code.includes('unavailable') || code.includes('deadline') || msg.includes('offline'))
    return 'Sin conexión con el servidor. Revisa tu internet y vuelve a intentarlo.';
  if (code.includes('resource-exhausted')) return 'Se ha agotado la cuota gratuita de hoy 😅 Prueba mañana.';
  if (code.includes('operation-not-allowed') || code.includes('admin-restricted'))
    return 'Activa el acceso “Anónimo” en Firebase → Authentication → Método de acceso.';
  if (code.includes('api-key')) return 'La configuración de Firebase (apiKey) no es válida. Revisa js/config.js.';
  if (code.includes('invalid-argument') && msg.toLowerCase().includes('size'))
    return 'La foto es demasiado grande. Prueba con otra.';
  if (code.includes('not-found')) return 'No se ha encontrado. ¿Se ha borrado la sala?';
  return msg.replace(/^Firebase(Error)?:?\s*/i, '') || 'Algo ha fallado. Vuelve a intentarlo.';
}

export function timeAgo(ms) {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
