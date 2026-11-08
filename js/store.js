import { useEffect, useReducer } from './lib.js';

/** Store minimalista con suscripción, para estado global sin frameworks extra. */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(state));
  return {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? next(state) : next;
      emit();
    },
    patch(obj) {
      state = { ...state, ...obj };
      emit();
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

export function useStore(store) {
  const [, force] = useReducer((x) => x + 1, 0);
  const seen = store.get();
  useEffect(() => {
    const unsub = store.subscribe(() => force());
    if (store.get() !== seen) force();
    return unsub;
  }, [store]);
  return store.get();
}

/** Estado global de la app: backend activo, uid, conexión… */
export const appState = createStore({
  status: 'booting', // booting | ready | error
  error: null,
  backend: null,
  uid: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
});
