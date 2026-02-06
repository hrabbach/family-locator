// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.
const CACHE_NAME = 'family-tracker-v2.9.0';
const ASSETS = [
    '/familytrack/',
    '/familytrack/index.html',
    '/familytrack/style.css?v=2.9.0',
    '/familytrack/app.js?v=2.9.0',
    '/familytrack/js/utils.js?v=2.9.0',
    '/familytrack/js/config.js?v=2.9.0',
    '/familytrack/js/geocoding.js?v=2.9.0',
    '/familytrack/js/api.js?v=2.9.0',
    '/familytrack/js/state.js?v=2.9.0',
    '/familytrack/js/ui.js?v=2.9.0',
    '/familytrack/js/map.js?v=2.9.0',
    '/familytrack/js/main.js?v=2.9.0',
    '/familytrack/manifest.json?v=2.9.0',
    '/familytrack/icon.png?v=2.9.0'
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
    const url = new URL(event.request.url);

    // Network-first for Dawarich API calls (location data changes frequently)
    // Excludes /api/share and /api/shared/location (our own API)
    if (url.pathname.includes('/api/v1/')) {
        event.respondWith(
            fetch(event.request)
                .catch(error => {
                    console.warn('API fetch failed, trying cache:', error);
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Cache-first for Photon geocoding API (coordinates->address unlikely to change)
    if (url.hostname.includes('photon') || url.hostname.includes('komoot.io')) {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    if (response) {
                        return response;
                    }
                    return fetch(event.request).then(response => {
                        // Cache successful geocoding responses
                        if (response.ok) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        }
                        return response;
                    });
                })
        );
        return;
    }

    // Cache-first for static assets (CSS, JS, images, etc.)
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
