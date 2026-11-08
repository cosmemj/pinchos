// Procesado de fotos: recorte, compresión JPEG, guardado/compartir y ZIP sin dependencias.

const FULL_MAX_SIDE = 1280;
const FULL_MAX_CHARS = 880_000; // < 1 MiB por documento de Firestore
const THUMB_MAX_SIDE = 480;
const THUMB_MAX_CHARS = 95_000;

function sizeOf(src) {
  return {
    w: src.videoWidth || src.naturalWidth || src.width,
    h: src.videoHeight || src.naturalHeight || src.height,
  };
}

/** Dibuja `src` (imagen, vídeo, canvas o ImageBitmap) en un canvas escalado y opcionalmente recortado. */
export function drawToCanvas(src, { maxSide = FULL_MAX_SIDE, crop = 0, mirror = false } = {}) {
  const { w, h } = sizeOf(src);
  if (!w || !h) throw new Error('La imagen está vacía');
  let sx = 0;
  let sy = 0;
  let sw = w;
  let sh = h;
  if (crop) {
    if (w / h > crop) {
      sw = Math.round(h * crop);
      sx = Math.round((w - sw) / 2);
    } else {
      sh = Math.round(w / crop);
      sy = Math.round((h - sh) / 2);
    }
  }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
  return c;
}

function toJpeg(canvas, maxChars, q = 0.86) {
  let quality = q;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > maxChars && quality > 0.45) {
    quality -= 0.08;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url;
}

/** Genera la foto completa y la miniatura a partir de cualquier fuente. */
export function makePhotoSet(src, opts = {}) {
  let full = drawToCanvas(src, { maxSide: FULL_MAX_SIDE, ...opts });
  let fullURL = toJpeg(full, FULL_MAX_CHARS);
  if (fullURL.length > FULL_MAX_CHARS) {
    full = drawToCanvas(full, { maxSide: 960 });
    fullURL = toJpeg(full, FULL_MAX_CHARS, 0.8);
  }
  const thumb = drawToCanvas(full, { maxSide: THUMB_MAX_SIDE });
  const thumbURL = toJpeg(thumb, THUMB_MAX_CHARS, 0.76);
  return { full: fullURL, thumb: thumbURL };
}

/** Lee un File de imagen respetando la orientación EXIF. */
export async function loadImageFile(file) {
  if (!file) throw new Error('No hay imagen');
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* Safari antiguo: probamos con <img> */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se ha podido leer la imagen. Prueba con otra (JPG o PNG).'));
    };
    img.src = url;
  });
}

export async function fileToPhotoSet(file) {
  const src = await loadImageFile(file);
  return makePhotoSet(src);
}

/** Abre el selector de archivos (galería o cámara del sistema). Debe llamarse dentro de un gesto. */
export function pickImageFile({ capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', capture);
    input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(input);
    let done = false;
    const finish = (f) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] || null));
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

// ---------- guardar / compartir ----------
export function dataURLToBytes(url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function dataURLToFile(url, name) {
  const mime = (url.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg';
  return new File([dataURLToBytes(url)], name, { type: mime });
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

const isTouchDevice = () => matchMedia('(pointer: coarse)').matches;

/**
 * Guarda fotos: en móvil abre la hoja de compartir (→ "Guardar imagen"), en ordenador descarga.
 * items: [{ dataURL, name }]. Llamar de forma síncrona dentro del gesto (sin awaits previos).
 */
export async function saveImages(items, { title = 'Fotos Pincho de Oro', zipName = 'pinchos.zip' } = {}) {
  const files = items.map((it) => dataURLToFile(it.dataURL, it.name));
  if (isTouchDevice() && navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  if (files.length === 1) {
    downloadBlob(files[0], files[0].name);
    return 'downloaded';
  }
  const zip = zipFiles(items.map((it) => ({ name: it.name, data: dataURLToBytes(it.dataURL) })));
  downloadBlob(zip, zipName);
  return 'zipped';
}

// ---------- ZIP (método "store": las JPEG ya van comprimidas) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipFiles(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // nombres en UTF-8
    lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(lh.buffer, name, f.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, b) => s + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);
  return new Blob([...chunks, ...central, end.buffer], { type: 'application/zip' });
}
