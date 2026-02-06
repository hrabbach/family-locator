// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.
const CONFIG_KEY = 'family_tracker_config';
const NAMES_KEY = 'family_tracker_names';

let cachedConfig = null;

function getConfig() {
    if (cachedConfig) return cachedConfig;
    const configStr = localStorage.getItem(CONFIG_KEY);
    cachedConfig = configStr ? JSON.parse(configStr) : null;
    return cachedConfig;
}

function invalidateConfig() {
    cachedConfig = null;
}

// CDN Constants
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';

let engineLoadPromise = null;
let currentLoadedEngine = null;

function loadCSS(href, integrity) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    if (integrity) {
        link.integrity = integrity;
        link.crossOrigin = "";
    }
    document.head.appendChild(link);
}

function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        if (integrity) {
            script.integrity = integrity;
            script.crossOrigin = "";
        } else {
            script.crossOrigin = "";
        }
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function loadMapEngine(engine) {
    if (engineLoadPromise && currentLoadedEngine === engine) return engineLoadPromise;

    currentLoadedEngine = engine;

    if (engine === 'leaflet') {
        loadCSS(LEAFLET_CSS, LEAFLET_CSS_SRI);
        engineLoadPromise = loadScript(LEAFLET_JS, LEAFLET_JS_SRI);
    } else {
        loadCSS(MAPLIBRE_CSS);
        engineLoadPromise = loadScript(MAPLIBRE_JS);
    }
    return engineLoadPromise;
}

let refreshInterval;
let countdownInterval;
let secondsToRefresh = 10;

const elements = {
    // Views
    configView: document.getElementById('configView'),
    dashboardView: document.getElementById('dashboardView'),
    mapView: document.getElementById('mapView'),
    qrReaderContainer: document.getElementById('qrReaderContainer'),

    // Config Inputs
    baseUrlInput: document.getElementById('baseUrl'),
    apiKeyInput: document.getElementById('apiKey'),
    apiUserNameInput: document.getElementById('apiUserName'),
    mapEngineInput: document.getElementById('mapEngine'),
    mapStyleUrlInput: document.getElementById('mapStyleUrl'),
    mapStyleGroup: document.getElementById('mapStyleGroup'),
    geocodeEnabled: document.getElementById('geocodeEnabled'),
    geocodeSettings: document.getElementById('geocodeSettings'),
    photonUrl: document.getElementById('photonUrl'),
    photonApiKey: document.getElementById('photonApiKey'),
    keepAwakeEnabled: document.getElementById('keepAwakeEnabled'),
    stationaryEnabled: document.getElementById('stationaryEnabled'),
    stationarySettings: document.getElementById('stationarySettings'),
    fixedLat: document.getElementById('fixedLat'),
    fixedLon: document.getElementById('fixedLon'),

    // Buttons
    saveBtn: document.getElementById('saveConfig'),
    logoutBtn: document.getElementById('logoutBtn'),
    scanQrBtn: document.getElementById('scanQrBtn'),
    stopScanBtn: document.getElementById('stopScanBtn'),
    viewSelectedBtn: document.getElementById('viewSelectedBtn'),
    shareConfigBtn: document.getElementById('shareConfigBtn'),
    shareStatus: document.getElementById('shareStatus'),

    // Dashboard
    membersList: document.getElementById('membersList'),
    lastUpdated: document.getElementById('lastUpdated'),
    refreshStatus: document.getElementById('refreshStatus'),

    // Map specific
    mapContainer: document.getElementById('mapContainer'),
    mapUserName: document.getElementById('mapUserName'),
    mapUserEmail: document.getElementById('mapUserEmail'),
    mapBattery: document.getElementById('mapBattery'),
    mapLastSeen: document.getElementById('mapLastSeen'),
    mapLastRefresh: document.getElementById('mapLastRefresh'),
    toggleProximity: document.getElementById('toggleProximity'),
    distanceBadge: document.getElementById('distanceBadge'),

    // Modal
    modal: document.getElementById('modalBackdrop'),
    modalEmail: document.getElementById('modalEmail'),
    modalInput: document.getElementById('newNameInput'),
    modalSaveBtn: document.getElementById('saveModal'),
    modalCancelBtn: document.getElementById('cancelModal'),

    // Share Modal
    shareLocationBtn: document.getElementById('shareLocationBtn'),
    shareModal: document.getElementById('shareModalBackdrop'),
    closeShareModal: document.getElementById('closeShareModal'),
    generateShareLinkBtn: document.getElementById('generateShareLinkBtn'),
    generatedLinkContainer: document.getElementById('generatedLinkContainer'),
    shareLinkInput: document.getElementById('shareLinkInput'),
    copyShareLinkBtn: document.getElementById('copyShareLinkBtn'),
    durationBtns: document.querySelectorAll('.duration-btn'),
};

let currentEditingEmail = null;
let isSharedMode = false;
let shareToken = null;
let sharedLocations = []; // Store shared members separately for merging
let sharedStyleUrl = null; // Store style from token
let sharedExpiresAt = null; // Expiration timestamp (ms)
let serverConfigured = false;
let html5QrCode = null;
let map = null;
let memberMarkers = {}; // Object to store markers by email
let selectedMemberEmails = new Set();
let showOwnerLocation = false;
let ownerLocation = null;
let ownerMarker = null;
let userMarker = null;
let userLocation = null;
let proximityEnabled = false;
let watchId = null;
let lastLocations = [];
let isAutoCenterEnabled = true;
let isMapOverlayCollapsed = false;
let lastKnownAddresses = {}; // email -> address
const addressCache = new Map(); // Key: "lat,lon" (fixed prec), Value: address string
const geocodeQueue = [];
let geocodeProcessing = false;
const MAX_GEOCODE_QUEUE_SIZE = 50; // Prevent unbounded queue growth
let wakeLock = null;

