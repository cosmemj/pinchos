import { useState, useEffect } from './lib.js';

export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/** Rutas: #/  ·  #/crear  ·  #/sala/CODIGO   (también acepta ?sala=CODIGO en el enlace compartido) */
export function parseRoute() {
  const sp = new URLSearchParams(location.search);
  const sala = sp.get('sala') || sp.get('s');
  if (sala) {
    sp.delete('sala');
    sp.delete('s');
    const qs = sp.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + `#/sala/${cleanCode(sala)}`);
  }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'crear') return { name: 'create', key: 'create' };
  if (parts[0] === 'sala' && parts[1]) {
    const code = cleanCode(parts[1]);
    return { name: 'room', code, key: `room-${code}` };
  }
  return { name: 'home', key: 'home' };
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (replace) {
    history.replaceState(null, '', location.pathname + location.search + hash);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
