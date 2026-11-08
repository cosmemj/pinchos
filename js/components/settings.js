import { html } from '../lib.js';
import { MODES, SCORINGS, pointsPreview } from '../scoring.js';
import { OptionCards, Toggle } from './ui.js';

const MODE_OPTIONS = [
  { ...MODES.top3, sub: 'Sus 3 favoritos' },
  { ...MODES.top5, sub: 'Sus 5 favoritos' },
  { ...MODES.all, sub: 'Ranking completo' },
];
const SCORING_OPTIONS = [
  { ...SCORINGS.lineal, sub: '5 · 4 · 3 · 2 · 1' },
  { ...SCORINGS.eurovision, sub: '12 · 10 · 8 · 7…' },
  { ...SCORINGS.f1, sub: '25 · 18 · 15 · 12…' },
];

export function PointsChips({ settings, totalDishes = 0 }) {
  const chips = pointsPreview(settings, totalDishes);
  return html`
    <div class="points-chips" aria-label="Puntos por puesto">
      ${chips.map((c, i) => html`
        <span key=${i} class=${`points-chip p${i + 1}`}>
          <span class="points-chip-pos">${c.pos}</span>${c.pts ? html`<span class="points-chip-pts">${c.pts}</span>` : null}
        </span>`)}
    </div>`;
}

/** Formulario de reglas del concurso (lo usan "Crear" y el panel del anfitrión). */
export function SettingsForm({ value, onChange, disabled = false, totalDishes = 0 }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return html`
    <div class="settings-form">
      <div class="settings-block">
        <div class="settings-label">¿Qué vota cada uno?</div>
        <${OptionCards} options=${MODE_OPTIONS} value=${value.mode} disabled=${disabled} onChange=${(mode) => set({ mode })} />
      </div>
      <div class="settings-block">
        <div class="settings-label">¿Cuántos puntos da cada puesto?</div>
        <${OptionCards} options=${SCORING_OPTIONS} value=${value.scoring} disabled=${disabled} onChange=${(scoring) => set({ scoring })} />
        <${PointsChips} settings=${value} totalDishes=${totalDishes} />
        <p class="settings-note">Empates: gana quien tenga más 1º puestos, luego más 2º, etc.</p>
      </div>
      <div class="settings-block settings-toggles">
        <${Toggle} checked=${value.allowSelfVote} disabled=${disabled} onChange=${(allowSelfVote) => set({ allowSelfVote })}
          label="Se puede votar el pincho propio" hint="Si está apagado, tu pincho no aparece en tu papeleta" />
        <${Toggle} checked=${value.blind} disabled=${disabled} onChange=${(blind) => set({ blind })}
          label="Votación a ciegas 🙈" hint="Oculta fotos y autores hasta la gala; se vota por número y nombre" />
      </div>
    </div>`;
}
