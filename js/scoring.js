// Lógica de puntuación: pura, sin DOM, fácil de testear.

export const MODES = {
  top3: { id: 'top3', label: 'Top 3', emoji: '🥇', picks: 3, desc: 'Cada uno elige sus 3 favoritos' },
  top5: { id: 'top5', label: 'Top 5', emoji: '🖐️', picks: 5, desc: 'Cada uno elige sus 5 favoritos' },
  all: { id: 'all', label: 'Todos', emoji: '📋', picks: Infinity, desc: 'Ordenar todos, del mejor al peor' },
};

export const SCORINGS = {
  lineal: { id: 'lineal', label: 'Lineal', emoji: '📏', desc: 'Cada puesto vale 1 punto más que el siguiente' },
  eurovision: { id: 'eurovision', label: 'Eurovisión', emoji: '🎤', desc: '12, 10, 8, 7, 6… ¡douze points!' },
  f1: { id: 'f1', label: 'Fórmula 1', emoji: '🏎️', desc: '25, 18, 15, 12, 10… como en la F1' },
};

const EURO = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1];
const F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export const DEFAULT_SETTINGS = { mode: 'top5', scoring: 'lineal', allowSelfVote: false, blind: false };

export function normalizeSettings(s = {}) {
  return {
    mode: MODES[s.mode] ? s.mode : DEFAULT_SETTINGS.mode,
    scoring: SCORINGS[s.scoring] ? s.scoring : DEFAULT_SETTINGS.scoring,
    allowSelfVote: !!s.allowSelfVote,
    blind: !!s.blind,
  };
}

/** Nº de posiciones que puntúan. En "Todos" depende del nº de pinchos. */
export function slotsFor(mode, totalDishes) {
  const m = MODES[mode] || MODES.top5;
  return m.picks === Infinity ? Math.max(0, totalDishes) : m.picks;
}

/** Puntos para cada posición (índice 0 = 1º). */
export function pointsTable(scoring, slots) {
  const n = Math.max(0, slots | 0);
  if (scoring === 'eurovision') return Array.from({ length: n }, (_, i) => EURO[i] ?? 0);
  if (scoring === 'f1') return Array.from({ length: n }, (_, i) => F1[i] ?? 0);
  return Array.from({ length: n }, (_, i) => n - i);
}

/** Nombre del autor siempre actualizado con los nombres actuales de los participantes. */
export function chefLabel(dish, players) {
  if (!dish) return '';
  const byId = new Map((players || []).map((p) => [p.id, p.name]));
  const uids = Array.isArray(dish.chefUids) ? dish.chefUids : [];
  if (!uids.length) return dish.chefOther || dish.chefName || '';
  if (!uids.every((id) => byId.has(id))) return dish.chefName || '';
  const names = uids.map((id) => byId.get(id));
  if (dish.chefOther) names.push(dish.chefOther);
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

export const isChef = (dish, uid) => !!uid && Array.isArray(dish?.chefUids) && dish.chefUids.includes(uid);

/** Pinchos que puede votar un usuario. */
export function eligibleDishes(dishes, uid, settings) {
  if (settings?.allowSelfVote) return dishes;
  return dishes.filter((d) => !isChef(d, uid));
}

/** Cuántos pinchos tiene que elegir el votante. */
export function picksNeeded(settings, eligibleCount) {
  const m = MODES[settings?.mode] || MODES.top5;
  return m.picks === Infinity ? eligibleCount : Math.min(m.picks, eligibleCount);
}

/** Desempate: más puntos → más 1º puestos → más 2º… → más votos recibidos. */
export function compareStats(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  const len = Math.max(a.positions.length, b.positions.length);
  for (let i = 0; i < len; i++) {
    const d = (b.positions[i] || 0) - (a.positions[i] || 0);
    if (d) return d;
  }
  return b.votes - a.votes;
}

/** Limpia una papeleta: ids válidos, sin duplicados, sin el propio pincho si no se permite. */
export function sanitizeBallot(ranking, { dishMap, uid, settings, slots }) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(ranking) ? ranking : []) {
    const dish = dishMap.get(id);
    if (!dish || seen.has(id)) continue;
    if (!settings.allowSelfVote && isChef(dish, uid)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= slots) break;
  }
  return out;
}

/**
 * Calcula la clasificación.
 * @param {{dishes: Array, votes: Array<{uid: string, ranking: string[]}>, settings: object}} p
 */
export function computeResults({ dishes, votes, settings: rawSettings }) {
  const settings = normalizeSettings(rawSettings);
  const dishMap = new Map(dishes.map((d) => [d.id, d]));
  const slots = slotsFor(settings.mode, dishes.length);
  const table = pointsTable(settings.scoring, slots);
  const stats = new Map(
    dishes.map((d) => [d.id, { id: d.id, points: 0, votes: 0, positions: Array(slots).fill(0) }]),
  );

  let voters = 0;
  for (const v of votes) {
    const ballot = sanitizeBallot(v.ranking, { dishMap, uid: v.uid, settings, slots });
    if (!ballot.length) continue;
    voters++;
    ballot.forEach((id, i) => {
      const s = stats.get(id);
      s.points += table[i] || 0;
      s.votes += 1;
      s.positions[i] += 1;
    });
  }

  const list = [...stats.values()];
  list.sort((a, b) => compareStats(a, b) || (dishMap.get(a.id).num || 0) - (dishMap.get(b.id).num || 0));

  let rank = 0;
  list.forEach((s, i) => {
    if (i === 0 || compareStats(list[i - 1], s) !== 0) rank = i + 1;
    s.rank = rank;
  });

  return {
    at: Date.now(),
    voters,
    mode: settings.mode,
    scoring: settings.scoring,
    table,
    ranking: list.map((s) => {
      const d = dishMap.get(s.id);
      return {
        ...s,
        num: d.num || 0,
        name: d.name || 'Pincho',
        chefName: d.chefName || '',
        chefUids: d.chefUids || [],
      };
    }),
  };
}

/** Grupos para la gala: del puesto más bajo (≤5) al 1º, agrupando empates. */
export function revealGroups(results, maxRank = 5) {
  const top = (results?.ranking || []).filter((r) => r.points > 0 && r.rank <= maxRank);
  const map = new Map();
  for (const r of top) {
    if (!map.has(r.rank)) map.set(r.rank, []);
    map.get(r.rank).push(r);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([rank, entries]) => ({ rank, entries }));
}

/** Texto corto de puntos por puesto para mostrar en la UI. */
export function pointsPreview(settings, totalDishes) {
  const s = normalizeSettings(settings);
  if (s.mode === 'all' && !totalDishes) {
    if (s.scoring === 'lineal') return [{ pos: '1º', pts: 'N' }, { pos: '…', pts: '' }, { pos: 'Último', pts: '1' }];
  }
  const slots = s.mode === 'all' ? Math.max(totalDishes || 10, 1) : slotsFor(s.mode, totalDishes);
  const table = pointsTable(s.scoring, slots);
  const shown = table.slice(0, s.mode === 'all' ? 6 : slots).map((pts, i) => ({ pos: `${i + 1}º`, pts: String(pts) }));
  if (s.mode === 'all' && table.length > 6) shown.push({ pos: '…', pts: '' });
  return shown;
}
