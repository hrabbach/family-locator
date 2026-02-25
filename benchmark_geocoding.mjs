import { enqueueGeocodeRequest, processGeocodeQueue, addressCache } from './js/geocoding.js';

// Polyfills
if (!global.window) {
    global.window = {};
}

// Mock fetch
global.fetch = async (url) => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
        ok: true,
        json: async () => ({
            features: [{
                properties: {
                    name: "Mock Place",
                    city: "Mock City",
                    country: "Mock Country"
                }
            }]
        })
    };
};

async function runBenchmark() {
    console.log("Starting benchmark...");

    // Clear cache
    addressCache.clear();

    // Mock updateUI to track calls
    const updateUICalls = [];

    global.window.familyTracker = {
        getConfig: () => ({
            geocodeEnabled: true,
            photonUrl: 'http://mock-api.com',
            photonApiKey: ''
        }),
        lastLocations: [], // Will be populated
        ownerLocation: null,
        updateUI: () => {
            updateUICalls.push(Date.now());
        }
    };

    // Setup locations
    const locations = [
        { lat: 10, lon: 10, email: 'user1' },
        { lat: 10, lon: 11, email: 'user2' },
        { lat: 10, lon: 12, email: 'user3' },
        { lat: 10, lon: 13, email: 'user4' },
        { lat: 10, lon: 14, email: 'user5' },
    ];

    window.familyTracker.lastLocations = locations;

    const startTime = Date.now();

    // Enqueue requests
    // Note: enqueueGeocodeRequest calls processGeocodeQueue, which is async.
    // We want to wait for ALL processing to complete.
    // However, enqueue returns void.
    // We can rely on the fact that processGeocodeQueue is exported and we can await it
    // if we call it manually, but the internal one is already running.
    // So we need a way to wait.

    // Actually, since processGeocodeQueue is async, calling it again while running
    // will return immediately due to the check: if (geocodeProcessing) return;

    // So we can't easily await the internal process.
    // Workaround: We can poll geocodeQueue length or just wait enough time.
    // Better: Monitor addressCache size or updateUICalls length.

    for (const loc of locations) {
        enqueueGeocodeRequest(loc.lat, loc.lon, window.familyTracker.getConfig());
    }

    // Wait until 5 updates happen or timeout
    // In current implementation, only 1 update happens at the end.
    // So we wait until queue is empty + some buffer.

    await new Promise(resolve => {
        const interval = setInterval(() => {
            // Check if queue is empty
            // We can't access queue length directly easily as it is exported but we need to import it.
            // Oh, it IS exported.

            // Re-import to get queue reference if needed? No, module exports are live bindings.
            // Let's import geocodeQueue
            import('./js/geocoding.js').then(module => {
                 if (module.geocodeQueue.length === 0) {
                     // Give it a bit more time for the last updateUI
                     setTimeout(() => {
                        clearInterval(interval);
                        resolve();
                     }, 500);
                 }
            });
        }, 100);
    });

    const endTime = Date.now();

    console.log("Benchmark finished.");
    console.log("Number of updateUI calls: " + updateUICalls.length);

    if (updateUICalls.length > 0) {
        const firstCall = updateUICalls[0] - startTime;
        const lastCall = updateUICalls[updateUICalls.length - 1] - startTime;
        console.log("First updateUI call after: " + firstCall + "ms");
        console.log("Last updateUI call after: " + lastCall + "ms");
    } else {
        console.log("No updateUI calls made.");
    }
}

runBenchmark();
