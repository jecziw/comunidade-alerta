const CACHE = 'ca-v2';
const ASSETS = [
  './',
  './comunidade-alerta.html',
  './manifest.json',
  './icon-192.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&family=Instrument+Serif:ital@0;1&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('basemaps.cartocdn.com') || e.request.url.includes('tile')) {
    // Tiles: network first, cache fallback
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE + '-tiles').then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // App shell: cache first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(
    data.title || '⚠️ Novo Alerta — Comunidade Alerta',
    {
      body:    data.body || 'Novo incidente registrado na sua região',
      icon:    './icon-192.svg',
      badge:   './icon-192.svg',
      tag:     data.id || 'alert',
      vibrate: [200, 100, 200],
      data:    { url: data.url || './' },
      actions: [
        { action: 'view',    title: 'Ver no mapa' },
        { action: 'dismiss', title: 'Fechar'      },
      ]
    }
  ));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'view' || !e.action) {
    e.waitUntil(clients.openWindow(e.notification.data.url || './'));
  }
});
