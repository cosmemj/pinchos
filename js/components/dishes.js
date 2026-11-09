import { html, useState, useEffect, useMemo, useRef } from '../lib.js';
import { cx, haptic, joinNames, slugify, friendlyError, plural } from '../util.js';
import { sound, burst } from '../fx.js';
import { isChef } from '../scoring.js';
import { usePhoto, primePhoto, getPhoto } from '../photos.js';
import { saveImages } from '../image.js';
import { takePhoto, pickPhoto } from './camera.js';
import {
  Button, Sheet, Field, Avatar, DishImage, Empty, Spinner, toast, toastError, confirmDialog,
} from './ui.js';

export const canEditDish = (dish, uid, isHost) => !!dish && (dish.createdBy === uid || isChef(dish, uid) || isHost);

/** ¿Debe ocultarse el pincho a este usuario por la votación a ciegas? */
export function isHiddenFor(dish, ctx) {
  const { room, uid } = ctx;
  if (!room.settings?.blind || room.phase === 'results') return false;
  return !(dish.createdBy === uid || isChef(dish, uid));
}

export function DishCard({ dish, hidden = false, mine = false, onClick, selectedPos = 0, disabled = false, className = '', note = '' }) {
  return html`
    <button type="button" data-dish=${dish.id}
      class=${cx('dish-card', mine && 'is-mine', selectedPos && 'is-selected', disabled && 'is-disabled', className)}
      onClick=${(e) => onClick?.(dish, e.currentTarget)} aria-disabled=${disabled}
      aria-label=${`Pincho ${dish.num}: ${dish.name}${selectedPos ? `, elegido en posición ${selectedPos}` : ''}`}>
      <${DishImage} src=${dish.thumb} num=${dish.num} hidden=${hidden} alt=${dish.name}>
        <span class="dish-num">#${dish.num}</span>
        ${dish.pending ? html`<span class="dish-sync" title="Sincronizando…"><${Spinner} size=${14} /></span>` : null}
        ${mine ? html`<span class="dish-mine">Tu pincho</span>` : null}
        ${note ? html`<span class="dish-note">${note}</span>` : null}
        ${selectedPos ? html`<span class=${cx('dish-pos', `pos-${Math.min(selectedPos, 4)}`)} key=${`p${selectedPos}`}>${selectedPos}</span>` : null}
      </${DishImage}>
      <span class="dish-info">
        <span class="dish-name">${dish.name}</span>
        <span class="dish-chef">${hidden ? '🤫 Autor secreto' : dish.chefName ? `por ${dish.chefName}` : 'Sin autor'}</span>
      </span>
    </button>`;
}

