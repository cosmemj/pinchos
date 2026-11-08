import { html, useState, useMemo } from '../lib.js';
import { cx, nativeShare, copyText, roomLink } from '../util.js';
import { MODES, SCORINGS } from '../scoring.js';
import { usePhoto } from '../photos.js';
import { Button, DishImage, Empty, toast } from './ui.js';
import { PhotosSheet } from './dishes.js';

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };

function PodiumCol({ ctx, entry, place }) {
  const dish = ctx.dishes.find((d) => d.id === entry.id) || { id: entry.id, num: entry.num };
  const photo = usePhoto(ctx.code, dish);
  return html`
    <div class=${cx('podium-col', `place-${place}`)}>
      <div class="podium-photo">
        ${entry.rank === 1 ? html`<span class="podium-crown" aria-hidden="true">👑</span>` : null}
        <${DishImage} src=${photo.src} num=${entry.num} alt=${entry.name} />
      </div>
      <div class="podium-name">${entry.name}</div>
      <div class="podium-chef">${entry.chefName || ''}</div>
      <div class="podium-block">
        <span class="podium-medal">${MEDAL[entry.rank] || `${entry.rank}º`}</span>
        <span class="podium-pts">${entry.points}<small> pts</small></span>
      </div>
    </div>`;
}

export function resultsText(room) {
  const r = room.results;
  const lines = [`🏆 Resultados · ${room.name}`, ''];
  r.ranking.filter((e) => e.points > 0).slice(0, 10).forEach((e) => {
    lines.push(`${MEDAL[e.rank] || `${e.rank}º`} ${e.name}${e.chefName ? ` — ${e.chefName}` : ''} (${e.points} pts)`);
  });
  lines.push('', `🗳️ ${r.voters} votos · ${MODES[r.mode]?.label || ''} · ${SCORINGS[r.scoring]?.label || ''}`);
  return lines.join('\n');
}

export function ResultsTab({ ctx, onReplay, hostActions }) {
  const { room, isHost, dishes, code } = ctx;
  const res = room.results;
  const [gallery, setGallery] = useState(false);
  const scored = useMemo(() => (res?.ranking || []).filter((e) => e.points > 0), [res]);
  if (!res) return html`<section class="tab"><${Empty} emoji="⏳" title="Calculando resultados…" /></section>`;
  const max = Math.max(1, ...res.ranking.map((e) => e.points));
  const podium = scored.slice(0, 3);
  const thumbs = new Map(dishes.map((d) => [d.id, d]));

  const share = async () => {
    const text = resultsText(room);
    const r = await nativeShare({ title: `Resultados · ${room.name}`, text: `${text}\n\n${roomLink(code)}` });
    if (r === 'unsupported') {
      const ok = await copyText(text);
      toast(ok ? 'Resultados copiados. ¡Pégalos en el grupo!' : 'No se pudo copiar', { icon: '📋' });
    }
  };

  return html`
    <section class="tab results">
      <div class="results-hero">
        <div class="results-trophy" aria-hidden="true">🏆</div>
        <h2 class="neon-sub">¡Tenemos ganador!</h2>
        <p class="muted center">${res.voters} ${res.voters === 1 ? 'voto' : 'votos'} · ${MODES[res.mode]?.label} · ${SCORINGS[res.scoring]?.label}</p>
      </div>

      ${podium.length
        ? html`<div class=${cx('podium', `n-${podium.length}`)}>
            ${podium[1] ? html`<${PodiumCol} ctx=${ctx} entry=${podium[1]} place=${2} />` : null}
            <${PodiumCol} ctx=${ctx} entry=${podium[0]} place=${1} />
            ${podium[2] ? html`<${PodiumCol} ctx=${ctx} entry=${podium[2]} place=${3} />` : null}
          </div>`
        : html`<${Empty} emoji="🤔" title="Nadie ha recibido puntos" text="¿Seguro que se votó? El anfitrión puede reabrir la votación." />`}

      <div class="results-actions">
        <${Button} size="lg" block icon="▶️" onClick=${onReplay}>Ver la gala otra vez</${Button}>
        <div class="results-actions-row">
          <${Button} variant="secondary" icon="📤" onClick=${share}>Compartir</${Button}>
          <${Button} variant="secondary" icon="📷" onClick=${() => setGallery(true)}>Fotos</${Button}>
        </div>
      </div>

      <h3 class="section-title">Clasificación completa</h3>
      <ol class="ranking-list">
        ${res.ranking.map((e, i) => {
          const d = thumbs.get(e.id);
          return html`
            <li key=${e.id} class=${cx('rank-row', e.rank <= 3 && e.points > 0 && `top-${e.rank}`)} style=${{ '--i': i, '--w': `${(e.points / max) * 100}%` }}>
              <span class="rank-pos">${e.points > 0 && MEDAL[e.rank] ? MEDAL[e.rank] : `${e.rank}º`}</span>
              <${DishImage} src=${d?.thumb} num=${e.num} className="rank-thumb" />
              <span class="rank-text">
                <span class="rank-name">${e.name}</span>
                <span class="rank-chef">${e.chefName || ''}${e.positions?.[0] ? ` · ${e.positions[0]}× 1º` : ''}</span>
              </span>
              <span class="rank-score"><b>${e.points}</b><small>pts</small></span>
              <span class="rank-bar" aria-hidden="true"></span>
            </li>`;
        })}
      </ol>

      ${isHost
        ? html`
          <div class="card host-card">
            <div class="host-card-title">👑 Panel del anfitrión</div>
            <${Button} variant="secondary" block icon="🔁" onClick=${hostActions.replayForAll}>Repetir la gala para todos</${Button}>
            <${Button} variant="ghost" block icon="↩️" onClick=${hostActions.reopenVoting}>Reabrir la votación</${Button}>
          </div>`
        : null}

      <${PhotosSheet} ctx=${ctx} open=${gallery} onClose=${() => setGallery(false)} />
    </section>`;
}
