// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

// ==========================================
// Configuration Management
// ==========================================

export const CONFIG_KEY = 'family_tracker_config';
export const NAMES_KEY = 'family_tracker_names';

let cachedConfig = null;

export function getConfig() {
    if (cachedConfig) return cachedConfig;
    const configStr = localStorage.getItem(CONFIG_KEY);
    cachedConfig = configStr ? JSON.parse(configStr) : null;
    return cachedConfig;
}

export function invalidateConfig() {
    cachedConfig = null;
}

// ==========================================
// Input Validation Functions
// ==========================================

export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') {
        throw new Error('URL is required and must be a string');
    }

    const trimmed = url.trim();
    if (trimmed.length === 0) {
        throw new Error('URL cannot be empty');
    }

    try {
        const parsed = new URL(trimmed);

        // Only allow http and https protocols
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new Error('Only HTTP and HTTPS protocols are allowed');
        }

        // Validate hostname exists
        if (!parsed.hostname || parsed.hostname.length === 0) {
            throw new Error('Invalid hostname');
        }

        return parsed.toString().replace(/\/$/, ''); // Remove trailing slash
    } catch (e) {
        if (e.message.includes('Invalid URL')) {
            throw new Error('Invalid URL format');
        }
        throw e;
    }
}

export function validateApiKey(key) {
    if (!key || typeof key !== 'string') {
        throw new Error('API key is required');
    }

    const trimmed = key.trim();

    // Check length (typical API keys are 20-256 characters)
    if (trimmed.length < 20) {
        throw new Error('API key is too short (minimum 20 characters)');
    }

    if (trimmed.length > 256) {
        throw new Error('API key is too long (maximum 256 characters)');
    }

    // Allow alphanumeric, hyphens, underscores, and dots (common in API keys)
    if (!/^[a-zA-Z0-9_.\-]+$/.test(trimmed)) {
        throw new Error('API key contains invalid characters');
    }

    return trimmed;
}

export function validateCoordinates(lat, lon) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
        throw new Error('Coordinates must be valid numbers');
    }

    if (latitude < -90 || latitude > 90) {
        throw new Error('Latitude must be between -90 and 90');
    }

    if (longitude < -180 || longitude > 180) {
        throw new Error('Longitude must be between -180 and 180');
    }

    return { lat: latitude, lon: longitude };
}

export function validateName(name) {
    if (!name) return ''; // Name is optional

    const trimmed = String(name).trim();

    // Limit length to prevent abuse
    if (trimmed.length > 100) {
        throw new Error('Name is too long (maximum 100 characters)');
    }

    return trimmed;
}

// ==========================================
// URL Configuration Processing
// ==========================================

export function processUrlConfiguration() {
    const urlParams = new URLSearchParams(window.location.search);
    const bulkConfig = urlParams.get('config');
    let updated = false;

    // 1. Process Bulk Config (Base64)
    if (bulkConfig) {
        try {
            const decoded = JSON.parse(atob(bulkConfig));
            if (decoded.config) {
                localStorage.setItem(CONFIG_KEY, JSON.stringify(decoded.config));
                updated = true;
            }
            if (decoded.names) {
                localStorage.setItem(NAMES_KEY, JSON.stringify(decoded.names));
                updated = true;
            }
        } catch (e) {
            console.error("Failed to parse bulk config from URL", e);
        }
    }

    // 2. Process Individual Params
    const server = urlParams.get('server');
    const key = urlParams.get('key');
    const name = urlParams.get('name');
    const engine = urlParams.get('engine');
    const mapStyle = urlParams.get('style');
    const geocode = urlParams.get('geocode');
    const photon = urlParams.get('photon');
    const photonKey = urlParams.get('photonKey');
    const awake = urlParams.get('awake');
    const lat = urlParams.get('lat');
    const lon = urlParams.get('lon');
    const namesParam = urlParams.get('names'); // email:name;email:name

    if (server || key || name || engine || mapStyle || geocode || photon || photonKey || awake || lat || lon) {
        const config = getConfig() || {};

        try {
            // Validate and sanitize inputs
            if (server) {
                config.baseUrl = sanitizeUrl(server);
            }

            if (key) {
                config.apiKey = validateApiKey(key);
            }

            if (name) {
                config.apiUserName = validateName(name);
            }

            if (engine && (engine === 'maplibre' || engine === 'leaflet')) {
                config.mapEngine = engine;
            }

            if (mapStyle) {
                try {
                    config.mapStyleUrl = sanitizeUrl(mapStyle);
                } catch (e) {
                    // Allow relative paths
                    if (!mapStyle.includes('://')) {
                        config.mapStyleUrl = mapStyle;
                    }
                }
            }

            if (geocode === 'true' || geocode === 'false') {
                config.geocodeEnabled = geocode === 'true';
            }

            if (photon) {
                config.photonUrl = sanitizeUrl(photon);
            }

            if (photonKey && typeof photonKey === 'string') {
                config.photonApiKey = photonKey.trim();
            }

            if (awake === 'true' || awake === 'false') {
                config.keepAwakeEnabled = awake === 'true';
            }

            if (lat && lon) {
                const coords = validateCoordinates(lat, lon);
                config.fixedLat = coords.lat.toString();
                config.fixedLon = coords.lon.toString();
            }

            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            invalidateConfig();
            updated = true;

        } catch (error) {
            console.error('URL parameter validation error:', error);
            // Don't update config if validation fails
        }
    }

    if (namesParam) {
        try {
            const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
            const pairs = namesParam.split(';');
            pairs.forEach(pair => {
                const [email, n] = pair.split(':');
                if (email && n) {
                    // Basic email validation
                    const trimmedEmail = email.trim();
                    const trimmedName = validateName(n);

                    if (trimmedEmail.length > 0 && trimmedName.length > 0) {
                        names[trimmedEmail] = trimmedName;
                    }
                }
            });
            localStorage.setItem(NAMES_KEY, JSON.stringify(names));
            updated = true;
        } catch (error) {
            console.error('Names parameter validation error:', error);
        }
    }

    // Clear sensitive params from URL without reload
    if (updated) {
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

// ==========================================
// Config URL Generation
// ==========================================

export function generateConfigUrl() {
    const config = getConfig();
    const names = JSON.parse(localStorage.getItem(NAMES_KEY));

    if (!config) return null;

    const exportData = { config, names };
    const base64 = btoa(JSON.stringify(exportData));
    return `${window.location.origin}${window.location.pathname}?config=${base64}`;
}

export async function copyConfigUrl(shareStatusElement) {
    const url = generateConfigUrl();
    if (!url) {
        alert("No configuration to share. Please set up the app first.");
        return;
    }

    try {
        await navigator.clipboard.writeText(url);
        shareStatusElement.style.opacity = '1';
        setTimeout(() => {
            shareStatusElement.style.opacity = '0';
        }, 2000);
    } catch (err) {
        console.error("Failed to copy URL", err);
        // Fallback for non-secure contexts or some mobile browsers
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);

        shareStatusElement.style.opacity = '1';
        setTimeout(() => {
            shareStatusElement.style.opacity = '0';
        }, 2000);
    }
}