export function DishesTab({ ctx }) {
  const { room, dishes, uid, isHost } = ctx;
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(null); // null | { id?: string }
  const [gallery, setGallery] = useState(false);
  const canAdd = room.phase === 'lobby' || (isHost && room.phase === 'voting');
  const detail = dishes.find((d) => d.id === detailId) || null;
  const editing = form?.id ? dishes.find((d) => d.id === form.id) : null;
  const withPhotos = dishes.filter((d) => d.photoV).length;
  const blindHidden = room.settings?.blind && room.phase !== 'results';
  const myDishes = dishes.filter((d) => isChef(d, uid)).length;

  const openAdd = () => {
    haptic(10);
    sound.play('pop');
    setForm({});
  };

  return html`
    <section class="tab dishes-tab">
      <div class="tab-head">
        <h2 class="tab-title">Pinchos <span class="count-pill">${dishes.length}</span></h2>
        ${withPhotos && (!blindHidden || isHost)
          ? html`<button type="button" class="link-btn" onClick=${() => setGallery(true)}>📷 Fotos (${withPhotos})</button>`
          : null}
      </div>

      ${room.phase === 'lobby' && !myDishes && dishes.length > 0
        ? html`<button type="button" class="nudge" onClick=${openAdd}>
            <span class="nudge-emoji">👨‍🍳</span><span><b>¿Has traído pincho?</b> Añádelo con una foto tuya y del plato.</span><span class="nudge-go">→</span>
          </button>`
        : null}

      ${dishes.length
        ? html`
          <div class="dish-grid">
            ${dishes.map((d, i) => html`
              <div class="dish-cell" key=${d.id} style=${{ '--i': i }}>
                <${DishCard} dish=${d} hidden=${isHiddenFor(d, ctx)} mine=${isChef(d, uid)} onClick=${() => { haptic(8); setDetailId(d.id); }} />
              </div>`)}
          </div>`
        : html`
          <${Empty} emoji="🍽️" title="Todavía no hay pinchos"
            text=${canAdd ? 'Añade el primero: haz una foto al cocinero con su pincho y ponle nombre.' : 'El anfitrión todavía no ha añadido pinchos.'}>
            ${canAdd ? html`<${Button} size="lg" icon="📸" onClick=${openAdd}>Añadir el primer pincho</${Button}>` : null}
          </${Empty}>`}

      ${room.phase === 'voting' && !isHost ? html`<p class="tab-foot">La votación está abierta: ya no se pueden añadir pinchos.</p>` : null}

      ${canAdd && dishes.length
        ? html`<button type="button" class="fab" onClick=${openAdd} aria-label="Añadir pincho"><span class="fab-plus">+</span><span class="fab-label">Añadir pincho</span></button>`
        : null}

      <${DishSheet} ctx=${ctx} dish=${detail} open=${!!detail} onClose=${() => setDetailId(null)}
        onEdit=${() => { setForm({ id: detail.id }); setDetailId(null); }} />
      <${DishForm} ctx=${ctx} open=${!!form} editing=${editing} onClose=${() => setForm(null)} />
      <${PhotosSheet} ctx=${ctx} open=${gallery} onClose=${() => setGallery(false)} />
    </section>`;
}

// ---------------------------------------------------------------------------
function DishSheet({ ctx, dish: current, open, onClose, onEdit }) {
  const { code, uid, isHost, room, backend } = ctx;
  const last = useRef(current);
  if (current) last.current = current;
  const dish = current || last.current;
  const [peek, setPeek] = useState(false);
  const photo = usePhoto(code, dish);
  const [busy, setBusy] = useState('');
  useEffect(() => setPeek(false), [dish?.id]);
  if (!dish) return null;

  const hidden = isHiddenFor(dish, ctx) && !peek;
  const canEdit = canEditDish(dish, uid, isHost);
  const canDelete = (dish.createdBy === uid || isHost) && room.phase !== 'results';
  const fileName = `pincho-${String(dish.num).padStart(2, '0')}-${slugify(dish.name)}.jpg`;

  const save = async () => {
    if (!photo.src) return;
    const r = await saveImages([{ dataURL: photo.src, name: fileName }], { title: dish.name });
    if (r === 'downloaded') toast('Foto descargada', { icon: '💾' });
  };

  const changePhoto = async (source) => {
    try {
      const set = source === 'gallery' ? await pickPhoto() : await takePhoto({ title: `Foto · ${dish.name}` });
      if (!set) return;
      setBusy('photo');
      const res = await backend.updateDish(code, dish.id, {}, set);
      primePhoto(code, dish.id, res.photoV, set.full);
      sound.play('success');
      toast('¡Foto actualizada!', { icon: '📸' });
    } catch (e) {
      toastError(friendlyError(e));
    } finally {
      setBusy('');
    }
  };

  const del = async () => {
    const ok = await confirmDialog({
      title: `¿Eliminar “${dish.name}”?`, message: 'Se borrará el pincho y su foto. No se puede deshacer.',
      confirm: 'Eliminar', danger: true, emoji: '🗑️',
    });
    if (!ok) return;
    try {
      await backend.deleteDish(code, dish.id);
      toast('Pincho eliminado', { icon: '🗑️' });
      onClose();
    } catch (e) {
      toastError(friendlyError(e));
    }
  };

  return html`
    <${Sheet} open=${open} onClose=${onClose} title=${`Pincho #${dish.num}`} tall>
      <div class="detail">
        <div class="detail-photo">
          <${DishImage} src=${photo.src} num=${dish.num} hidden=${hidden} alt=${dish.name} />
          ${photo.src && !photo.full && dish.photoV && !hidden ? html`<span class="detail-loading"><${Spinner} size=${18} /></span>` : null}
          ${busy === 'photo' ? html`<div class="detail-busy"><${Spinner} size=${30} /><span>Subiendo foto…</span></div>` : null}
        </div>
        <h3 class="detail-name">${dish.name}</h3>
        <p class="detail-chef">${hidden ? '🤫 Autor secreto hasta la gala' : dish.chefName ? `👨‍🍳 ${dish.chefName}` : 'Sin autor'}</p>
        ${dish.desc ? html`<p class="detail-desc">${dish.desc}</p>` : null}
        ${hidden && isHost ? html`<button type="button" class="link-btn" onClick=${() => setPeek(true)}>👁️ Ver igualmente (solo anfitrión)</button>` : null}

        <div class="detail-actions">
          ${photo.src && !hidden ? html`<${Button} variant="secondary" icon="💾" onClick=${save}>Guardar foto</${Button}>` : null}
          ${canEdit ? html`<${Button} variant="secondary" icon="📸" loading=${busy === 'photo'} onClick=${() => changePhoto('camera')}>${dish.photoV ? 'Repetir foto' : 'Hacer foto'}</${Button}>` : null}
          ${canEdit ? html`<${Button} variant="ghost" icon="🖼️" onClick=${() => changePhoto('gallery')}>Desde galería</${Button}>` : null}
          ${canEdit ? html`<${Button} variant="ghost" icon="✏️" onClick=${onEdit}>Editar datos</${Button}>` : null}
          ${canDelete ? html`<${Button} variant="danger-ghost" icon="🗑️" onClick=${del}>Eliminar</${Button}>` : null}
        </div>
      </div>
    <//>`;
}

