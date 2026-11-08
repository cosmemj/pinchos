// Service worker: red primero (siempre la última versión) con copia en caché para abrir sin conexión.
const CACHE = 'pincho-de-oro-v1';
const SHELL = ['./', './index.html', './css/app.css', './js/main.js', './manifest.webmanifest', './img/icon.svg'];
const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fuentes y SDK de Firebase (versionados): caché primero.
  if (STATIC_HOSTS.includes(url.hostname)) {
    if (url.pathname.includes('/google.firestore') || url.pathname.includes('/identitytoolkit')) return;
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // Firestore, Auth… directo a la red

  // Archivos de la app: red primero, caché si no hay conexión.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
