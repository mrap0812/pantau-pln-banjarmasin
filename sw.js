/* Service worker: situs tetap bisa dibuka saat sinyal/listrik padam.
   Data (JSON) diambil dari jaringan dulu, jatuh ke cache bila offline. */
const VERSI = 'pantau-pln-v5';
const INTI = ['./', 'index.html', 'assets/style.css', 'assets/app.js', 'assets/gim.js', 'assets/ikon.svg', 'config.json',
  'data/jadwal.json', 'data/kelompok.json', 'data/berita.json', 'data/geo/kelurahan.geojson', 'data/geo/jalan.geojson'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSI).then(c => c.addAll(INTI)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const data = /\.(json|geojson)$/.test(u.pathname) || u.pathname.endsWith('/') || u.pathname.endsWith('.html');
  e.respondWith(data
    ? fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSI).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request))
    : caches.match(e.request).then(h => h || fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSI).then(x => x.put(e.request, c)); } return r; })));
});
