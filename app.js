// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.
const CONFIG_KEY = 'family_tracker_config';
const NAMES_KEY = 'family_tracker_names';
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
    geocodeEnabled: document.getElementById('geocodeEnabled'),
    geocodeSettings: document.getElementById('geocodeSettings'),
    photonUrl: document.getElementById('photonUrl'),
    photonApiKey: document.getElementById('photonApiKey'),
    keepAwakeEnabled: document.getElementById('keepAwakeEnabled'),

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
};

let currentEditingEmail = null;
let html5QrCode = null;
let map = null;
let memberMarkers = {}; // Object to store markers by email
let selectedMemberEmails = new Set();
let showOwnerLocation = false;
let ownerLocation = null;
let ownerMarker = null;
let currentMapMemberEmail = null; // Deprecated, but keeping for compatibility if needed, though we should switch to selectedMemberEmails logic
let userMarker = null;
let userLocation = null;
let proximityEnabled = false;
let watchId = null;
let lastLocations = [];
let isAutoCenterEnabled = true;
let isMapOverlayCollapsed = false;
let lastKnownAddresses = {}; // email -> address
const addressCache = new Map(); // Key: "lat,lon" (fixed prec), Value: address string
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
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
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
    fetchAddressFromApi(lat, lon, config);
    return lastKnownAddresses[email] || null;
}

