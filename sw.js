// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.
const CACHE_NAME = 'family-tracker-v2.5.0';
const ASSETS = [
    '/familytrack/',
    '/familytrack/index.html',
    '/familytrack/style.css?v=2.5.0',
    '/familytrack/app.js?v=2.5.0',
    '/familytrack/manifest.json?v=2.5.0',
    '/familytrack/icon.png?v=2.5.0'
];

self.addEventListener('install', event => {
    // Force this service worker to become the active service worker,
    // bypassing the "waiting" state.
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', event => {
    // Claim any clients immediately, so the page is controlled by the new SW
    // without a reload.
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(keys => {
                return Promise.all(
                    keys.map(key => {
                        if (key !== CACHE_NAME) {
                            return caches.delete(key);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