const MEMBER_COLORS = [
    { name: 'blue', hex: '#2A81CB', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png' },
    { name: 'red', hex: '#CB2B3E', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png' },
    { name: 'green', hex: '#2AAD27', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png' },
    { name: 'orange', hex: '#CB8427', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png' },
    { name: 'yellow', hex: '#CAC428', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png' },
    { name: 'violet', hex: '#9C2BCB', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png' },
    { name: 'grey', hex: '#7B7B7B', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png' },
    { name: 'black', hex: '#3D3D3D', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png' },
    { name: 'cyan', hex: '#1abc9c', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png' }, // Fallback icon
    { name: 'indigo', hex: '#3f51b5', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png' } // Fallback icon
];

const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
};
const HTML_ESCAPE_REGEX = /[&<>"']/g;

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_MAP[match]);
}

// Security: Input Validation Functions
function sanitizeUrl(url) {
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

function validateApiKey(key) {
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

function validateCoordinates(lat, lon) {
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

function validateName(name) {
    if (!name) return ''; // Name is optional

    const trimmed = String(name).trim();

    // Limit length to prevent abuse
    if (trimmed.length > 100) {
        throw new Error('Name is too long (maximum 100 characters)');
    }

    return trimmed;
}

// Wake Lock Logic
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (wakeLock !== null && !wakeLock.released) {
        return;
    }
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock released');
        });
        console.log('Wake Lock acquired');
    } catch (err) {
        console.error(`Wake Lock error: ${err.name}, ${err.message}`);
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        try {
            await wakeLock.release();
            wakeLock = null;
        } catch (e) {
            console.error('Wake Lock release error', e);
        }
    }
}

// Geocoding Logic
function getCoordinateKey(lat, lon) {
    // Round to 4 decimal places (~11 meters) to group nearby points
    return `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;
}

function resolveAddress(member) {
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

    const config = getConfig();
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

function enqueueGeocodeRequest(lat, lon, config) {
    const key = getCoordinateKey(lat, lon);

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
    geocodeQueue.push({ lat, lon, config });
    processGeocodeQueue();
}

// Error Recovery: Retry failed fetches with exponential backoff
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
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


async function processGeocodeQueue() {
    if (isGeocoding) return;
    isGeocoding = true;

    while (geocodeQueue.length > 0) {
        const task = geocodeQueue.shift();
        await performGeocodeFetch(task.lat, task.lon, task.config);
        if (geocodeQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit
        }
    }
    isGeocoding = false;
}

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

function getMemberColorByIndex(index) {
    if (index < 0) return MEMBER_COLORS[0];
    return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

function getMemberColor(email, locations) {
    if (!email || !locations) return MEMBER_COLORS[0];
    const index = locations.findIndex(m => m.email === email);
    return getMemberColorByIndex(index);
}

function processUrlConfiguration() {
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

function generateConfigUrl() {
    const config = getConfig();
    const names = JSON.parse(localStorage.getItem(NAMES_KEY));

    if (!config) return null;

    const exportData = { config, names };
    const base64 = btoa(JSON.stringify(exportData));
    return `${window.location.origin}${window.location.pathname}?config=${base64}`;
}

async function copyConfigUrl() {
    const url = generateConfigUrl();
    if (!url) {
        alert("No configuration to share. Please set up the app first.");
        return;
    }

    try {
        await navigator.clipboard.writeText(url);
        elements.shareStatus.style.opacity = '1';
        setTimeout(() => {
            elements.shareStatus.style.opacity = '0';
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

        elements.shareStatus.style.opacity = '1';
        setTimeout(() => {
            elements.shareStatus.style.opacity = '0';
        }, 2000);
    }
}

// Initialize
function init() {
    registerServiceWorker();
    setupEventListeners();

    // Preload Map Engine based on existing config or default
    const preConfig = getConfig();
    const preEngine = (preConfig && preConfig.mapEngine) ? preConfig.mapEngine : 'maplibre';
    loadMapEngine(preEngine);

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    // Shared Mode Entry Point
    if (token) {
        const config = getConfig();
        if (config && config.baseUrl && config.apiKey) {
            // User has their own config, merge the shared location
            initMergeMode(token);
        } else {
            // User is a guest, show only shared location
            initSharedMode(token);
            return;
        }
    }

    checkServerStatus();

    const emailsParam = urlParams.get('emails');
    const showOwnerParam = urlParams.get('show_owner');
    const collapsedParam = urlParams.get('collapsed');

    processUrlConfiguration();

    if (showOwnerParam === 'true') {
        showOwnerLocation = true;
    }

    if (collapsedParam === 'true') {
        isMapOverlayCollapsed = true;
    }

    if (emailsParam) {
        if (emailsParam === 'all') {
            // We can't select all yet because we don't have the data, 
            // but we can set a flag or handle it after fetch.
            // For now, let's just mark a flag.
            selectedMemberEmails.add('ALL');
        } else {
            const emails = emailsParam.split(',').map(e => e.trim());
            emails.forEach(e => selectedMemberEmails.add(e));
        }
    }

    const config = getConfig();
    if (config && config.baseUrl && config.apiKey) {
        showDashboard();
        startTracking();
        startUserTracking();

        // If we have URL params, switch to map immediately after a short delay to allow fetch
        if (selectedMemberEmails.size > 0 || showOwnerLocation) {
            // We need data first, so we rely on fetchData callback or similar?
            // Or just switch view and let the map update when data comes in.
            elements.mapView.classList.add('active');
            elements.dashboardView.classList.remove('active');
        }
    } else {
        showConfig();
    }
}

async function checkServerStatus() {
    try {
        // Adjust path if needed. We assume app is at /familytrack/
        // and api is at /familytrack/api/
        const apiPath = window.location.pathname.replace('index.html', '').replace(/\/$/, "") + '/api/status';
        const response = await fetch(apiPath);
        if (response.ok) {
            const data = await response.json();
            if (data.configured) {
                serverConfigured = true;
                const config = getConfig() || {};
                const isStationaryMode = config.fixedLat && config.fixedLon;
                if (elements.shareLocationBtn) {
                    elements.shareLocationBtn.style.display = (!isStationaryMode) ? 'flex' : 'none';
                }
            }
        }
    } catch (e) {
        // Server component not installed or not reachable
        console.log("Server component not detected.");
    }
}

function initMergeMode(token) {
    console.log("Entering Shared Merge Mode");
    shareToken = token;

    // Start normal tracking will happen in main init flow
    // We just need to start polling the shared data
    setInterval(fetchSharedData, 10000);
    fetchSharedData(); // Initial fetch

    // We don't hide UI, allowing user to see their own dashboard + shared member
}

function initSharedMode(token) {
    isSharedMode = true;
    shareToken = token;

    // Hide UI
    elements.configView.classList.remove('active');
    elements.dashboardView.classList.remove('active');
    elements.mapView.classList.add('active');

    // Force Keep Awake
    requestWakeLock();

    // Setup Map Config Defaults if missing
    // We do NOT set style here anymore, we wait for fetchSharedData
    if (!getConfig()) {
        // Set defaults for map engine
        const tempConfig = {
            mapEngine: 'maplibre',
            mapStyleUrl: './style.json', // Will be overridden by sharedStyleUrl
            geocodeEnabled: true,
            photonUrl: 'https://photon.komoot.io'
        };
        localStorage.setItem(CONFIG_KEY, JSON.stringify(tempConfig));
        invalidateConfig();
    }

    // Start Polling
    fetchSharedData();
    clearInterval(refreshInterval);
    refreshInterval = setInterval(fetchSharedData, 10000);

    // Countdown
    clearInterval(countdownInterval);
    secondsToRefresh = 10;
    countdownInterval = setInterval(updateCountdown, 1000);
}

async function fetchSharedData() {
    try {
        if (isSharedMode) secondsToRefresh = 10;

        const apiPath = window.location.pathname.replace('index.html', '').replace(/\/$/, "") + '/api/shared/location';
        const response = await fetch(`${apiPath}?token=${shareToken}`);

        if (response.status === 410) {
            if (isSharedMode) {
                alert("This sharing link has expired.");
                clearInterval(refreshInterval);
                window.location.href = window.location.pathname;
            } else {
                console.log("Shared link expired");
                sharedLocations = [];
            }
            return;
        }

        if (!response.ok) throw new Error("Failed to fetch shared location");

        const data = await response.json();
        if (!data.email) data.email = 'SHARED_USER';

        // Mark as shared for UI distinction if needed
        data.isShared = true;

        sharedLocations = [data];

        // Resolve address
        data.address = resolveAddress(data);

        // Handle Shared Style
        if (data.styleUrl && data.styleUrl !== sharedStyleUrl) {
            sharedStyleUrl = data.styleUrl;
            // Force map reset/update to apply style
            if (map) {
                updateMapMarkers();
            }
        }

        if (data.expires_at) {
            sharedExpiresAt = data.expires_at * 1000; // API returns seconds
        }

        if (isSharedMode) {
            // View Only Mode: Replace everything
            lastLocations = [data];
            selectedMemberEmails.add(data.email);
            if (elements.mapView.classList.contains('active')) {
                updateMapMarkers();
            }
        } else {
            // Merge Mode: Update UI if dashboard is active or map is active
            // We need to merge with existing lastLocations
            // But lastLocations is overwritten by main fetchData.
            // We should just trigger a UI update combining them.
            // Note: This might cause a blip if main fetch hasn't run yet.

            // To be safe, we rely on the main loop to merge,
            // BUT if we just got new data, we should probably force update?
            // Let's force update if we have main data.
            if (lastLocations.length > 0 || ownerLocation) {
                const combined = {
                    locations: [...lastLocations, ...sharedLocations]
                };
                // We don't want to overwrite lastLocations global permanently with duplicates?
                // Actually updateUI takes 'data' arg.
                if (elements.dashboardView.classList.contains('active')) {
                    updateUI(combined);
                }
                if (elements.mapView.classList.contains('active')) {
                    // updateMapMarkers reads global 'lastLocations'.
                    // We need to temporarily patch it or update the logic there.
                    // A cleaner way is to make 'lastLocations' a getter? No.
                    // Let's just append to lastLocations strictly for the view?
                    // No, that grows it indefinitely.

                    // Solution: updateMapMarkers should read (lastLocations + sharedLocations)
                    // But I can't easily change updateMapMarkers signature everywhere.
                    // I will modify updateMapMarkers to look at sharedLocations global.
                    updateMapMarkers();
                }
            }
        }

    } catch (e) {
        console.error("Shared fetch error", e);
    }
}

function showConfig() {
    const config = getConfig() || {};
    elements.baseUrlInput.value = config.baseUrl || '';
    elements.apiKeyInput.value = config.apiKey || '';
    elements.apiUserNameInput.value = config.apiUserName || '';
    elements.mapEngineInput.value = config.mapEngine || 'maplibre';
    elements.mapStyleUrlInput.value = config.mapStyleUrl || './style.json';

    // Visibility of Style Input
    elements.mapStyleGroup.style.display = (elements.mapEngineInput.value === 'maplibre') ? 'block' : 'none';

    // Geocoding
    elements.geocodeEnabled.checked = config.geocodeEnabled || false;
    elements.photonUrl.value = config.photonUrl || 'https://photon.komoot.io';
    elements.photonApiKey.value = config.photonApiKey || '';
    elements.geocodeSettings.style.display = elements.geocodeEnabled.checked ? 'block' : 'none';
    elements.keepAwakeEnabled.checked = config.keepAwakeEnabled || false;

    // Stationary Mode
    if (config.fixedLat && config.fixedLon) {
        elements.stationaryEnabled.checked = true;
        elements.fixedLat.value = config.fixedLat;
        elements.fixedLon.value = config.fixedLon;
        elements.stationarySettings.style.display = 'block';
    } else {
        elements.stationaryEnabled.checked = false;
        elements.fixedLat.value = '';
        elements.fixedLon.value = '';
        elements.stationarySettings.style.display = 'none';
    }

    elements.configView.classList.add('active');
    elements.dashboardView.classList.remove('active');
    stopTracking();
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('SW Registered', reg);
                })
                .catch(err => console.log('SW Reg Failed', err));

            let refreshing;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                window.location.reload();
                refreshing = true;
            });
        });
    }
}

function showDashboard() {
    elements.configView.classList.remove('active');
    elements.dashboardView.classList.add('active');
    elements.mapView.classList.remove('active');
}

function saveConfig() {
    const baseUrlRaw = elements.baseUrlInput.value.trim();
    const apiKeyRaw = elements.apiKeyInput.value.trim();
    const apiUserNameRaw = elements.apiUserNameInput.value.trim();
    const mapEngine = elements.mapEngineInput.value;
    const mapStyleUrlRaw = elements.mapStyleUrlInput.value.trim();

    const geocodeEnabled = elements.geocodeEnabled.checked;
    const photonUrlRaw = elements.photonUrl.value.trim();
    const photonApiKeyRaw = elements.photonApiKey.value.trim();
    const keepAwakeEnabled = elements.keepAwakeEnabled.checked;

    const stationaryEnabled = elements.stationaryEnabled.checked;
    const fixedLatRaw = elements.fixedLat.value.trim();
    const fixedLonRaw = elements.fixedLon.value.trim();

    // Validate required fields
    if (!baseUrlRaw || !apiKeyRaw) {
        alert("Please provide both Dawarich Base URL and API Key");
        return;
    }

    try {
        // Validate and sanitize base URL
        const baseUrl = sanitizeUrl(baseUrlRaw);

        // Validate API key
        const apiKey = validateApiKey(apiKeyRaw);

        // Validate optional name
        const apiUserName = validateName(apiUserNameRaw);

        // Build config object
        const config = {
            baseUrl,
            apiKey,
            apiUserName,
            mapEngine,
            geocodeEnabled,
            keepAwakeEnabled
        };

        // Validate and add map style URL if provided
        if (mapStyleUrlRaw) {
            try {
                const mapStyleUrl = sanitizeUrl(mapStyleUrlRaw);
                config.mapStyleUrl = mapStyleUrl;
            } catch (e) {
                // If relative path, allow it
                if (!mapStyleUrlRaw.includes('://')) {
                    config.mapStyleUrl = mapStyleUrlRaw;
                } else {
                    throw e;
                }
            }
        } else {
            config.mapStyleUrl = './style.json';
        }

        // Set Photon URL (with lenient validation)
        if (photonUrlRaw) {
            try {
                config.photonUrl = sanitizeUrl(photonUrlRaw);
            } catch (e) {
                // Validation failed, use default
                console.warn('Invalid Photon URL, using default:', e.message);
                config.photonUrl = 'https://photon.komoot.io';
            }
        } else {
            config.photonUrl = 'https://photon.komoot.io';
        }
        config.photonApiKey = photonApiKeyRaw;

        // Validate and add stationary coordinates if enabled
        if (stationaryEnabled && fixedLatRaw && fixedLonRaw) {
            const coords = validateCoordinates(fixedLatRaw, fixedLonRaw);
            config.fixedLat = coords.lat.toString();
            config.fixedLon = coords.lon.toString();
        }

        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        invalidateConfig();
        showDashboard();
        startTracking();
    } catch (error) {
        // Show user-friendly error message
        alert(`Configuration Error: ${error.message}\n\nPlease check your inputs and try again.`);
        console.error('Config validation error:', error);
    }
}

async function startScan() {
    elements.qrReaderContainer.style.display = 'block';
    elements.scanQrBtn.style.display = 'none';

    html5QrCode = new Html5Qrcode("qrReader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScanSuccess
        );
    } catch (err) {
        console.error("Camera error:", err);
        alert("Unable to start camera. Please check permissions.");
        stopScan();
    }
}

function stopScan() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            elements.qrReaderContainer.style.display = 'none';
            elements.scanQrBtn.style.display = 'inline-block';
            html5QrCode = null;
        }).catch(err => console.error("Error stopping scanner:", err));
    }
}

function onScanSuccess(decodedText) {
    try {
        const data = JSON.parse(decodedText);

        // Validate required fields exist
        if (!data.server_url || !data.api_key) {
            alert("Invalid QR Code format. Missing server_url or api_key.");
            return;
        }

        // Validate the URL and API key
        const validatedUrl = sanitizeUrl(data.server_url);
        const validatedKey = validateApiKey(data.api_key);

        // If validation passed, populate the form
        elements.baseUrlInput.value = validatedUrl;
        elements.apiKeyInput.value = validatedKey;

        stopScan();
        alert("QR Code scanned successfully! Please enter your name (optional) and click 'Start Tracking'.");

    } catch (error) {
        if (error instanceof SyntaxError) {
            alert("Invalid QR Code. Could not parse JSON.");
        } else {
            alert(`Invalid QR Code: ${error.message}`);
        }
        console.error('QR code validation error:', error);
    }
}

function startTracking() {
    const config = getConfig();
    if (config && config.keepAwakeEnabled) {
        requestWakeLock();
    }

    fetchData();
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);

    refreshInterval = setInterval(fetchData, 10000);
    countdownInterval = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    secondsToRefresh--;
    if (secondsToRefresh < 0) secondsToRefresh = 10;

    const txt = `Refreshing in ${secondsToRefresh}s`;
    elements.refreshStatus.innerText = txt;

    const mapReloadCountdown = document.getElementById('mapReloadCountdown');
    if (mapReloadCountdown) {
        mapReloadCountdown.innerText = `(${secondsToRefresh}s)`;
    }

    if (sharedExpiresAt) {
        const el = document.getElementById('sharedExpiryCountdown');
        if (el) {
            const now = Date.now();
            const diff = sharedExpiresAt - now;
            if (diff > 0) {
                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                el.innerText = `Link expires in: ${hours}h ${minutes}m ${seconds}s`;
                el.style.display = 'block';
            } else {
                el.innerText = 'Link Expired';
                el.style.color = 'var(--danger-color)';
                el.style.display = 'block';
            }
        }
    }
}

function stopTracking() {
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);
    releaseWakeLock();
}

async function fetchData() {
    const config = getConfig();
    if (!config) return;

    secondsToRefresh = 10; // Reset countdown on actual fetch
    elements.refreshStatus.classList.add('refreshing');

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

        updateUI(data);

        // Update map if active
        if (elements.mapView.classList.contains('active')) {
            updateMapMarkers();
        }

        elements.lastUpdated.innerText = `Last updated: ${new Date().toLocaleTimeString([], { hour12: false })}`;
    } catch (error) {
        console.error('Fetch error:', error);
        elements.lastUpdated.innerText = `Error: API failed`;
    } finally {
        elements.refreshStatus.classList.remove('refreshing');
    }
}

async function fetchOwnerLocation(config) {
    try {
        // Fetch last 24 hours of points for the API key owner
        // We use a large window to ensure we get at least one point
        // and order by desc to get the latest.
        const startAt = '2000-01-01'; // Use a very old date to ensure we find the last point

        const params = new URLSearchParams({
            api_key: config.apiKey,
            start_at: startAt,
            per_page: 1,
            order: 'desc'
        });

        const url = `${config.baseUrl}/api/v1/points?${params.toString()}`;
        const response = await fetchWithRetry(url);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                ownerLocation = data[0];
            } else if (data.points && Array.isArray(data.points) && data.points.length > 0) {
                // Adjust depending on actual API response structure if it's nested
                ownerLocation = data.points[0];
            }
        }
    } catch (e) {
        console.error("Error fetching owner location", e);
    }
}

function updateUI(data) {
    if (!data.locations || !Array.isArray(data.locations)) return;

    const config = getConfig() || {};
    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};

    // Check if we need to show the View Selected button
    const hasSelection = selectedMemberEmails.size > 0;

    // Check if server configured to show share button
    if (elements.shareLocationBtn) {
        const isStationaryMode = config.fixedLat && config.fixedLon;
        elements.shareLocationBtn.style.display = (serverConfigured && !isStationaryMode) ? 'flex' : 'none';
    }
    elements.viewSelectedBtn.style.display = hasSelection ? 'block' : 'none';
    elements.viewSelectedBtn.innerText = `View ${selectedMemberEmails.size} Selected on Map`;
    elements.viewSelectedBtn.onclick = () => showMap();

    const container = elements.membersList;
    const existingNodes = new Map();

    // Index existing elements by email
    Array.from(container.children).forEach(child => {
        const email = child.getAttribute('data-member-email');
        if (email) existingNodes.set(email, child);
    });

    const newOrder = [];

    // 1. Handle Owner
    if (ownerLocation) {
        const email = 'OWNER';
        let card = existingNodes.get(email);
        if (!card) {
            card = document.createElement('div');
            card.className = 'member-card owner-card';
            card.setAttribute('data-member-email', email);
        }
        updateMemberCardContent(card, ownerLocation, config, names, true, -1);
        newOrder.push(card);
        existingNodes.delete(email);
    }

    // 2. Handle Members
    data.locations.forEach((member, index) => {
        const email = member.email;
        let card = existingNodes.get(email);
        if (!card) {
            card = document.createElement('div');
            card.className = 'member-card';
            card.setAttribute('data-member-email', email);
        }
        updateMemberCardContent(card, member, config, names, false, index);
        newOrder.push(card);
        existingNodes.delete(email);
    });

    // 3. Reorder/Append
    newOrder.forEach(card => {
        container.appendChild(card);
    });

    // 4. Remove leftovers
    existingNodes.forEach(card => {
        card.remove();
    });
}

function updateMemberCardContent(card, member, config, names, isOwner, index) {
    const email = isOwner ? 'OWNER' : member.email;
    const ownerName = config.apiUserName ? config.apiUserName : "API Owner";

    // Normalize data
    const lat = parseFloat(member.latitude || member.lat);
    const lon = parseFloat(member.longitude || member.lon);
    const batt = member.battery || member.batt || '?';
    const timestamp = member.timestamp || member.tst;
    const displayName = isOwner ? (config.apiUserName || '(You)') : (names[member.email] || member.name || member.email);

    // Performance: Smart update checking - only update if data actually changed
    const newData = {
        lat: lat.toFixed(6),
        lon: lon.toFixed(6),
        battery: batt,
        timestamp: timestamp,
        name: displayName
    };

    const currentData = card.dataset.memberData ? JSON.parse(card.dataset.memberData) : {};

    // Skip update if nothing changed
    if (JSON.stringify(currentData) === JSON.stringify(newData)) {
        return;
    }

    // Store new state for next comparison
    card.dataset.memberData = JSON.stringify(newData);

    // Derived values
    const batteryClass = getBatteryClass(batt);
    const timeStr = timestamp ? formatRelativeTime(timestamp) : 'Unknown';

    // displayName was already defined above, don't redeclare it
    const isSelected = selectedMemberEmails.has(email);
    const isStationaryMode = config.fixedLat && config.fixedLon;

    // Check if card has content (if it's new)
    if (!card.hasChildNodes()) {
        card.innerHTML = `
             <div class="member-checkbox-container"></div>
             <div class="avatar"></div>
             <div class="member-info">
                <div class="member-email">
                    <span class="member-display-name"></span>
                    <button class="edit-name-btn">Edit</button>
                </div>
                <div class="member-location">
                    <span class="member-coords"></span>
                </div>
            </div>
            <div class="member-meta">
                <div class="battery">
                    <span></span>
                    <small></small>
                </div>
                <div class="timestamp" style="font-size: 0.7rem;"></div>
            </div>
         `;
    }

    const checkboxContainer = card.querySelector('.member-checkbox-container');
    const avatar = card.querySelector('.avatar');
    const nameSpan = card.querySelector('.member-display-name');
    const editBtn = card.querySelector('.edit-name-btn');
    const locationDiv = card.querySelector('.member-location');
    const coordsSpan = card.querySelector('.member-coords');
    const batteryDiv = card.querySelector('.battery');
    const timeDiv = card.querySelector('.timestamp');

    // 1. Checkbox
    let shouldShowCheckbox = true;
    if (isOwner && !isStationaryMode) shouldShowCheckbox = false;

    let checkbox = checkboxContainer.querySelector('input');
    if (shouldShowCheckbox) {
        if (!checkbox) {
            checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'member-checkbox';
            checkbox.setAttribute('data-action', 'toggle-selection');
            checkboxContainer.appendChild(checkbox);
        }
        checkbox.setAttribute('data-email', email);
        checkbox.checked = isSelected;
    } else {
        if (checkbox) checkbox.remove();
    }

    // 2. Avatar
    let avatarStyle = '';
    let avatarContent = '';
    if (isOwner) {
        avatarStyle = 'background: #ffd700; color: #333;';
        avatarContent = ownerName.charAt(0).toUpperCase();
    } else {
        avatarStyle = `background: ${getMemberColorByIndex(index).hex}; color: white;`;
        avatarContent = member.email_initial || '';
    }
    if (avatar.getAttribute('style') !== avatarStyle) avatar.setAttribute('style', avatarStyle);
    if (avatar.innerText !== avatarContent) avatar.innerText = avatarContent;

    // 3. Name
    if (isOwner && isStationaryMode) {
        nameSpan.style.cursor = 'pointer';
        nameSpan.style.textDecoration = 'underline';
        nameSpan.style.color = '#ffd700';
        nameSpan.setAttribute('data-action', 'show-single-map');
    } else if (isOwner) {
        nameSpan.style.cursor = 'default';
        nameSpan.style.textDecoration = 'none';
        nameSpan.style.color = '#ffd700';
        nameSpan.removeAttribute('data-action');
    } else {
        nameSpan.style.cursor = 'pointer';
        nameSpan.style.textDecoration = 'underline';
        nameSpan.style.color = '';
        nameSpan.setAttribute('data-action', 'show-single-map');
    }
    nameSpan.setAttribute('data-email', email);
    if (nameSpan.innerText !== displayName) nameSpan.innerText = displayName;

    // Edit Btn
    editBtn.setAttribute('data-action', 'edit-name');
    editBtn.setAttribute('data-email', email);

    // 4. Location
    const coordsText = `Lat: ${lat}, Lon: ${lon}`;
    if (coordsSpan.innerText !== coordsText) coordsSpan.innerText = coordsText;

    // Address
    let addrEl = locationDiv.querySelector('.member-address');
    if (member.address) {
        if (!addrEl) {
            addrEl = document.createElement('div');
            addrEl.className = 'member-address';
            addrEl.style.fontSize = '0.8rem';
            addrEl.style.color = 'var(--text-secondary)';
            addrEl.style.marginTop = '0.2rem';
            locationDiv.insertBefore(addrEl, locationDiv.children[1]);
        }
        if (addrEl.innerText !== member.address) addrEl.innerText = member.address;
        locationDiv.classList.add('has-address');
    } else {
        if (addrEl) addrEl.remove();
        locationDiv.classList.remove('has-address');
    }

    // Distance
    let distEl = locationDiv.querySelector('.member-distance');
    let distText = null;
    if (userLocation) {
        let dist = 0;
        let show = false;
        if (isOwner) {
            if (isStationaryMode) {
                dist = calculateDistance(userLocation.lat, userLocation.lng, parseFloat(lat), parseFloat(lon));
                show = true;
            }
        } else {
            dist = calculateDistance(userLocation.lat, userLocation.lng, member.latitude, member.longitude);
            show = true;
        }

        if (show) {
            distText = `${dist.toFixed(2)} km away`;
        }
    }

    if (distText) {
        if (!distEl) {
            distEl = document.createElement('div');
            distEl.className = 'member-distance';
            locationDiv.appendChild(distEl);
        }
        if (distEl.innerText !== distText) distEl.innerText = distText;
    } else {
        if (distEl) distEl.remove();
    }

    // 5. Meta
    batteryDiv.className = `battery ${batteryClass}`;

    const battSpan = batteryDiv.querySelector('span');
    if (battSpan.innerText !== `${batt}%`) battSpan.innerText = `${batt}%`;

    const battSmall = batteryDiv.querySelector('small');
    const batteryStatus = member.battery_status || (isOwner ? 'unplugged' : '');
    if (battSmall.innerText !== batteryStatus) battSmall.innerText = batteryStatus;

    if (timeDiv.innerText !== timeStr) timeDiv.innerText = timeStr;
}

function toggleMemberSelection(checkbox, email) {
    if (checkbox.checked) {
        selectedMemberEmails.add(email);
    } else {
        selectedMemberEmails.delete(email);
    }
    // Update button visibility/text
    const hasSelection = selectedMemberEmails.size > 0;
    elements.viewSelectedBtn.style.display = hasSelection ? 'block' : 'none';
    elements.viewSelectedBtn.innerText = `View ${selectedMemberEmails.size} Selected on Map`;
}

function showSingleMemberMap(email) {
    // If we click a specific name, we just show that one person?
    // User requested: "select more than one... shown on the map simultaneously".
    // But behavior for single click is "toggle map view directly".
    // I think it's safest to CLEAR selection and select JUST this one, then show map.
    selectedMemberEmails.clear();
    selectedMemberEmails.add(email);
    showMap();
}

function getBatteryClass(level) {
    if (level <= 20) return 'battery-low';
    if (level <= 50) return 'battery-mid';
    return 'battery-high';
}

function editName(email) {
    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
    const config = getConfig() || {};

    currentEditingEmail = email;
    if (email === 'OWNER') {
        elements.modalEmail.innerText = `Update your display name`;
        elements.modalInput.value = config.apiUserName || "";
    } else {
        elements.modalEmail.innerText = `For ${email}`;
        elements.modalInput.value = names[email] || "";
    }

    elements.modal.classList.add('active');
    setTimeout(() => elements.modalInput.focus(), 100);
}

function showMap(email) {
    // email argument is optional/deprecated. If passed, it ensures it's in selection
    if (email) {
        selectedMemberEmails.add(email);
    }

    // Always reset auto-center when showing map fresh
    isAutoCenterEnabled = true;

    elements.mapView.classList.add('active');
    elements.dashboardView.classList.remove('active');

    // Initial fetch to get member data for map
    fetchData();
}

// Memory Management: Clean up map markers to prevent memory leaks
function cleanupMapMarkers() {
    const config = getConfig() || {};
    const useLeaflet = config.mapEngine === 'leaflet';

    // Clear all member markers
    for (const [email, marker] of Object.entries(memberMarkers)) {
        if (marker) {
            if (useLeaflet) {
                if (map) {
                    map.removeLayer(marker);
                    marker.off(); // Remove all Leaflet event listeners
                }
            } else {
                marker.remove(); // MapLibre cleanup
            }
        }
    }
    memberMarkers = {};

    // Clear owner marker
    if (ownerMarker) {
        if (useLeaflet) {
            if (map) {
                map.removeLayer(ownerMarker);
                ownerMarker.off();
            }
        } else {
            ownerMarker.remove();
        }
        ownerMarker = null;
    }

    // Clear user marker
    if (userMarker) {
        if (useLeaflet) {
            if (map) {
                map.removeLayer(userMarker);
                userMarker.off();
            }
        } else {
            userMarker.remove();
        }
        userMarker = null;
    }
}

async function updateMapMarkers() {
    const config = getConfig() || {};
    const useLeaflet = config.mapEngine === 'leaflet';
    const requiredEngine = useLeaflet ? 'leaflet' : 'maplibre';

    // Ensure engine is loaded before doing anything
    await loadMapEngine(requiredEngine);

    // Check if view is still active (user might have navigated away during load)
    if (!elements.mapView.classList.contains('active')) return;

    // Use shared style if available and in shared mode, otherwise config
    const targetStyleUrl = (isSharedMode && sharedStyleUrl) ? sharedStyleUrl : (config.mapStyleUrl || './style.json');

    // If switching engines or styles (for MapLibre), destroy previous map instance
    if (map) {
        const currentEngine = map._family_locator_engine;
        const currentStyle = map._family_locator_style;
        const targetEngine = useLeaflet ? 'leaflet' : 'maplibre';

        let shouldReset = false;
        if (currentEngine !== targetEngine) shouldReset = true;
        if (targetEngine === 'maplibre' && currentStyle !== targetStyleUrl) shouldReset = true;

        if (shouldReset) {
            map.remove();
            map = null;
            memberMarkers = {};
            ownerMarker = null;
            userMarker = null;
            document.getElementById('mapContainer').innerHTML = ''; // Ensure container is clean
        }
    }

    if (!map) {
        if (useLeaflet) {
            // --- LEAFLET INITIALIZATION ---
            map = L.map('mapContainer').setView([0, 0], 2);
            map._family_locator_engine = 'leaflet';
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            map.on('dragstart', () => {
                isAutoCenterEnabled = false;
                const btn = document.getElementById('dynamicRecenterBtn');
                if (btn) btn.style.display = 'block';
            });
            map.on('zoomstart', (e) => {
                if (e && e.originalEvent) {
                    isAutoCenterEnabled = false;
                    const btn = document.getElementById('dynamicRecenterBtn');
                    if (btn) btn.style.display = 'block';
                }
            });
        } else {
            // --- MAPLIBRE INITIALIZATION ---
            map = new maplibregl.Map({
                container: 'mapContainer',
                style: targetStyleUrl,
                center: [0, 0],
                zoom: 1,
                attributionControl: true
            });
            map._family_locator_engine = 'maplibre';
            map._family_locator_style = targetStyleUrl;
            map.addControl(new maplibregl.NavigationControl(), 'top-right');

            map.on('dragstart', () => {
                isAutoCenterEnabled = false;
                const btn = document.getElementById('dynamicRecenterBtn');
                if (btn) btn.style.display = 'block';
            });
            map.on('zoomstart', (e) => {
                if (e && e.originalEvent) {
                    isAutoCenterEnabled = false;
                    const btn = document.getElementById('dynamicRecenterBtn');
                    if (btn) btn.style.display = 'block';
                }
            });
        }
    }

    let bounds;
    if (useLeaflet) {
        bounds = L.latLngBounds();
    } else {
        bounds = new maplibregl.LngLatBounds();
    }

    let hasMarkers = false;

    // 1. Members
    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};

    // Remove old markers that are no longer selected or valid
    for (const [email, m] of Object.entries(memberMarkers)) {
        if (!selectedMemberEmails.has(email)) {
            if (useLeaflet) map.removeLayer(m);
            else m.remove();
            delete memberMarkers[email];
        }
    }

    // Create a map for fast lookup to avoid O(N*M) complexity
    const locationsMap = new Map();
    // Merge shared locations for map display
    const allLocations = [...lastLocations, ...sharedLocations];

    allLocations.forEach((m, index) => {
        locationsMap.set(m.email, { member: m, index });
    });

    // Add or update markers for selected members
    for (const email of selectedMemberEmails) {
        const entry = locationsMap.get(email);
        if (entry) {
            const member = entry.member;
            const index = entry.index;
            const lat = member.latitude;
            const lng = member.longitude;
            const displayName = names[email] || member.name || email;
            const popupContent = `<b>${escapeHtml(displayName)}</b><br>${escapeHtml(new Date(member.timestamp * 1000).toLocaleString())}<br>Bat: ${member.battery}%${member.address ? `<br>${escapeHtml(member.address)}` : ''}`;

            if (useLeaflet) {
                // --- LEAFLET MARKER UPDATE ---
                if (memberMarkers[email]) {
                    memberMarkers[email].setLatLng([lat, lng]).setPopupContent(popupContent);
                    memberMarkers[email].setTooltipContent(escapeHtml(displayName));
                } else {
                    const colorCfg = getMemberColorByIndex(index);
                    const customIcon = new L.Icon({
                        iconUrl: colorCfg.icon,
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    });

                    memberMarkers[email] = L.marker([lat, lng], { icon: customIcon })
                        .addTo(map)
                        .bindPopup(popupContent)
                        .bindTooltip(escapeHtml(displayName), { permanent: true, direction: 'bottom', className: 'marker-label' });
                }
                bounds.extend([lat, lng]);
            } else {
                // --- MAPLIBRE MARKER UPDATE ---
                if (memberMarkers[email]) {
                    memberMarkers[email].setLngLat([lng, lat]);
                    memberMarkers[email].getPopup().setHTML(popupContent);
                    // Update label text
                    const el = memberMarkers[email].getElement();
                    const label = el.querySelector('.marker-label-container');
                    if (label) label.innerText = displayName;
                } else {
                    const colorCfg = getMemberColorByIndex(index);

                    const container = document.createElement('div');
                    container.className = 'custom-marker-container';

                    const img = document.createElement('img');
                    img.src = colorCfg.icon;
                    img.style.width = '25px';
                    img.style.height = '41px';

                    const label = document.createElement('div');
                    label.className = 'marker-label-container';
                    label.innerText = displayName;

                    container.appendChild(img);
                    container.appendChild(label);

                    const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupContent);

                    memberMarkers[email] = new maplibregl.Marker({ element: container, anchor: 'bottom' })
                        .setLngLat([lng, lat])
                        .setPopup(popup)
                        .addTo(map);
                }
                bounds.extend([lng, lat]);
            }
            hasMarkers = true;
        }
    }

    // Owner Marker
    const shouldShowOwner = (showOwnerLocation || selectedMemberEmails.has('OWNER')) && ownerLocation;

    if (shouldShowOwner) {
        const lat = ownerLocation.latitude || ownerLocation.lat;
        const lng = ownerLocation.longitude || ownerLocation.lon;
        const config = getConfig() || {};
        const ownerName = config.apiUserName ? config.apiUserName : "API Owner";
        const timestamp = ownerLocation.timestamp || ownerLocation.tst;
        const timeStr = timestamp ? formatRelativeTime(timestamp) : 'Unknown time';
        const batt = ownerLocation.battery || ownerLocation.batt || '?';

        if (lat && lng) {
            const popupContent = `<b>${escapeHtml(ownerName)}</b><br>${escapeHtml(timeStr)}<br>Bat: ${batt}%${ownerLocation.address ? `<br>${escapeHtml(ownerLocation.address)}` : ''}`;

            if (useLeaflet) {
                // --- LEAFLET OWNER ---
                if (!ownerMarker) {
                    const goldIcon = new L.Icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    });

                    ownerMarker = L.marker([lat, lng], { icon: goldIcon })
                        .addTo(map)
                        .bindPopup(popupContent)
                        .bindTooltip(escapeHtml(ownerName), { permanent: true, direction: 'bottom', className: 'marker-label' });
                } else {
                    ownerMarker.setLatLng([lat, lng]).setPopupContent(popupContent);
                    ownerMarker.setTooltipContent(escapeHtml(ownerName));
                    if (ownerMarker.getPopup().isOpen()) {
                        ownerMarker.openPopup(); // Refresh content if open
                    }
                }
                bounds.extend([lat, lng]);
            } else {
                // --- MAPLIBRE OWNER ---
                if (!ownerMarker) {
                    const container = document.createElement('div');
                    container.className = 'custom-marker-container';

                    const img = document.createElement('img');
                    img.src = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png';
                    img.style.width = '25px';
                    img.style.height = '41px';

                    const label = document.createElement('div');
                    label.className = 'marker-label-container';
                    label.innerText = ownerName;

                    container.appendChild(img);
                    container.appendChild(label);

                    const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupContent);

                    ownerMarker = new maplibregl.Marker({ element: container, anchor: 'bottom' })
                        .setLngLat([lng, lat])
                        .setPopup(popup)
                        .addTo(map);
                } else {
                    ownerMarker.setLngLat([lng, lat]);
                    ownerMarker.getPopup().setHTML(popupContent);
                    const el = ownerMarker.getElement();
                    const label = el.querySelector('.marker-label-container');
                    if (label) label.innerText = ownerName;
                }
                bounds.extend([lng, lat]);
            }
            hasMarkers = true;
        }
    } else if (ownerMarker) {
        if (useLeaflet) map.removeLayer(ownerMarker);
        else ownerMarker.remove();
        ownerMarker = null;
    }

    // 3. User (Viewer) Location
    if (userLocation && proximityEnabled) {
        if (useLeaflet) {
            // --- LEAFLET USER ---
            if (!userMarker) {
                userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
                    radius: 8,
                    fillColor: "#4a90e2",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);
            } else {
                userMarker.setLatLng([userLocation.lat, userLocation.lng]);
            }
            bounds.extend([userLocation.lat, userLocation.lng]);
        } else {
            // --- MAPLIBRE USER ---
            if (!userMarker) {
                const el = document.createElement('div');
                el.className = 'user-location-dot';
                userMarker = new maplibregl.Marker({ element: el })
                    .setLngLat([userLocation.lng, userLocation.lat])
                    .addTo(map);
            } else {
                userMarker.setLngLat([userLocation.lng, userLocation.lat]);
            }
            bounds.extend([userLocation.lng, userLocation.lat]);
        }
        hasMarkers = true;
    }

    // Unified Map Overlay
    const header = document.querySelector('.map-header');
    header.innerHTML = ''; // Clear previous

    const card = document.createElement('div');
    card.className = 'map-unified-card';

    // 1. Collect all users to show
    const usersToShow = [];

    // Owner (if enabled)
    if (shouldShowOwner) {
        const config = getConfig() || {};
        usersToShow.push({
            name: config.apiUserName || "API Owner",
            email: "Owner",
            timestamp: ownerLocation.timestamp,
            battery: ownerLocation.battery,
            isOwner: true,
            initial: (config.apiUserName || "O").charAt(0).toUpperCase()
        });
    }

    // Selected Members
    selectedMemberEmails.forEach(email => {
        const entry = locationsMap.get(email);
        if (entry) {
            const member = entry.member;
            const index = entry.index;
            usersToShow.push({
                name: names[email] || member.name || email,
                email: email,
                timestamp: member.timestamp,
                battery: member.battery,
                isOwner: false,
                initial: member.email_initial,
                color: getMemberColorByIndex(index).hex
            });
        }
    });

    // Toggle chevron
    const chevronRotation = isMapOverlayCollapsed ? '-90deg' : '0deg';
    const chevron = `<span style="font-size: 0.8rem; transform: rotate(${chevronRotation}); transition: transform 0.2s;">▼</span>`;

    // 2. Build Card Content
    // Header
    const titleText = usersToShow.length === 1
        ? usersToShow[0].name
        : `Tracking ${usersToShow.length} Members`;

    const cardHeader = document.createElement('div');
    cardHeader.className = 'map-card-header';
    cardHeader.innerHTML = `
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(titleText)}</span>
                <span id="mapReloadCountdown" style="font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0;">(${secondsToRefresh}s)</span>
            </div>
            <div id="sharedExpiryCountdown" style="font-size: 0.75rem; color: var(--warning-color); display: none;"></div>
        </div>
        ${usersToShow.length > 1 ? chevron : ''}
    `;

    // Body (List of users)
    const cardBody = document.createElement('div');
    cardBody.className = 'map-card-body' + (isMapOverlayCollapsed ? ' collapsed' : '');

    if (usersToShow.length === 0) {
        cardBody.innerHTML = `<div class="map-member-row" style="justify-content: center; color: var(--text-secondary);">No members selected</div>`;
    } else {
        usersToShow.forEach(u => {
            const timeStr = formatRelativeTime(u.timestamp);
            const row = document.createElement('div');
            row.className = `map-member-row ${u.isOwner ? 'is-owner' : ''}`;
            row.innerHTML = `
                <div class="avatar-small" style="background: ${u.isOwner ? '#ffd700' : u.color}; color: #333;">${escapeHtml(u.initial)}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 500; font-size: 0.9rem; color: ${u.isOwner ? '#ffd700' : 'var(--text-primary)'}">${escapeHtml(u.name)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">
                        ${u.battery >= 0 ? `Bat: ${u.battery}% • ` : ''}${escapeHtml(timeStr)}
                    </div>
                </div>
            `;
            cardBody.appendChild(row);
        });
    }

    // Footer (Toggle + Controls)
    const cardFooter = document.createElement('div');
    cardFooter.className = 'map-card-footer';

    // Show My Location Toggle
    const toggleContainer = document.createElement('div');
    if (!showOwnerLocation) {
        toggleContainer.style.display = 'flex';
        toggleContainer.style.alignItems = 'center';
        toggleContainer.style.gap = '0.5rem';

        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';
        switchLabel.style.transform = 'scale(0.8)';
        switchLabel.appendChild(elements.toggleProximity); // Re-attach existing element
        const slider = document.createElement('span');
        slider.className = 'slider round';
        switchLabel.appendChild(slider);

        toggleContainer.appendChild(switchLabel);
        toggleContainer.appendChild(elements.distanceBadge);

        // Label text
        const label = document.createElement('span');
        label.innerText = "Me";
        label.style.fontSize = '0.85rem';
        label.style.fontWeight = '500';
        toggleContainer.appendChild(label);
    }

    // Buttons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.display = 'flex';
    buttonsContainer.style.gap = '0.5rem';

    // Dynamic Buttons creation
    // Dynamic Buttons creation
    const recenterBtn = document.createElement('button');
    recenterBtn.id = 'dynamicRecenterBtn'; // stable ID for listeners
    recenterBtn.innerText = 'Recenter';
    recenterBtn.className = 'edit-name-btn'; // reuse style
    recenterBtn.style.padding = '0.3rem 0.8rem';
    recenterBtn.style.fontSize = '0.8rem';
    recenterBtn.style.background = 'var(--accent-color)';
    recenterBtn.style.color = 'white';
    recenterBtn.style.display = isAutoCenterEnabled ? 'none' : 'block'; // Set initial state
    recenterBtn.onclick = () => {
        recenterMap();
        recenterBtn.style.display = 'none';
    };

    buttonsContainer.appendChild(recenterBtn);

    if (!isSharedMode) {
        const closeBtn = document.createElement('button');
        closeBtn.innerText = 'Close'; // Renamed to simple "Close"
        closeBtn.className = 'edit-name-btn';
        closeBtn.style.padding = '0.3rem 1rem';
        closeBtn.style.fontSize = '0.8rem';
        closeBtn.style.background = 'rgba(255, 255, 255, 0.1)'; // Better contrast
        closeBtn.style.color = 'var(--text-primary)';
        closeBtn.onclick = closeMap;
        buttonsContainer.appendChild(closeBtn);
    }

    cardFooter.appendChild(toggleContainer);
    cardFooter.appendChild(buttonsContainer);

    card.appendChild(cardHeader);
    card.appendChild(cardBody);
    card.appendChild(cardFooter);
    header.appendChild(card);

    // Toggle Collapse Logic
    if (usersToShow.length > 1) {
        cardHeader.onclick = () => {
            isMapOverlayCollapsed = !isMapOverlayCollapsed;
            if (isMapOverlayCollapsed) {
                cardBody.classList.add('collapsed');
                cardHeader.querySelector('span:last-child').style.transform = 'rotate(-90deg)';
            } else {
                cardBody.classList.remove('collapsed');
                cardHeader.querySelector('span:last-child').style.transform = 'rotate(0deg)';
            }
        };
    } else {
        // Reset transform if single user
        // cardBody.style.display = 'block'; // ensure visible
    }


    if (isAutoCenterEnabled && hasMarkers) {
        const isMobile = window.innerWidth <= 600;
        const paddingBottom = isMobile ? 300 : 50;
        const paddingSide = isMobile ? 20 : 50;

        if (useLeaflet) {
            // Leaflet FitBounds
            map.fitBounds(bounds, {
                paddingTopLeft: [paddingSide, paddingSide],
                paddingBottomRight: [paddingSide, paddingBottom],
                maxZoom: 18
            });
        } else {
            // MapLibre FitBounds
            map.fitBounds(bounds, {
                padding: {
                    top: paddingSide,
                    bottom: paddingBottom,
                    left: paddingSide,
                    right: paddingSide
                },
                maxZoom: 18
            });
        }
    }

    // Update countdown immediately to prevent flickering
    updateCountdown();
}

// Fallback Logic variables
let locationTimeout = null;

function startUserTracking() {
    const config = getConfig();

    // 1. Stationary Mode Priority
    if (config && config.fixedLat && config.fixedLon) {
        const lat = parseFloat(config.fixedLat);
        const lng = parseFloat(config.fixedLon);
        if (!isNaN(lat) && !isNaN(lng)) {
            // Stop any existing browser tracking
            if (watchId) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
            if (locationTimeout) clearTimeout(locationTimeout);

            userLocation = { lat, lng };
            updateUserMarker();

            if (elements.dashboardView.classList.contains('active')) {
                updateUI({ locations: lastLocations });
            }
            if (elements.mapView.classList.contains('active')) {
                updateMapMarkers();
            }
            return; // Exit, do not use browser geolocation
        }
    }

    // If showOwnerLocation is true, we don't track user at all (interface hidden)
    if (showOwnerLocation) return;

    if (!("geolocation" in navigator)) {
        useOwnerLocationAsFallback();
        return;
    }

    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (locationTimeout) clearTimeout(locationTimeout);

    // Set timeout for fallback
    locationTimeout = setTimeout(() => {
        console.warn("Geolocation timed out, using owner location fallback.");
        useOwnerLocationAsFallback();
    }, 10000);

    watchId = navigator.geolocation.watchPosition((position) => {
        clearTimeout(locationTimeout); // Got location, cancel timeout
        userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        updateUserMarker();

        if (elements.dashboardView.classList.contains('active')) {
            updateUI({ locations: lastLocations });
        }
        if (elements.mapView.classList.contains('active')) {
            updateMapMarkers();
        }
    }, (error) => {
        console.warn("Geolocation failed, using owner location fallback.", error);
        clearTimeout(locationTimeout);
        useOwnerLocationAsFallback();
    }, { enableHighAccuracy: true });
}

function useOwnerLocationAsFallback() {
    // Check if we have owner location; if not fetch it
    const config = getConfig();
    if (!config) return;

    // We can't use await here easily, so we handle promise
    const setLocation = () => {
        if (ownerLocation) {
            const lat = ownerLocation.latitude || ownerLocation.lat;
            const lng = ownerLocation.longitude || ownerLocation.lon;
            if (lat && lng) {
                userLocation = { lat, lng };
                updateUserMarker();
                if (elements.dashboardView.classList.contains('active')) {
                    updateUI({ locations: lastLocations });
                }
                if (elements.mapView.classList.contains('active')) {
                    updateMapMarkers();
                }
            }
        }
    };

    if (!ownerLocation) {
        fetchOwnerLocation(config).then(setLocation);
    } else {
        setLocation();
    }
}

function stopUserTracking() {
    const config = getConfig() || {};
    const useLeaflet = config.mapEngine === 'leaflet';

    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (userMarker) {
        if (useLeaflet) map.removeLayer(userMarker);
        else userMarker.remove();
        userMarker = null;
    }
    userLocation = null;
    elements.distanceBadge.style.display = 'none';
}

function updateUserMarker() {
    if (!map || !userLocation || !proximityEnabled) return;
    const config = getConfig() || {};
    const useLeaflet = config.mapEngine === 'leaflet';

    if (useLeaflet) {
        if (!userMarker) {
            userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
                radius: 8,
                fillColor: "#4a90e2",
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);
        } else {
            userMarker.setLatLng([userLocation.lat, userLocation.lng]);
        }
    } else {
        if (!userMarker) {
            const el = document.createElement('div');
            el.className = 'user-location-dot';
            userMarker = new maplibregl.Marker({ element: el })
                .setLngLat([userLocation.lng, userLocation.lat])
                .addTo(map);
        } else {
            userMarker.setLngLat([userLocation.lng, userLocation.lat]);
        }
    }
}

function updateProximityUI(memberLat, memberLng) {
    if (!proximityEnabled || !userLocation) {
        elements.distanceBadge.style.display = 'none';
        return;
    }

    const dist = calculateDistance(userLocation.lat, userLocation.lng, memberLat, memberLng);
    elements.distanceBadge.innerText = `${dist.toFixed(2)} km`;
    elements.distanceBadge.style.display = 'inline-block';
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function recenterMap() {
    isAutoCenterEnabled = true;
    const btn = document.getElementById('dynamicRecenterBtn');
    if (btn) btn.style.display = 'none';
    updateMapMarkers();
}

function closeMap() {
    startUserTracking();
    isMapOverlayCollapsed = false; // Reset for next use
    elements.mapView.classList.remove('active');
    elements.dashboardView.classList.add('active');
    // We do NOT clear selection here because user might want to go back to map with same selection.
    // But maybe we should? "view selected" button still works.
    if (map) {
        map.remove();
        map = null;
        memberMarkers = {};
        ownerMarker = null;
        userMarker = null;
    }
}

function saveModalName() {
    const newName = elements.modalInput.value.trim();

    if (currentEditingEmail === 'OWNER') {
        // Update Config
        const config = getConfig() || {};
        config.apiUserName = newName;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        invalidateConfig();
        // Update input in config view too if user goes back
        elements.apiUserNameInput.value = newName;
    } else {
        // Update Names Map
        const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
        if (newName === "") {
            delete names[currentEditingEmail];
        } else {
            names[currentEditingEmail] = newName;
        }
        localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    }

    closeModal();
    // Refresh UI to show changes
    if (elements.mapView.classList.contains('active')) {
        updateMapMarkers();
    } else {
        // If in dashboard, simple fetch to redraw
        // Or clearer: just call updateUI if we had data? 
        // We have 'lastLocations' and 'ownerLocation' in memory.
        const config = getConfig(); // refresh config
        const data = { locations: lastLocations };
        // We need to re-render. FetchData does it.
        // Or just re-render list?
        elements.membersList.innerHTML = '';
        // Let's just fetchData to be safe and simple
        fetchData();
    }
}

function closeModal() {
    elements.modal.classList.remove('active');
    currentEditingEmail = null;
}

function formatRelativeTime(timestamp) {
    // API timestamp is seconds since Unix epoch
    const date = new Date(timestamp * 1000);
    const absTime = date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });

    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    let relative = '';
    if (diff < 60) relative = 'Just now';
    else if (diff < 3600) relative = `${Math.floor(diff / 60)}m ago`;
    else if (diff < 86400) relative = `${Math.floor(diff / 3600)}h ago`;
    else relative = `${Math.floor(diff / 86400)}d ago`;

    return `${absTime} (${relative})`;
}

function setupEventListeners() {
    // Buttons
    elements.saveBtn.addEventListener('click', saveConfig);
    elements.logoutBtn.addEventListener('click', showConfig);
    elements.modalSaveBtn.addEventListener('click', saveModalName);
    elements.modalCancelBtn.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });
    elements.scanQrBtn.addEventListener('click', startScan);
    elements.stopScanBtn.addEventListener('click', stopScan);
    elements.shareConfigBtn.addEventListener('click', copyConfigUrl);

    // Storage Event for Sync
    window.addEventListener('storage', (e) => {
        if (e.key === CONFIG_KEY) invalidateConfig();
    });

    // Geocode Toggle
    elements.geocodeEnabled.addEventListener('change', (e) => {
        elements.geocodeSettings.style.display = e.target.checked ? 'block' : 'none';
    });

    // Stationary Toggle
    elements.stationaryEnabled.addEventListener('change', (e) => {
        elements.stationarySettings.style.display = e.target.checked ? 'block' : 'none';
    });

    // Global Event Delegation for Dynamic Elements
    document.addEventListener('click', (e) => {
        // Find closest element with data-action
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const email = target.dataset.email;

        if (action === 'edit-name') {
            editName(email);
        } else if (action === 'show-single-map') {
            showSingleMemberMap(email);
        }
    });

    document.addEventListener('change', (e) => {
        const target = e.target.closest('[data-action="toggle-selection"]');
        if (target) {
            const email = target.dataset.email;
            toggleMemberSelection(target, email);
        }
    });

    // Visibility API
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopTracking();
        } else {
            const config = getConfig();
            if (config && config.baseUrl && config.apiKey) {
                if (elements.dashboardView.classList.contains('active') || elements.mapView.classList.contains('active')) {
                    startTracking();
                }
            }
        }
    });

    // Proximity Toggle
    elements.toggleProximity.addEventListener('change', (e) => {
        proximityEnabled = e.target.checked;
        isAutoCenterEnabled = true;
        // elements.recenterMapBtn.style.display = 'none'; // Removed static button reference
        // Hide recenter button on toggle because we auto-center
        const btn = document.getElementById('dynamicRecenterBtn');
        if (btn) btn.style.display = 'none';

        // Ensure startUserTracking is called, which handles Stationary Mode logic automatically
        if (proximityEnabled) {
            startUserTracking();
        } else {
            stopUserTracking();
        }
        updateMapMarkers();
    });

    // Map Engine Toggle
    elements.mapEngineInput.addEventListener('change', (e) => {
        elements.mapStyleGroup.style.display = (e.target.value === 'maplibre') ? 'block' : 'none';
    });

    // Share Modal Events
    if (elements.shareLocationBtn) {
        elements.shareLocationBtn.addEventListener('click', () => {
            elements.shareModal.classList.add('active');
            elements.generatedLinkContainer.style.display = 'none';
        });
    }

    if (elements.closeShareModal) {
        elements.closeShareModal.addEventListener('click', () => {
            elements.shareModal.classList.remove('active');
        });
    }

    if (elements.durationBtns) {
        elements.durationBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove class from all
                document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('is-selected'));
                // Add to clicked
                const target = e.target.closest('button');
                if (target) {
                    target.classList.add('is-selected');
                }
            });
        });
    }

    if (elements.generateShareLinkBtn) {
        elements.generateShareLinkBtn.addEventListener('click', async () => {
            const activeBtn = document.querySelector('.duration-btn.is-selected');
            const duration = activeBtn ? activeBtn.dataset.duration : 3600;

            const config = getConfig() || {};
            const name = config.apiUserName || 'User';
            const styleUrl = config.mapStyleUrl || './style.json';

            try {
                const apiPath = window.location.pathname.replace('index.html', '').replace(/\/$/, "") + '/api/share';
                const res = await fetch(apiPath, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ duration, name, styleUrl })
                });

                if (res.ok) {
                    const data = await res.json();
                    let link = `${window.location.origin}${window.location.pathname}?token=${data.token}`;
                    elements.shareLinkInput.value = link;
                    elements.generatedLinkContainer.style.display = 'block';
                } else {
                    alert("Failed to generate link.");
                }
            } catch (e) {
                console.error(e);
                alert("Error connecting to server.");
            }
        });
    }

    if (elements.copyShareLinkBtn) {
        elements.copyShareLinkBtn.addEventListener('click', () => {
            elements.shareLinkInput.select();
            document.execCommand('copy');
            const originalText = elements.copyShareLinkBtn.innerText;
            elements.copyShareLinkBtn.innerText = 'Copied!';
            setTimeout(() => elements.copyShareLinkBtn.innerText = originalText, 2000);
        });
    }
}

init();
