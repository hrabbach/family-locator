// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

// ==========================================
// Geocoding Queue and Address Resolution
// ==========================================

export let lastKnownAddresses = {}; // email -> address
export const addressCache = new Map(); // Key: "lat,lon" (fixed prec), Value: address string
export const geocodeQueue = [];
let geocodeProcessing = false;
const MAX_GEOCODE_QUEUE_SIZE = 50; // Prevent unbounded queue growth

// ==========================================
// Coordinate Key Generation
// ==========================================

export function getCoordinateKey(lat, lon) {
    // Use 4 decimal places (~11m precision) for caching
    return `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
}

// ==========================================
// Address Resolution
// ==========================================

export function resolveAddress(member) {
    // If member already has an address (e.g. from server), use it.
    if (member.address && member.address !== "Unknown Location") {
        const lat = member.latitude || member.lat;
        const lon = member.longitude || member.lon;
        if (lat && lon) {
            const key = getCoordinateKey(lat, lon);
            if (!addressCache.has(key)) {
                addressCache.set(key, member.address);
                lastKnownAddresses[member.email || 'OWNER'] = member.address;
            }
        }
        return member.address;
    }

    const config = window.familyTracker?.getConfig?.();
    if (!config || !config.geocodeEnabled) return null;

    const lat = member.latitude || member.lat;
    const lon = member.longitude || member.lon;
    const email = member.email || 'OWNER';

    if (!lat || !lon) return null;

    const key = getCoordinateKey(lat, lon);
    if (addressCache.has(key)) {
        const cached = addressCache.get(key);
        if (cached && cached !== "Unknown Location") {
            lastKnownAddresses[email] = cached;
            return cached;
        }
        if (cached === "Unknown Location") {
            delete lastKnownAddresses[email];
            return null;
        }
    }

    // Cache miss or pending: return last known if available
    enqueueGeocodeRequest(lat, lon, config);
    return lastKnownAddresses[email] || null;
}

// ==========================================
// Geocoding Queue Management
// ==========================================

export function enqueueGeocodeRequest(lat, lon, config) {
    // Ensure lat/lon are numbers
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    const key = getCoordinateKey(latitude, longitude);

    // Already cached
    if (addressCache.has(key)) {
        return;
    }

    // Check if already queued (deduplication)
    const alreadyQueued = geocodeQueue.some(task =>
        getCoordinateKey(task.lat, task.lon) === key
    );
    if (alreadyQueued) {
        return;
    }

    // Limit queue size - drop oldest items when full
    if (geocodeQueue.length >= MAX_GEOCODE_QUEUE_SIZE) {
        const dropped = geocodeQueue.shift();
        console.warn(`Geocode queue full (${MAX_GEOCODE_QUEUE_SIZE}), dropping oldest request for`,
            dropped.lat.toFixed(4), dropped.lon.toFixed(4));
    }

    addressCache.set(key, null); // Mark as pending
    geocodeQueue.push({ lat: latitude, lon: longitude, config });
    processGeocodeQueue();
}

// ==========================================
// Queue Processing
// ==========================================

export async function processGeocodeQueue() {
    if (geocodeProcessing) return;
    geocodeProcessing = true;

    while (geocodeQueue.length > 0) {
        const task = geocodeQueue.shift();
        await performGeocodeFetch(task.lat, task.lon, task.config);
        if (geocodeQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit
        }
    }
    geocodeProcessing = false;

    // Re-resolve addresses now that cache is updated
    // This will populate lastKnownAddresses with the newly geocoded values
    if (window.familyTracker?.lastLocations && window.familyTracker.lastLocations.length > 0) {
        window.familyTracker.lastLocations.forEach(m => {
            m.address = resolveAddress(m);
        });
    }
    if (window.familyTracker?.ownerLocation) {
        window.familyTracker.ownerLocation.address = resolveAddress(window.familyTracker.ownerLocation);
    }

    // Update UI to show the new addresses
    if (window.familyTracker?.updateUI) {
        window.familyTracker.updateUI({ locations: window.familyTracker.lastLocations });
    }
}

// ==========================================
// Geocoding API Call
// ==========================================

async function performGeocodeFetch(lat, lon, config) {
    const key = getCoordinateKey(lat, lon);
    // Note: addressCache.has(key) is true (null) because we set it in enqueue.

    try {
        const url = `${config.photonUrl}/reverse?lat=${lat}&lon=${lon}`;
        const headers = {};
        if (config.photonApiKey) {
            headers['X-API-KEY'] = config.photonApiKey;
        }

        const response = await fetch(url, { headers });
        if (response.ok) {
            const data = await response.json();
            if (data.features && data.features.length > 0) {
                const p = data.features[0].properties;
                // Construct a nice string: Name (if any), Street, City
                const parts = [];
                if (p.name) parts.push(p.name);
                if (p.street) {
                    let street = p.street;
                    if (p.housenumber) street += ` ${p.housenumber}`;
                    parts.push(street);
                } else if (p.housenumber) { // Fallback if street is missing but number exists (rare)
                    parts.push(p.housenumber);
                }

                // If no name and no street, maybe just city/country?
                if (parts.length === 0) {
                    if (p.city || p.town || p.village) parts.push(p.city || p.town || p.village);
                    else if (p.country) parts.push(p.country);
                } else {
                    // Add city context if we have street/name
                    if (p.city || p.town || p.village) parts.push(p.city || p.town || p.village);
                }

                const address = parts.join(', ');
                addressCache.set(key, address);
            } else {
                addressCache.set(key, "Unknown Location");
            }
        } else {
            addressCache.delete(key); // Retry next time
        }
    } catch (e) {
        console.error("Geocoding error", e);
        addressCache.delete(key); // Retry next time
    }

    // Manage cache size (simple LRU-ish: delete oldest if too big)
    if (addressCache.size > 200) {
        const firstKey = addressCache.keys().next().value;
        addressCache.delete(firstKey);
    }
}
