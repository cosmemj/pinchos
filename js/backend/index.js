import { firebaseConfig, useEmulator } from '../config.js';

export function isFirebaseConfigured(c = firebaseConfig) {
  return !!(c && c.apiKey && c.projectId && !/^TU_|xxx/i.test(String(c.apiKey)));
}

/**
 * Crea el backend. Interfaz común (ver firebase.js / local.js):
 *  kind, uid, init(), getRoom, createRoom, watchRoom, updateRoom, deleteRoom,
 *  watchPlayers, joinRoom, updatePlayer, removePlayer,
 *  watchDishes, addDish, updateDish, deleteDish, getPhoto,
 *  submitVote, getMyVote, getVotes, clearVotes
 */
function demoForced() {
  try {
    return sessionStorage.getItem('pdo:forceDemo') === '1';
  } catch {
    return false;
  }
}

export async function createBackend() {
  if (isFirebaseConfigured() && !demoForced()) {
    const { createFirebaseBackend } = await import('./firebase.js');
    return createFirebaseBackend(firebaseConfig, { useEmulator });
  }
  const { createLocalBackend } = await import('./local.js');
  return createLocalBackend();
}