async function fetchAddressFromApi(lat, lon, config) {
    const key = getCoordinateKey(lat, lon);
    // Double check to prevent duplicate in-flight requests if we had a way to track them,
    // but here we just check if it's already resolved.
    if (addressCache.has(key)) return;

    // Use a placeholder to prevent repeated fetches while one is in flight?
    // For simplicity, we might skip this, but 10s refresh might trigger multiple.
    // Let's set a temporary value.
    addressCache.set(key, null); // Pending

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
    const geocode = urlParams.get('geocode');
    const photon = urlParams.get('photon');
    const photonKey = urlParams.get('photonKey');
    const awake = urlParams.get('awake');
    const namesParam = urlParams.get('names'); // email:name;email:name

    if (server || key || name || geocode || photon || photonKey || awake) {
        const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
        if (server) config.baseUrl = server.replace(/\/$/, "");
        if (key) config.apiKey = key;
        if (name) config.apiUserName = name;
        if (geocode) config.geocodeEnabled = geocode === 'true';
        if (photon) config.photonUrl = photon.replace(/\/$/, "");
        if (photonKey) config.photonApiKey = photonKey;
        if (awake) config.keepAwakeEnabled = awake === 'true';

        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        updated = true;
    }

    if (namesParam) {
        const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
        const pairs = namesParam.split(';');
        pairs.forEach(pair => {
            const [email, n] = pair.split(':');
            if (email && n) names[email.trim()] = n.trim();
        });
        localStorage.setItem(NAMES_KEY, JSON.stringify(names));
        updated = true;
    }

    // Clear sensitive params from URL without reload
    if (updated) {
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

function generateConfigUrl() {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
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
    processUrlConfiguration();

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const emailsParam = urlParams.get('emails');
    const showOwnerParam = urlParams.get('show_owner');

    if (showOwnerParam === 'true') {
        showOwnerLocation = true;
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

    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
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

function showConfig() {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    elements.baseUrlInput.value = config.baseUrl || '';
    elements.apiKeyInput.value = config.apiKey || '';
    elements.apiUserNameInput.value = config.apiUserName || '';

    // Geocoding
    elements.geocodeEnabled.checked = config.geocodeEnabled || false;
    elements.photonUrl.value = config.photonUrl || 'https://photon.komoot.io';
    elements.photonApiKey.value = config.photonApiKey || '';
    elements.geocodeSettings.style.display = elements.geocodeEnabled.checked ? 'block' : 'none';
    elements.keepAwakeEnabled.checked = config.keepAwakeEnabled || false;

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
    currentMapMemberEmail = null;
}

function saveConfig() {
    const baseUrl = elements.baseUrlInput.value.trim().replace(/\/$/, "");
    const apiKey = elements.apiKeyInput.value.trim();
    const apiUserName = elements.apiUserNameInput.value.trim();

    const geocodeEnabled = elements.geocodeEnabled.checked;
    const photonUrl = elements.photonUrl.value.trim().replace(/\/$/, "");
    const photonApiKey = elements.photonApiKey.value.trim();
    const keepAwakeEnabled = elements.keepAwakeEnabled.checked;

    if (!baseUrl || !apiKey) {
        alert("Please fill in both fields");
        return;
    }

    const config = {
        baseUrl,
        apiKey,
        apiUserName,
        geocodeEnabled,
        photonUrl: photonUrl || 'https://photon.komoot.io', // Default if empty
        photonApiKey,
        keepAwakeEnabled
    };

    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    showDashboard();
    startTracking();
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
        if (data.server_url && data.api_key) {
            elements.baseUrlInput.value = data.server_url.replace(/\/$/, "");
            elements.apiKeyInput.value = data.api_key;
            stopScan();
            // Do not auto-save. Let user enter name.
            alert("QR Code scanned! Please enter your name (optional) and click 'Start Tracking'.");
        } else {
            alert("Invalid QR Code format. Missing server_url or api_key.");
        }
    } catch (e) {
        alert("Invalid QR Code. Could not parse JSON.");
    }
}

function startTracking() {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
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
}

function stopTracking() {
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);
    releaseWakeLock();
}

async function fetchData() {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if (!config) return;

    secondsToRefresh = 10; // Reset countdown on actual fetch
    elements.refreshStatus.classList.add('refreshing');

    try {
        // Start fetching owner location in parallel to save time
        const ownerFetchPromise = fetchOwnerLocation(config);

        const response = await fetch(`${config.baseUrl}/api/v1/families/locations?api_key=${config.apiKey}`);
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
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0]; // Actually end_at expects date or datetime? Swagger says string, desc "End date".
        // Let's try to just use valid params for /api/v1/points
        // The swagger says `start_at` and `end_at`.

        const params = new URLSearchParams({
            api_key: config.apiKey,
            start_at: yesterday, // approximate
            per_page: 1,
            order: 'desc'
            // We might need to specify a wide range.
        });

        const response = await fetch(`${config.baseUrl}/api/v1/points?${params.toString()}`);
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

    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};

    // Check if we need to show the View Selected button
    const hasSelection = selectedMemberEmails.size > 0;
    elements.viewSelectedBtn.style.display = hasSelection ? 'block' : 'none';
    elements.viewSelectedBtn.innerText = `View ${selectedMemberEmails.size} Selected on Map`;
    elements.viewSelectedBtn.onclick = () => showMap();

    let htmlContent = '';

    // Prepend Owner Card if data available
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    if (ownerLocation) {
        const ownerName = config.apiUserName ? config.apiUserName : "API Owner";
        const timestamp = ownerLocation.timestamp || ownerLocation.tst;
        const timeStr = timestamp ? formatRelativeTime(timestamp) : 'Unknown';
        const batt = ownerLocation.battery || ownerLocation.batt || '?';
        const batteryClass = getBatteryClass(batt);
        const lat = parseFloat(ownerLocation.latitude || ownerLocation.lat).toFixed(5);
        const lon = parseFloat(ownerLocation.longitude || ownerLocation.lon).toFixed(5);

        const ownerCard = `
            <div class="member-card owner-card">
                 <div class="member-checkbox-container">
                    <!-- Placeholder to align with list -->
                </div>
                <div class="avatar" style="background: #ffd700; color: #333;">${escapeHtml(ownerName.charAt(0).toUpperCase())}</div>
                <div class="member-info">
                    <div class="member-email">
                        <span class="member-display-name" style="color: #ffd700;">${escapeHtml(ownerName)}</span>
                         <span class="member-email-addr">(Owner)</span>
                         <button class="edit-name-btn" data-action="edit-name" data-email="OWNER">Edit</button>
                    </div>
                    <div class="member-location ${ownerLocation.address ? 'has-address' : ''}">
                        <span class="member-coords">Lat: ${lat}, Lon: ${lon}</span>
                        ${ownerLocation.address ? `<div class="member-address" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">${escapeHtml(ownerLocation.address)}</div>` : ''}
                    </div>
                </div>
                <div class="member-meta">
                    <div class="battery ${batteryClass}">
                        <span>${batt}%</span>
                        <small>${escapeHtml(ownerLocation.battery_status || 'unplugged')}</small>
                    </div>
                    <div class="timestamp" style="font-size: 0.7rem;">${escapeHtml(timeStr)}</div>
                </div>
            </div>
         `;
        htmlContent += ownerCard;
    }

    htmlContent += data.locations.map((member, index) => {
        const batteryClass = getBatteryClass(member.battery);
        const timeStr = formatRelativeTime(member.timestamp);
        const displayName = names[member.email] || member.email;
        const isDefault = displayName === member.email;
        const isSelected = selectedMemberEmails.has(member.email);

        // Calculate distance if user location is available
        let distanceHtml = '';
        if (userLocation) {
            const dist = calculateDistance(userLocation.lat, userLocation.lng, member.latitude, member.longitude);
            distanceHtml = `<div class="member-distance">${dist.toFixed(2)} km away</div>`;
        }

        return `
            <div class="member-card">
                 <div class="member-checkbox-container">
                    <input type="checkbox" class="member-checkbox" 
                        ${isSelected ? 'checked' : ''} 
                        data-action="toggle-selection" data-email="${escapeHtml(member.email)}"
                    >
                </div>
                <div class="avatar" style="background: ${getMemberColorByIndex(index).hex}; color: white;">${escapeHtml(member.email_initial)}</div>
                <div class="member-info">
                    <div class="member-email">
                        <span class="member-display-name" data-action="show-single-map" data-email="${escapeHtml(member.email)}" style="cursor: pointer; text-decoration: underline;">${escapeHtml(displayName)}</span>
                        <button class="edit-name-btn" data-action="edit-name" data-email="${escapeHtml(member.email)}">Edit</button>
                    </div>
                    <div class="member-location ${member.address ? 'has-address' : ''}">
                        <span class="member-coords">Lat: ${member.latitude.toFixed(5)}, Lon: ${member.longitude.toFixed(5)}</span>
                        ${member.address ? `<div class="member-address" style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">${escapeHtml(member.address)}</div>` : ''}
                        ${distanceHtml}
                    </div>
                </div>
                <div class="member-meta">
                    <div class="battery ${batteryClass}">
                        <span>${member.battery}%</span>
                        <small>${escapeHtml(member.battery_status)}</small>
                    </div>
                    <div class="timestamp" style="font-size: 0.7rem;">${escapeHtml(timeStr)}</div>
                </div>
            </div>
        `;
    }).join('');

    elements.membersList.innerHTML = htmlContent;
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
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};

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

    elements.mapView.classList.add('active');
    elements.dashboardView.classList.remove('active');

    // Initial fetch to get member data for map
    fetchData();
}

function updateMapMarkers() {
    if (!map) {
        map = L.map('mapContainer').setView([0, 0], 2);
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
            if (e.originalEvent) {
                isAutoCenterEnabled = false;
                const btn = document.getElementById('dynamicRecenterBtn');
                if (btn) btn.style.display = 'block';
            }
        });

    }

    const bounds = L.latLngBounds();
    let hasMarkers = false;

    // 1. Members
    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};

    // Remove old markers that are no longer selected or valid
    for (const [email, m] of Object.entries(memberMarkers)) {
        if (!selectedMemberEmails.has(email)) {
            map.removeLayer(m);
            delete memberMarkers[email];
        }
    }

    // Create a map for fast lookup to avoid O(N*M) complexity
    const locationsMap = new Map();
    lastLocations.forEach((m, index) => {
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
            const displayName = names[email] || email;
            const popupContent = `<b>${escapeHtml(displayName)}</b><br>${escapeHtml(new Date(member.timestamp * 1000).toLocaleString())}<br>Bat: ${member.battery}%${member.address ? `<br>${escapeHtml(member.address)}` : ''}`;

            if (memberMarkers[email]) {
                memberMarkers[email].setLatLng([lat, lng]).setPopupContent(popupContent);
                // Update tooltip if exists, or rebind? Leaflet doesn't have setTooltipContent handy on marker if not opened? 
                // It does: setTooltipContent
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
            hasMarkers = true;
        }
    }

    // Owner Marker
    if (showOwnerLocation && ownerLocation) {
        const lat = ownerLocation.latitude || ownerLocation.lat;
        const lng = ownerLocation.longitude || ownerLocation.lon;
        const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
        // Ensure we use the config name, fallback to "API Owner"
        const ownerName = config.apiUserName ? config.apiUserName : "API Owner";
        const timestamp = ownerLocation.timestamp || ownerLocation.tst;
        const timeStr = timestamp ? formatRelativeTime(timestamp) : 'Unknown time';
        const batt = ownerLocation.battery || ownerLocation.batt || '?';

        if (lat && lng) {
            const popupContent = `<b>${escapeHtml(ownerName)}</b><br>${escapeHtml(timeStr)}<br>Bat: ${batt}%${ownerLocation.address ? `<br>${escapeHtml(ownerLocation.address)}` : ''}`;

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
            hasMarkers = true;
        }
    } else if (ownerMarker && !showOwnerLocation) {
        map.removeLayer(ownerMarker);
        ownerMarker = null;
    }

    // 3. User (Viewer) Location
    if (userLocation && proximityEnabled) {
        if (!userMarker) {
            updateUserMarker(); // This creates it
        } else {
            userMarker.setLatLng([userLocation.lat, userLocation.lng]);
        }
        bounds.extend([userLocation.lat, userLocation.lng]);
        hasMarkers = true; // Count user as a marker for bounds? Maybe.
    }

    // Unified Map Overlay
    const header = document.querySelector('.map-header');
    header.innerHTML = ''; // Clear previous

    const card = document.createElement('div');
    card.className = 'map-unified-card';

    // 1. Collect all users to show
    const usersToShow = [];

    // Owner (if enabled)
    if (showOwnerLocation && ownerLocation) {
        const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
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
                name: names[email] || email,
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
        <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(titleText)}</span>
            <span id="mapReloadCountdown" style="font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0;">(${secondsToRefresh}s)</span>
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

    const closeBtn = document.createElement('button');
    closeBtn.innerText = 'Close'; // Renamed to simple "Close"
    closeBtn.className = 'edit-name-btn';
    closeBtn.style.padding = '0.3rem 1rem';
    closeBtn.style.fontSize = '0.8rem';
    closeBtn.style.background = 'rgba(255, 255, 255, 0.1)'; // Better contrast
    closeBtn.style.color = 'var(--text-primary)';
    closeBtn.onclick = closeMap;

    buttonsContainer.appendChild(recenterBtn);
    buttonsContainer.appendChild(closeBtn);

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
        // Adjust padding based on overlay height assumption (Bottom overlay on mobile)
        const isMobile = window.innerWidth <= 600;
        const padding = isMobile ? [20, 20] : [50, 50];
        const bottomPadding = isMobile ? 300 : 50; // Extra room for the footer card

        map.fitBounds(bounds, {
            padding: padding,
            paddingBottomRight: [0, bottomPadding],
            maxZoom: 18
        });
    }

    // updateProximityUI(lat, lng); // Requires single target, disable if multiple
    if (selectedMemberEmails.size === 1) {
        const entry = locationsMap.get(Array.from(selectedMemberEmails)[0]);
        if (entry) updateProximityUI(entry.member.latitude, entry.member.longitude);
    } else {
        elements.distanceBadge.style.display = 'none';
    }
}

// Fallback Logic variables
let locationTimeout = null;

function startUserTracking() {
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
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
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
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    userLocation = null;
    elements.distanceBadge.style.display = 'none';
}

function updateUserMarker() {
    if (!map || !userLocation || !proximityEnabled) return;

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
    }
}

function saveModalName() {
    const newName = elements.modalInput.value.trim();

    if (currentEditingEmail === 'OWNER') {
        // Update Config
        const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
        config.apiUserName = newName;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
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
        const config = JSON.parse(localStorage.getItem(CONFIG_KEY)); // refresh config
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

    // Geocode Toggle
    elements.geocodeEnabled.addEventListener('change', (e) => {
        elements.geocodeSettings.style.display = e.target.checked ? 'block' : 'none';
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
            const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
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
        if (proximityEnabled) startUserTracking(); else stopUserTracking();
        updateMapMarkers();
    });
}

init();
