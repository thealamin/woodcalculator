// IMPORTANT: change this name (v3, v4 …) every time you upload a new version,
// otherwise phones keep showing the old app from their cache.
var CACHE = 'gach-calc-v8';

var FILES = [
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/hind-siliguri-bengali-400-normal.woff2',
  './fonts/hind-siliguri-bengali-600-normal.woff2',
  './fonts/hind-siliguri-bengali-700-normal.woff2',
  './fonts/hind-siliguri-latin-400-normal.woff2',
  './fonts/hind-siliguri-latin-600-normal.woff2',
  './fonts/hind-siliguri-latin-700-normal.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(FILES); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                             .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // Opening the app (any page address) → always the cached app, works offline
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (r) {
        return r || fetch(req);
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  // Fonts, icons, manifest → cache first, then network
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (r) {
      return r || fetch(req);
    })
  );
});
