// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

import { getConfig } from './config.js';
import { resolveAddress } from './geocoding.js';

// ==========================================
// API State Management
// ==========================================

export let refreshInterval = null;
export let countdownInterval = null;
export let secondsToRefresh = 10;
export let lastLocations = [];
export let ownerLocation = null;
export let sharedLocations = [];
export let isSharedMode = false;
export let shareToken = null;
export let sharedStyleUrl = null;

// ==========================================
// Retry Logic with Exponential Backoff
// ==========================================

export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);

            if (!response.ok) {
                // Only retry on server errors (5xx)
                if (response.status >= 500 && i < maxRetries - 1) {
                    const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                    console.warn(`Request failed with ${response.status}, retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            if (i === maxRetries - 1) {
                // Final attempt failed
                throw error;
            }

            // Network error or other exception - retry with backoff
            const delay = Math.pow(2, i) * 1000;
            console.warn(`Request failed (${error.message}), retrying in ${delay}ms (attempt ${i + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// ==========================================
// Owner Location Fetch
// ==========================================

async function fetchOwnerLocation(config) {
    if (!config.apiUserName) {
        ownerLocation = null;
        return;
    }

    try {
        const response = await fetchWithRetry(
            `${config.baseUrl}/api/v1/users/${encodeURIComponent(config.apiUserName)}/points/latest?api_key=${config.apiKey}`
        );
        if (response.ok) {
            const data = await response.json();
            if (data.point) {
                ownerLocation = {
                    email: 'OWNER',
                    latitude: data.point.latitude,
                    lon: data.point.longitude,
                    lat: data.point.latitude,
                    longitude: data.point.longitude,
                    battery: data.point.battery,
                    timestamp: data.point.timestamp,
                    address: null
                };
                if (config.fixedLat && config.fixedLon) {
                    ownerLocation.latitude = parseFloat(config.fixedLat);
                    ownerLocation.longitude = parseFloat(config.fixedLon);
                }
            } else {
                ownerLocation = null;
            }
        } else {
            ownerLocation = null;
        }
    } catch (error) {
        console.error('Owner location fetch error:', error);
        ownerLocation = null;
    }
}

// ==========================================
// Main Data Fetch
// ==========================================

export async function fetchData(updateUICallback, updateMapCallback, selectedMemberEmails, refreshStatusElement, lastUpdatedElement) {
    const config = getConfig();
    if (!config) return;

    secondsToRefresh = 10; // Reset countdown on actual fetch
    refreshStatusElement.classList.add('refreshing');

    try {
        // Start fetching owner location in parallel to save time
        const ownerFetchPromise = fetchOwnerLocation(config);

        // SECURITY NOTE: The Dawarich API currently requires API keys as URL query parameters.
        // This is not ideal from a security perspective (keys can be exposed in logs, browser history, etc.)
        // but is a limitation of the current Dawarich API design. When Dawarich supports header-based
        // authentication (e.g., Authorization: Bearer <token>), this should be updated.
        // See: https://github.com/Freika/dawarich/issues for API enhancement requests.
        const response = await fetchWithRetry(`${config.baseUrl}/api/v1/families/locations?api_key=${config.apiKey}`);
        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        lastLocations = data.locations || [];

        // Handle "ALL" selection now that we have data
        if (selectedMemberEmails.has('ALL')) {
            selectedMemberEmails.clear();
            lastLocations.forEach(loc => selectedMemberEmails.add(loc.email));
        }

        // Await owner location fetch to avoid race condition in UI update
        await ownerFetchPromise;

        // Resolve addresses
        if (ownerLocation) {
            ownerLocation.address = resolveAddress(ownerLocation);
        }
        lastLocations.forEach(m => {
            m.address = resolveAddress(m);
        });

        // Merge shared locations
        if (sharedLocations.length > 0) {
            data.locations = [...data.locations, ...sharedLocations];
        }

        updateUICallback(data);

        // Update map if callback provided
        if (updateMapCallback) {
            updateMapCallback();
        }

        lastUpdatedElement.innerText = `Last updated: ${new Date().toLocaleTimeString([], { hour12: false })}`;
    } catch (error) {
        console.error('Fetch error:', error);
        lastUpdatedElement.innerText = `Error: API failed`;
    } finally {
        refreshStatusElement.classList.remove('refreshing');
    }
}

// ==========================================
// Polling Management
// ==========================================

export function startTracking(fetchCallback) {
    stopTracking();

    // Immediate fetch
    fetchCallback();

    // Set up polling
    refreshInterval = setInterval(fetchCallback, 10000);

    // Countdown timer
    countdownInterval = setInterval(() => {
        secondsToRefresh--;
        if (secondsToRefresh <= 0) {
            secondsToRefresh = 10;
        }
        // UI update handled by caller
    }, 1000);
}

export function stopTracking() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// ==========================================
// Location Sharing API
// ==========================================

export async function shareLocation(email, duration) {
    const config = getConfig();
    if (!config) return null;

    try {
        const response = await fetchWithRetry(
            `${config.baseUrl}/api/shared/location`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: config.apiKey,
                    email: email,
                    duration: duration
                })
            }
        );

        if (response.ok) {
            return await response.json();
        } else {
            throw new Error(`Share failed: ${response.status}`);
        }
    } catch (error) {
        console.error('Share location error:', error);
        return null;
    }
}