// ---------------------------------------------------------------------------
const NAME_IDEAS = [
  'Tosta de sobrasada y miel', 'Mini burger de rabo de toro', 'Gilda de la casa', 'Tortilla trufada',
  'Brocheta de langostinos', 'Croqueta de jamón', 'Pimiento relleno de bacalao', 'Txistorra con huevo de codorniz',
];

function DishForm({ ctx, open, onClose, editing: currentEditing }) {
  const { code, uid, players, backend, room } = ctx;
  const lastEditing = useRef(currentEditing);
  if (open) lastEditing.current = currentEditing;
  const editing = open ? currentEditing : lastEditing.current;
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [chefs, setChefs] = useState([uid]);
  const [other, setOther] = useState('');
  const [otherOn, setOtherOn] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState('');
  const [touched, setTouched] = useState(false);
  const idea = useMemo(() => NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)], [open]);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setBusy('');
    setPhoto(null);
    if (editing) {
      setName(editing.name || '');
      setDesc(editing.desc || '');
      setChefs(editing.chefUids || []);
      setOther(editing.chefOther || '');
      setOtherOn(!!editing.chefOther);
    } else {
      setName('');
      setDesc('');
      setChefs([uid]);
      setOther('');
      setOtherOn(false);
    }
  }, [open, editing?.id]);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => (a.id === uid ? -1 : b.id === uid ? 1 : (a.name || '').localeCompare(b.name || ''))),
    [players, uid],
  );
  const chefName = joinNames([
    ...sortedPlayers.filter((p) => chefs.includes(p.id)).map((p) => p.name),
    ...(otherOn && other.trim() ? [other.trim()] : []),
  ]);
  const preview = photo?.thumb || editing?.thumb || null;
  const valid = name.trim().length > 0;

  const toggleChef = (id) => {
    haptic(8);
    sound.play('tick');
    setChefs((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  };

  const choosePhoto = async (source) => {
    try {
      const set = source === 'camera'
        ? await takePhoto({ title: name ? `Foto · ${name}` : 'Foto del pincho' })
        : await pickPhoto({ capture: source === 'system' ? 'environment' : null });
      if (set) {
        setPhoto(set);
        sound.play('pop');
      }
    } catch (e) {
      toastError(e.message || 'No se ha podido usar esa foto');
    }
  };

  async function save(e) {
    e?.preventDefault();
    setTouched(true);
    if (!valid || busy) {
      haptic([30, 40, 30]);
      return;
    }
    setBusy(photo ? 'Subiendo foto…' : 'Guardando…');
    const data = {
      name: name.trim().slice(0, 60),
      desc: desc.trim().slice(0, 240),
      chefName: chefName.slice(0, 80),
      chefUids: chefs,
      chefOther: otherOn ? other.trim().slice(0, 40) : '',
    };
    try {
      if (editing) {
        const res = await backend.updateDish(code, editing.id, data, photo || null);
        if (photo) primePhoto(code, editing.id, res.photoV, photo.full);
        toast('Cambios guardados', { icon: '✅' });
      } else {
        const res = await backend.addDish(code, { ...data, photo });
        if (photo) primePhoto(code, res.id, res.photoV, photo.full);
        sound.play('success');
        burst({ fy: 0.85, count: 70, speed: 12, emojis: ['🍢', '🍤', '🧀', '🫒'] });
        toast(`¡${data.name} entra en el concurso!`, { icon: '🍢' });
      }
      onClose();
    } catch (err) {
      toastError(friendlyError(err));
      setBusy('');
    }
  }

  return html`
    <${Sheet} open=${open} onClose=${() => !busy && onClose()} title=${editing ? 'Editar pincho' : 'Nuevo pincho'} tall
      footer=${html`<${Button} size="lg" block loading=${!!busy} icon=${editing ? '💾' : '🍢'} onClick=${save}>
        ${busy || (editing ? 'Guardar cambios' : 'Añadir al concurso')}</${Button}>`}>
      <form class="dish-form" onSubmit=${save}>
        <div class=${cx('photo-zone', preview && 'has-photo')}>
          ${preview
            ? html`
              <div class="photo-preview">
                <img src=${preview} alt="Foto del pincho" />
                <div class="photo-preview-actions">
                  <button type="button" class="chip-btn" onClick=${() => choosePhoto('camera')}>📸 Repetir</button>
                  <button type="button" class="chip-btn" onClick=${() => choosePhoto('gallery')}>🖼️ Galería</button>
                </div>
              </div>`
            : html`
              <button type="button" class="photo-cta" onClick=${() => choosePhoto('camera')}>
                <span class="photo-cta-icon">📸</span>
                <span class="photo-cta-title">Hacer foto</span>
                <span class="photo-cta-sub">Al cocinero con su pincho</span>
              </button>
              <div class="photo-alt">
                <button type="button" class="chip-btn" onClick=${() => choosePhoto('gallery')}>🖼️ Galería</button>
                <button type="button" class="chip-btn" onClick=${() => choosePhoto('system')}>📱 Cámara del móvil</button>
              </div>`}
        </div>

        <${Field} label="Nombre del pincho" counter=${`${name.length}/60`}>
          <input class="input input-lg" value=${name} maxlength="60" placeholder=${`Ej.: ${idea}`}
            aria-invalid=${touched && !valid} onInput=${(e) => setName(e.currentTarget.value)} />
        </${Field}>
        ${touched && !valid ? html`<p class="form-error">Ponle nombre al pincho 😋</p>` : null}

        <div class="field">
          <span class="field-label">¿Quién lo ha cocinado?</span>
          <div class="chef-chips">
            ${sortedPlayers.map((p) => html`
              <button type="button" key=${p.id} class=${cx('chip-select', chefs.includes(p.id) && 'is-selected')}
                aria-pressed=${chefs.includes(p.id)} onClick=${() => toggleChef(p.id)}>
                <${Avatar} emoji=${p.avatar} name=${p.name} size=${22} ring=${false} />
                <span>${p.id === uid ? `${p.name} (yo)` : p.name}</span>
              </button>`)}
            <button type="button" class=${cx('chip-select', otherOn && 'is-selected')} aria-pressed=${otherOn}
              onClick=${() => { setOtherOn((v) => !v); haptic(8); }}>
              <span>＋ Otra persona</span>
            </button>
          </div>
          ${otherOn
            ? html`<input class="input" value=${other} maxlength="40" placeholder="Nombre de quien lo ha cocinado"
                onInput=${(e) => setOther(e.currentTarget.value)} />`
            : null}
          <span class="field-hint">
            ${room.settings?.allowSelfVote ? 'Quien lo haya cocinado aparecerá como autor.' : 'Quien lo haya cocinado no podrá votarlo.'}
          </span>
        </div>

        <${Field} label="Descripción (opcional)" counter=${`${desc.length}/240`}>
          <textarea class="input textarea" rows="3" maxlength="240" value=${desc}
            placeholder="Ingredientes, historia, nivel de picante…" onInput=${(e) => setDesc(e.currentTarget.value)}></textarea>
        </${Field}>
        <button type="submit" hidden></button>
      </form>
    <//>`;
}

// ---------------------------------------------------------------------------
export function PhotosSheet({ ctx, open, onClose }) {
  const { code, dishes, room } = ctx;
  const withPhoto = dishes.filter((d) => d.photoV);
  const [loaded, setLoaded] = useState(() => new Map());

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    withPhoto.forEach((d) => {
      getPhoto(code, d).then((src) => {
        if (alive && src) setLoaded((m) => new Map(m).set(d.id, src));
      });
    });
    return () => {
      alive = false;
    };
  }, [open, withPhoto.map((d) => `${d.id}:${d.photoV}`).join(',')]);

  const ready = withPhoto.filter((d) => loaded.has(d.id));
  const items = () => ready.map((d) => ({
    dataURL: loaded.get(d.id),
    name: `${String(d.num).padStart(2, '0')}-${slugify(d.name)}${d.chefName ? `-${slugify(d.chefName)}` : ''}.jpg`,
  }));

  const saveAll = async () => {
    if (!ready.length) return;
    const r = await saveImages(items(), { title: room.name, zipName: `${slugify(room.name)}-fotos.zip` });
    if (r === 'zipped') toast('Descargado un .zip con todas las fotos', { icon: '🗜️' });
    if (r === 'downloaded') toast('Foto descargada', { icon: '💾' });
  };

  const saveOne = (d) => {
    const src = loaded.get(d.id);
    if (!src) return;
    saveImages([{ dataURL: src, name: `${String(d.num).padStart(2, '0')}-${slugify(d.name)}.jpg` }], { title: d.name });
  };

  return html`
    <${Sheet} open=${open} onClose=${onClose} title="Fotos del concurso" tall
      footer=${html`<${Button} size="lg" block icon="💾" disabled=${!ready.length} onClick=${saveAll}>
        ${ready.length < withPhoto.length ? `Cargando ${ready.length}/${withPhoto.length}…` : `Guardar ${plural(ready.length, 'foto', 'fotos')}`}</${Button}>`}>
      ${withPhoto.length
        ? html`
          <p class="sheet-lead">Toca una foto para guardarla, o guárdalas todas de golpe.</p>
          <div class="photo-grid">
            ${withPhoto.map((d) => html`
              <button type="button" key=${d.id} class="photo-tile" onClick=${() => saveOne(d)} aria-label=${`Guardar foto de ${d.name}`}>
                <${DishImage} src=${loaded.get(d.id) || d.thumb} num=${d.num} alt=${d.name} />
                ${!loaded.has(d.id) ? html`<span class="photo-tile-loading"><${Spinner} size=${16} /></span>` : null}
                <span class="photo-tile-name">#${d.num} ${d.name}</span>
              </button>`)}
          </div>`
        : html`<${Empty} emoji="📷" title="Aún no hay fotos" text="Haz la foto de cada pincho desde su ficha." />`}
    <//>`;
}
