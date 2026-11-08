// Backend de DEMO: IndexedDB + BroadcastChannel. Solo funciona dentro de este navegador.
// Cada pestaña es un "usuario" distinto, así puedes simular a varios amigos.
import { randomCode, randomId } from '../util.js';

const DB_NAME = 'pincho-de-oro-demo';
const STORE = 'docs';
let dbPromise = null;

function idb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

async function readDoc(path) {
  const db = await idb();
  const v = await req(db.transaction(STORE).objectStore(STORE).get(path));
  return v ?? null;
}
async function writeOps(ops) {
  const db = await idb();
  const t = db.transaction(STORE, 'readwrite');
  const s = t.objectStore(STORE);
  for (const op of ops) {
    if (op.del) s.delete(op.path);
    else s.put(op.data, op.path);
  }
  await done(t);
  emit(ops.map((o) => o.path));
}
async function listCol(colPath) {
  const db = await idb();
  const range = IDBKeyRange.bound(`${colPath}/`, `${colPath}/￿`);
  const s = db.transaction(STORE).objectStore(STORE);
  const [keys, vals] = await Promise.all([req(s.getAllKeys(range)), req(s.getAll(range))]);
  const out = [];
  keys.forEach((k, i) => {
    const rest = String(k).slice(colPath.length + 1);
    if (!rest.includes('/')) out.push({ ...vals[i], id: rest });
  });
  return out;
}

// --------- notificaciones entre pestañas ---------
const subs = new Set();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pdo-demo') : null;
if (channel) channel.onmessage = (e) => fire(e.data || []);
function emit(paths) {
  channel?.postMessage(paths);
  fire(paths);
}
function fire(paths) {
  for (const s of subs) if (paths.some(s.match)) s.refresh();
}
function watch(match, load, cb) {
  let seq = 0;
  const s = {
    match,
    refresh: async () => {
      const my = ++seq;
      try {
        const v = await load();
        if (my === seq && subs.has(s)) cb(v);
      } catch (e) {
        console.error(e);
      }
    },
  };
  subs.add(s);
  s.refresh();
  return () => subs.delete(s);
}
const isChildOf = (col) => (p) => p.startsWith(`${col}/`) && !p.slice(col.length + 1).includes('/');

function applyPatch(cur, patch) {
  const out = { ...(cur || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && v.__op === 'now') out[k] = Date.now();
    else if (v && v.__op === 'inc') out[k] = (Number(out[k]) || 0) + v.n;
    else if (v === undefined) continue;
    else out[k] = v;
  }
  return out;
}

