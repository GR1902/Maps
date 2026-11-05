/*
 * Service worker for Matchday Explorer: makes the app open and work without a
 * connection (schedule data, plans, lists, popups). What it deliberately does
 * NOT cache: map tiles, club logos, routing and geocoding requests. Those go
 * through the browser as usual, so offline the map background may stay blank,
 * routes fall back to straight-line estimates, and logos show only if the
 * browser still has them.
 *
 * Our own files use "network first": online you always get the newest app and
 * data, offline the last copy that was loaded. The Leaflet library comes from a
 * CDN with versioned URLs and is cached once ("cache first").
 *
 * Bump VERSION when this file's lists change; old caches are removed.
 */
const VERSION = 'v1';
const APP_CACHE = `matchday-app-${VERSION}`;
const LIB_CACHE = `matchday-libs-${VERSION}`;

const APP_FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/variables.css', 'css/spieltag-explorer.css', 'js/spieltag-explorer.js',
  'data/teams.json', 'data/fixtures.json', 'data/airports.json', 'data/leagues.json',
  'data/meta.json', 'data/scouts.json', 'data/changelog.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
const LIB_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
];
const NETWORK_TIMEOUT_MS = 6000; // on a bad connection, fall back to the cached copy instead of waiting

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    // one by one, so a single missing file (e.g. an optional data file) does not abort the install
    await Promise.all(APP_FILES.map(f => app.add(new Request(f, { cache: 'reload' })).catch(() => {})));
    const libs = await caches.open(LIB_CACHE);
    await Promise.all(LIB_FILES.map(u => libs.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, LIB_CACHE]);
    for(const key of await caches.keys()){
      if(key.startsWith('matchday-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(request).then(r => { clearTimeout(timer); resolve(r); }, e => { clearTimeout(timer); reject(e); });
  });
}

async function networkFirst(request){
  const cache = await caches.open(APP_CACHE);
  try{
    const response = await fetchWithTimeout(request);
    if(response && response.ok) cache.put(request, response.clone());
    return response;
  } catch(e){
    // ignoreSearch: a cache-busting "?v=3" must not defeat the offline copy
    const cached = await cache.match(request, { ignoreSearch: true });
    if(cached) return cached;
    if(request.mode === 'navigate'){
      const shell = await cache.match('index.html', { ignoreSearch: true }) || await cache.match('./', { ignoreSearch: true });
      if(shell) return shell;
    }
    throw e;
  }
}

async function cacheFirst(request){
  const cache = await caches.open(LIB_CACHE);
  const cached = await cache.match(request);
  if(cached) return cached;
  const response = await fetch(request);
  if(response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if(request.method !== 'GET') return;
  const url = new URL(request.url);
  if(url.origin === self.location.origin){
    event.respondWith(networkFirst(request));
  } else if(LIB_FILES.includes(request.url)){
    event.respondWith(cacheFirst(request));
  }
  // everything else (tiles, logos, routing, fonts) is left to the browser
});
