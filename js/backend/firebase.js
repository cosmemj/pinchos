// Backend real: Firebase Auth (anónimo) + Cloud Firestore. Todo dentro del plan gratuito Spark.
// Las fotos se guardan comprimidas dentro de Firestore (Cloud Storage ya no es gratis en proyectos nuevos).
import { randomCode } from '../util.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';

export async function createFirebaseBackend(config, { useEmulator = false } = {}) {
  const [appMod, authMod, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const { initializeApp } = appMod;
  const { getAuth, signInAnonymously, connectAuthEmulator, onAuthStateChanged } = authMod;
  const {
    initializeFirestore, connectFirestoreEmulator, doc, collection, getDoc, getDocs, setDoc, updateDoc,
    deleteDoc, onSnapshot, serverTimestamp, increment, runTransaction, writeBatch,
  } = fs;

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  // ---------------- sesión ----------------
  // Si el enlace se abre en dos pestañas a la vez (p. ej. al tocarlo dos veces en WhatsApp mientras carga),
  // cada pestaña creaba su propio usuario anónimo y Firebase acababa dejando el último en todas. La otra
  // pestaña seguía usando su uid antiguo y Firestore rechazaba todo ("No tienes permiso para hacer eso").
  // Ahora solo una pestaña inicia sesión (Web Locks), las demás reutilizan esa sesión y, si la sesión cambia
  // después por lo que sea, la app sigue siempre al usuario real.
  let uid = null;
  const me = () => auth.currentUser?.uid || uid;
  const userListeners = new Set();

  function waitForUser(ms) {
    return new Promise((resolve) => {
      let done = false;
      let off = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off?.();
        resolve();
      };
      const timer = setTimeout(finish, ms);
      off = onAuthStateChanged(auth, (u) => u && finish());
      if (done) off();
    });
  }

  async function ensureSignedIn() {
    if (auth.currentUser) return;
    const signIn = async (otherTabFirst) => {
      // Otra pestaña acaba de iniciar sesión: Firebase nos pasa su sesión en menos de un segundo.
      if (otherTabFirst && !auth.currentUser) await waitForUser(2500);
      if (!auth.currentUser) await signInAnonymously(auth);
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
    if (!locks?.request) return signIn(false);
    const done = await locks.request('pdo:auth', { ifAvailable: true }, async (lock) => {
      if (!lock) return false;
      await signIn(false);
      return true;
    });
    if (!done) await locks.request('pdo:auth', () => signIn(true));
  }

  const roomRef = (code) => doc(db, 'rooms', code);
  const subRef = (code, sub, id) => doc(db, 'rooms', code, sub, id);
  const subCol = (code, sub) => collection(db, 'rooms', code, sub);

  const toMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
  const plain = (snap) => {
    const d = snap.data({ serverTimestamps: 'estimate' }) || {};
    const out = { id: snap.id };
    for (const [k, v] of Object.entries(d)) out[k] = toMs(v);
    return out;
  };

  async function deleteAll(code, sub) {
    const qs = await getDocs(subCol(code, sub));
    for (let i = 0; i < qs.docs.length; i += 400) {
      const b = writeBatch(db);
      qs.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }

  return {
    kind: 'firebase',
    projectId: config.projectId,
    get uid() {
      return me();
    },
    serverTime: () => serverTimestamp(),
    inc: (n) => increment(n),

    async init() {
      await auth.authStateReady();
      await ensureSignedIn();
      uid = auth.currentUser.uid;
      let healing = false;
      onAuthStateChanged(auth, (u) => {
        if (u) {
          if (u.uid === uid) return;
          uid = u.uid;
          userListeners.forEach((cb) => cb(uid));
        } else if (!healing) {
          // Sesión perdida (caducada, borrada…): abrimos otra para que la app no se quede bloqueada.
          healing = true;
          ensureSignedIn().catch((e) => console.error(e)).finally(() => { healing = false; });
        }
      });
      return uid;
    },

    /** Avisa cuando cambia el usuario de esta pestaña (p. ej. al sincronizarse con otra pestaña). */
    onUserChange(cb) {
      userListeners.add(cb);
      return () => userListeners.delete(cb);
    },

    // ---------------- salas ----------------
    async getRoom(code) {
      const s = await getDoc(roomRef(code));
      return s.exists() ? plain(s) : null;
    },

    async createRoom({ name, settings, player }) {
      const uid = me();
      for (let i = 0; i < 8; i++) {
        const code = randomCode();
        const ref = roomRef(code);
        const snap = await getDoc(ref);
        if (snap.exists()) continue;
        try {
          await setDoc(ref, {
            name,
            hostUid: uid,
            hostName: player.name,
            coHosts: [],
            phase: 'lobby',
            settings,
            results: null,
            revealSeq: 0,
            revealAt: null,
            dishSeq: 0,
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          if (String(e?.code || '').includes('permission')) continue; // carrera con otra sala igual
          throw e;
        }
        await setDoc(subRef(code, 'players', uid), {
          name: player.name,
          avatar: player.avatar,
          joinedAt: serverTimestamp(),
          votedAt: null,
        });
        return code;
      }
      throw new Error('No se ha podido generar un código de sala. Inténtalo otra vez.');
    },

    watchRoom(code, cb, onErr) {
      return onSnapshot(roomRef(code), (s) => cb(s.exists() ? plain(s) : null), (e) => onErr?.(e));
    },

    updateRoom(code, patch) {
      return updateDoc(roomRef(code), patch);
    },

    async deleteRoom(code) {
      const uid = me();
      for (const sub of ['votes', 'photos', 'dishes']) await deleteAll(code, sub);
      const players = await getDocs(subCol(code, 'players'));
      const others = players.docs.filter((d) => d.id !== uid);
      for (let i = 0; i < others.length; i += 400) {
        const b = writeBatch(db);
        others.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
      await deleteDoc(subRef(code, 'players', uid)).catch(() => {});
      await deleteDoc(roomRef(code));
    },

    // ---------------- participantes ----------------
    watchPlayers(code, cb, onErr) {
      return onSnapshot(subCol(code, 'players'), (qs) => cb(qs.docs.map(plain)), (e) => onErr?.(e));
    },

    joinRoom(code, { name, avatar }) {
      return setDoc(subRef(code, 'players', me()), { name, avatar, joinedAt: serverTimestamp() }, { merge: true });
    },

    updatePlayer(code, pid, patch) {
      return updateDoc(subRef(code, 'players', pid), patch);
    },

    async removePlayer(code, pid) {
      const b = writeBatch(db);
      b.delete(subRef(code, 'votes', pid));
      b.delete(subRef(code, 'players', pid));
      await b.commit();
    },

    // ---------------- pinchos ----------------
    watchDishes(code, cb, onErr) {
      return onSnapshot(
        subCol(code, 'dishes'),
        { includeMetadataChanges: true },
        (qs) => cb(qs.docs.map((d) => ({ ...plain(d), pending: d.metadata.hasPendingWrites }))),
        (e) => onErr?.(e),
      );
    },

    async addDish(code, { name, desc = '', chefName = '', chefUids = [], chefOther = '', photo = null }) {
      const uid = me();
      const dref = doc(subCol(code, 'dishes'));
      const v = photo ? Date.now() : 0;
      await runTransaction(db, async (tx) => {
        const r = await tx.get(roomRef(code));
        if (!r.exists()) throw new Error('La sala ya no existe.');
        const num = (r.data().dishSeq || 0) + 1;
        tx.update(roomRef(code), { dishSeq: num });
        tx.set(dref, {
          num,
          name,
          desc,
          chefName,
          chefUids,
          chefOther,
          createdBy: uid,
          createdAt: serverTimestamp(),
          thumb: photo?.thumb || null,
          photoV: v,
        });
      });
      if (photo) await setDoc(subRef(code, 'photos', dref.id), { data: photo.full, createdBy: uid, v });
      return { id: dref.id, photoV: v };
    },

    /** photo: {full, thumb} para cambiarla · false para quitarla · null/undefined para no tocarla */
    async updateDish(code, id, patch = {}, photo = null) {
      const data = { ...patch };
      if (photo) {
        const v = Date.now();
        await setDoc(subRef(code, 'photos', id), { data: photo.full, createdBy: me(), v });
        data.thumb = photo.thumb;
        data.photoV = v;
      } else if (photo === false) {
        await deleteDoc(subRef(code, 'photos', id)).catch(() => {});
        data.thumb = null;
        data.photoV = 0;
      }
      if (Object.keys(data).length) await updateDoc(subRef(code, 'dishes', id), data);
      return data;
    },

    async deleteDish(code, id) {
      const b = writeBatch(db);
      b.delete(subRef(code, 'photos', id));
      b.delete(subRef(code, 'dishes', id));
      await b.commit();
    },

    async getPhoto(code, id) {
      const s = await getDoc(subRef(code, 'photos', id));
      return s.exists() ? s.data().data || null : null;
    },

    // ---------------- votos ----------------
    async submitVote(code, ranking, name) {
      const uid = me();
      const b = writeBatch(db);
      b.set(subRef(code, 'votes', uid), { ranking, name: name || '', at: serverTimestamp() });
      b.set(subRef(code, 'players', uid), { votedAt: serverTimestamp() }, { merge: true });
      await b.commit();
    },

    async getMyVote(code) {
      const s = await getDoc(subRef(code, 'votes', me()));
      return s.exists() ? plain(s) : null;
    },

    async getVotes(code) {
      const qs = await getDocs(subCol(code, 'votes'));
      return qs.docs.map((d) => ({ uid: d.id, ...plain(d) }));
    },

    async clearVotes(code) {
      await deleteAll(code, 'votes');
      const players = await getDocs(subCol(code, 'players'));
      const voted = players.docs.filter((d) => d.data().votedAt);
      for (let i = 0; i < voted.length; i += 400) {
        const b = writeBatch(db);
        voted.slice(i, i + 400).forEach((d) => b.update(d.ref, { votedAt: null }));
        await b.commit();
      }
    },
  };
}