export async function createLocalBackend() {
  let uid = null;
  try {
    uid = sessionStorage.getItem('pdo-demo-uid');
    if (!uid) {
      uid = `demo-${randomId(10)}`;
      sessionStorage.setItem('pdo-demo-uid', uid);
    }
  } catch {
    uid = `demo-${randomId(10)}`;
  }
  await idb();

  const R = (code) => `rooms/${code}`;
  const P = (code, sub, id) => `rooms/${code}/${sub}/${id}`;

  async function deleteSub(code, sub) {
    const list = await listCol(`${R(code)}/${sub}`);
    if (list.length) await writeOps(list.map((d) => ({ path: P(code, sub, d.id), del: true })));
  }

  return {
    kind: 'local',
    projectId: null,
    get uid() {
      return uid;
    },
    serverTime: () => ({ __op: 'now' }),
    inc: (n) => ({ __op: 'inc', n }),
    init: async () => uid,

    // ---------------- salas ----------------
    async getRoom(code) {
      const r = await readDoc(R(code));
      return r ? { ...r, id: code } : null;
    },
    async createRoom({ name, settings, player }) {
      let code = randomCode();
      while (await readDoc(R(code))) code = randomCode();
      const now = Date.now();
      await writeOps([
        {
          path: R(code),
          data: {
            name, hostUid: uid, hostName: player.name, coHosts: [], phase: 'lobby', settings,
            results: null, revealSeq: 0, revealAt: null, dishSeq: 0, createdAt: now,
          },
        },
        { path: P(code, 'players', uid), data: { name: player.name, avatar: player.avatar, joinedAt: now, votedAt: null } },
      ]);
      return code;
    },
    watchRoom(code, cb) {
      return watch((p) => p === R(code), async () => {
        const r = await readDoc(R(code));
        return r ? { ...r, id: code } : null;
      }, cb);
    },
    async updateRoom(code, patch) {
      const cur = await readDoc(R(code));
      if (!cur) throw Object.assign(new Error('La sala no existe'), { code: 'not-found' });
      await writeOps([{ path: R(code), data: applyPatch(cur, patch) }]);
    },
    async deleteRoom(code) {
      for (const sub of ['votes', 'photos', 'dishes', 'players']) await deleteSub(code, sub);
      await writeOps([{ path: R(code), del: true }]);
    },

    // ---------------- participantes ----------------
    watchPlayers(code, cb) {
      const col = `${R(code)}/players`;
      return watch(isChildOf(col), () => listCol(col), cb);
    },
    async joinRoom(code, { name, avatar }) {
      const cur = await readDoc(P(code, 'players', uid));
      await writeOps([{ path: P(code, 'players', uid), data: { votedAt: null, ...(cur || {}), name, avatar, joinedAt: Date.now() } }]);
    },
    async updatePlayer(code, pid, patch) {
      const cur = await readDoc(P(code, 'players', pid));
      if (!cur) return;
      await writeOps([{ path: P(code, 'players', pid), data: applyPatch(cur, patch) }]);
    },
    async removePlayer(code, pid) {
      await writeOps([
        { path: P(code, 'votes', pid), del: true },
        { path: P(code, 'players', pid), del: true },
      ]);
    },

    // ---------------- pinchos ----------------
    watchDishes(code, cb) {
      const col = `${R(code)}/dishes`;
      return watch(isChildOf(col), async () => (await listCol(col)).map((d) => ({ ...d, pending: false })), cb);
    },
    async addDish(code, { name, desc = '', chefName = '', chefUids = [], chefOther = '', photo = null }) {
      const room = await readDoc(R(code));
      if (!room) throw new Error('La sala ya no existe.');
      const num = (room.dishSeq || 0) + 1;
      const id = randomId(20);
      const v = photo ? Date.now() : 0;
      const ops = [
        { path: R(code), data: { ...room, dishSeq: num } },
        {
          path: P(code, 'dishes', id),
          data: { num, name, desc, chefName, chefUids, chefOther, createdBy: uid, createdAt: Date.now(), thumb: photo?.thumb || null, photoV: v },
        },
      ];
      if (photo) ops.push({ path: P(code, 'photos', id), data: { data: photo.full, createdBy: uid, v } });
      await writeOps(ops);
      return { id, photoV: v };
    },
    async updateDish(code, id, patch = {}, photo = null) {
      const cur = await readDoc(P(code, 'dishes', id));
      if (!cur) throw Object.assign(new Error('Ese pincho ya no existe'), { code: 'not-found' });
      const data = { ...patch };
      const ops = [];
      if (photo) {
        const v = Date.now();
        ops.push({ path: P(code, 'photos', id), data: { data: photo.full, createdBy: uid, v } });
        data.thumb = photo.thumb;
        data.photoV = v;
      } else if (photo === false) {
        ops.push({ path: P(code, 'photos', id), del: true });
        data.thumb = null;
        data.photoV = 0;
      }
      ops.push({ path: P(code, 'dishes', id), data: applyPatch(cur, data) });
      await writeOps(ops);
      return data;
    },
    async deleteDish(code, id) {
      await writeOps([
        { path: P(code, 'photos', id), del: true },
        { path: P(code, 'dishes', id), del: true },
      ]);
    },
    async getPhoto(code, id) {
      const p = await readDoc(P(code, 'photos', id));
      return p?.data || null;
    },

    // ---------------- votos ----------------
    async submitVote(code, ranking, name) {
      const room = await readDoc(R(code));
      if (room?.phase !== 'voting') throw Object.assign(new Error('La votación está cerrada'), { code: 'permission-denied' });
      const me = await readDoc(P(code, 'players', uid));
      await writeOps([
        { path: P(code, 'votes', uid), data: { ranking, name: name || '', at: Date.now() } },
        { path: P(code, 'players', uid), data: { ...(me || {}), votedAt: Date.now() } },
      ]);
    },
    async getMyVote(code) {
      const v = await readDoc(P(code, 'votes', uid));
      return v ? { ...v, id: uid } : null;
    },
    async getVotes(code) {
      return (await listCol(`${R(code)}/votes`)).map((v) => ({ ...v, uid: v.id }));
    },
    async clearVotes(code) {
      await deleteSub(code, 'votes');
      const players = await listCol(`${R(code)}/players`);
      const ops = players.filter((p) => p.votedAt).map((p) => {
        const { id, ...rest } = p;
        return { path: P(code, 'players', id), data: { ...rest, votedAt: null } };
      });
      if (ops.length) await writeOps(ops);
    },
  };
}
