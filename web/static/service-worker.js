const CACHE_NAME = 'taskmaster-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/static/index.html',
  '/static/app.js',
  '/static/styles.css',
  '/static/manifest.json',
  '/static/icons/icon.svg',
  '/static/icons/icon-maskable.svg',
];
const STATIC_PATHS = new Set(STATIC_ASSETS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname === '/api/speech') {
    event.respondWith(handleSpeechUpload(request));
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (url.origin === self.location.origin && (STATIC_PATHS.has(url.pathname) || url.pathname.startsWith('/static/'))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function handleSpeechUpload(request) {
  try {
    return await fetch(request.clone());
  } catch (err) {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) =>
      client.postMessage({
        type: 'voice-upload-offline',
        meta: {
          mimeType: request.headers.get('content-type') || 'audio/webm',
        },
      }),
    );
    return new Response(JSON.stringify({ detail: 'Offline: voice clip not uploaded.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {});
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', { status: 503 });
  }
}
