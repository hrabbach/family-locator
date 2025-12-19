const CACHE_NAME = 'family-tracker-v1.1.6';
const ASSETS = [
    '/familytrack/',
    '/familytrack/index.html',
    '/familytrack/style.css?v=1.1.6',
    '/familytrack/app.js?v=1.1.6',
    '/familytrack/manifest.json?v=1.1.6',
    '/familytrack/icon.png?v=1.1.6'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
