// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/**
 * @fileoverview Main application entry point.
 * Orchestrates all modules and handles application initialization.
 * @module js/main
 * @version 2.12.1
 */

// ==========================================
// Module Imports
// ==========================================

import { escapeHtml, formatRelativeTime, getBatteryClass, getMemberColor, getMemberColorByIndex, calculateDistance, formatTime } from './utils.js';
import {
    getConfig,
    invalidateConfig,
    processUrlConfiguration,
    generateConfigUrl,
    copyConfigUrl,
    CONFIG_KEY,
    NAMES_KEY
} from './config.js';
import {
    resolveAddress,
    lastKnownAddresses,
    addressCache
} from './geocoding.js';
import {
    fetchWithRetry,
    secondsToRefresh,
    setSecondsToRefresh,
    startTracking,
    stopTracking,
    shareLocation
} from './api.js';
import {
    selectedMemberEmails,
    setSelectedMembers,
    toggleMemberSelection as toggleMemberSelectionState,
    lastLocations,
    ownerLocation,
    isSharedMode,
    shareToken,
    sharedLocations,
    sharedStyleUrl,
    setSharedStyleUrl,
    setSharedMode,
    currentEditingEmail,
    setCurrentEditingEmail,
    locationWatchId,
    locationTimeout,
    setLocationWatchId,
    setLocationTimeout,
    map,
    userPosition,
    setOwnerLocation
} from './state.js';

// Hide H1 immediately if shared mode is detected
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('token') || urlParams.has('share_token')) {
    const h1 = document.querySelector('h1');
    if (h1) h1.style.display = 'none';
    const app = document.getElementById('app');
    if (app) {
        app.style.maxWidth = 'none';
        app.classList.add('shared-mode-init');
    }
}
import {
    loadMapEngine,
    showMap as showMapView,
    showSingleMemberMap,
    closeMap,
    recenterMap,
    cleanupMapMarkers,
    updateMapMarkers as updateMapMarkersImpl,
    startUserTracking,
    stopUserTracking
} from './map.js';
import {
    elements,
    showDashboard,
    showConfig,
    showMap,
    updateUI,
    updateCountdown,
    openModal,
    closeModal,
    showToast,
    toggleMemberSelection as toggleMemberSelectionUI,
    editName,
    saveModalName as saveModalNameUI
} from './ui.js';

// Wrapper for map update to inject state
function updateMapMarkers() {
    const proximityEnabled = elements.toggleProximity ? elements.toggleProximity.checked : true;

    updateMapMarkersImpl(
        lastLocations,
        selectedMemberEmails,
        ownerLocation,
        userPosition,
        isSharedMode,
        sharedStyleUrl,
        sharedLocations,
        showOwnerLocation,
        proximityEnabled,
        secondsToRefresh,
        sharedExpiresAt,
        elements,
        formatRelativeTime,
        escapeHtml,
        updateCountdown,
        () => {
            closeMap();
            showDashboard();
        }
    );
}

// ==========================================
// Application State
// ==========================================

let serverConfigured = false;
let html5QrCode = null;
let showOwnerLocation = false;
let isMapOverlayCollapsed = false;
let sharedExpiresAt = null;
let wakeLock = null;

// ==========================================
// Wake Lock Management
// ==========================================

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock active');
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock released');
            });
        } catch (err) {
            console.error(`Wake Lock error: ${err.name}, ${err.message}`);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// ==========================================
// Service Worker Registration
// ==========================================

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

// ==========================================
// Shared Mode Handling
// ==========================================

async function checkServerStatus() {
    try {
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
        console.log("Server component not detected.");
    }
}

async function fetchSharedData() {
    try {
        if (isSharedMode) setSecondsToRefresh(10);

        const apiPath = window.location.pathname.replace('index.html', '').replace(/\/$/, "") + '/api/shared/location';
        const response = await fetch(`${apiPath}?token=${shareToken}`);

        if (response.status === 410) {
            if (isSharedMode) {
                showToast("This sharing link has expired.", "error");
                clearInterval(refreshInterval);
                setTimeout(() => {
                    window.location.href = window.location.pathname;
                }, 2000);
            } else {
                console.log("Shared link expired");
            }
            return;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // Store shared data
        sharedLocations.length = 0;
        sharedLocations.push(data);

        // Update style if changed
        if (data.styleUrl && data.styleUrl !== sharedStyleUrl) {
            setSharedStyleUrl(data.styleUrl);
            if (map) {
                updateMapMarkers();
            }
        }

        if (data.expires_at) {
            sharedExpiresAt = data.expires_at * 1000;
        }

        if (isSharedMode) {
            // View Only Mode: Replace everything
            lastLocations.length = 0;
            lastLocations.push(data);
            selectedMemberEmails.add(data.email);
            if (elements.mapView.classList.contains('active')) {
                updateMapMarkers();
            }
        } else {
            // Merge Mode: Update if active
            if (lastLocations.length > 0 || ownerLocation) {
                const combined = {
                    locations: [...lastLocations, ...sharedLocations]
                };
                if (elements.dashboardView.classList.contains('active')) {
                    updateUI(combined, getConfig, serverConfigured, selectedMemberEmails, ownerLocation, userPosition);
                }
                if (elements.mapView.classList.contains('active')) {
                    updateMapMarkers();
                }
            }
        }

    } catch (e) {
        console.error("Shared fetch error", e);
    }
}

function initSharedMode(token) {
    setSharedMode(token, [], null);

    // Hide UI
    elements.configView.classList.remove('active');
    elements.dashboardView.classList.remove('active');
    elements.mapView.classList.add('active');

    // Hide header and app container in shared mode
    const h1 = document.querySelector('h1');
    const appContainer = document.getElementById('app');
    if (h1) h1.style.display = 'none';
    if (appContainer) appContainer.style.maxWidth = 'none';

    // Force Keep Awake
    requestWakeLock();

    // Setup Map Config Defaults if missing
    if (!getConfig()) {
        const tempConfig = {
            mapEngine: 'maplibre',
            mapStyleUrl: './style.json',
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
    setSecondsToRefresh(10);
    countdownInterval = setInterval(() => {
        let newSeconds = secondsToRefresh - 1;
        if (newSeconds < 0) newSeconds = 10;
        setSecondsToRefresh(newSeconds);
        updateCountdown(newSeconds, sharedExpiresAt, elements);
    }, 1000);
}

function initMergeMode(token) {
    console.log("Entering Shared Merge Mode");
    setSharedMode(token, [], null);

    // Start normal tracking will happen in main init flow
    // We just need to start polling the shared data
    setInterval(fetchSharedData, 10000);
    fetchSharedData();
}

// ==========================================
// Main Data Fetch
// ==========================================

let refreshInterval = null;
let countdownInterval = null;

async function fetchOwnerLocation(config) {
    if (!config.apiUserName) {
        setOwnerLocation(null);
        return;
    }

    try {
        // Fetch last point for the API key owner
        // We use a very old start date to ensure we find the last point
        const params = new URLSearchParams({
            api_key: config.apiKey,
            start_at: '2000-01-01',
            per_page: '1',
            order: 'desc'
        });

        const response = await fetchWithRetry(
            `${config.baseUrl}/api/v1/points?${params.toString()}`
        );

        if (response.ok) {
            const data = await response.json();
            // API returns array of points
            let point = null;
            if (Array.isArray(data) && data.length > 0) {
                point = data[0];
            } else if (data.points && Array.isArray(data.points) && data.points.length > 0) {
                point = data.points[0];
            }

            if (point) {
                const loc = {
                    email: 'OWNER',
                    latitude: point.latitude,
                    lon: point.longitude,
                    lat: point.latitude,
                    longitude: point.longitude,
                    battery: point.battery,
                    timestamp: point.timestamp,
                    address: null
                };
                if (config.fixedLat && config.fixedLon) {
                    loc.latitude = parseFloat(config.fixedLat);
                    loc.longitude = parseFloat(config.fixedLon);
                }
                setOwnerLocation(loc);
            } else {
                setOwnerLocation(null);
            }
        } else {
            console.warn('Owner location fetch failed:', response.status);
            setOwnerLocation(null);
        }
    } catch (error) {
        console.error('Owner location fetch error:', error);
        setOwnerLocation(null);
    }
}

async function fetchData() {
    const config = getConfig();
    if (!config) return;

    setSecondsToRefresh(10);
    elements.refreshStatus.classList.add('refreshing');

    try {
        const ownerFetchPromise = fetchOwnerLocation(config);

        const response = await fetchWithRetry(`${config.baseUrl}/api/v1/families/locations?api_key=${config.apiKey}`);
        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        lastLocations.length = 0;
        lastLocations.push(...(data.locations || []));

        await ownerFetchPromise;

        // Handle "ALL" selection
        if (selectedMemberEmails.has('ALL')) {
            selectedMemberEmails.clear();
            lastLocations.forEach(loc => selectedMemberEmails.add(loc.email));
        }

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

        updateUI(data, getConfig, serverConfigured, selectedMemberEmails, ownerLocation, userPosition, () => {
            showMap();
            fetchData();
        });

        // Update map if active
        if (elements.mapView.classList.contains('active')) {
            updateMapMarkers();
        }

        elements.lastUpdated.innerText = `Last updated: ${formatTime(new Date(), true)}`;

    } catch (error) {
        console.error('Fetch failed:', error);
        elements.refreshStatus.innerText = 'Failed to fetch data';
    } finally {
        elements.refreshStatus.classList.remove('refreshing');
    }
}

function startTrackingWrapper() {
    const config = getConfig();
    if (config && config.keepAwakeEnabled) {
        requestWakeLock();
    }

    fetchData();
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);

    refreshInterval = setInterval(fetchData, 10000);
    countdownInterval = setInterval(() => {
        let newSeconds = secondsToRefresh - 1;
        if (newSeconds < 0) newSeconds = 10;
        setSecondsToRefresh(newSeconds);
        updateCountdown(newSeconds, sharedExpiresAt, elements);
    }, 1000);
}

function stopTrackingWrapper() {
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);
    releaseWakeLock();
}

// ==========================================
// Configuration Management
// ==========================================

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

    if (!baseUrlRaw || !apiKeyRaw) {
        showToast('Base URL and API Key are required', 'warning');
        return;
    }

    // Validate and sanitize Base URL
    let baseUrl = baseUrlRaw;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'https://' + baseUrl;
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    try {
        new URL(baseUrl);
    } catch (e) {
        showToast('Invalid Base URL format', 'error');
        return;
    }

    // Validate API Key (basic check)
    const apiKey = apiKeyRaw;
    if (apiKey.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
        showToast('API Key format appears invalid', 'error');
        return;
    }

    const apiUserName = apiUserNameRaw || 'User';

    // Validate map style URL if provided
    let mapStyleUrl = mapStyleUrlRaw || './style.json';
    if (mapStyleUrl && mapStyleUrl !== './style.json') {
        try {
            new URL(mapStyleUrl);
        } catch (e) {
            showToast('Invalid Map Style URL format', 'error');
            return;
        }
    }

    // Validate geocoding settings
    let photonUrl = 'https://photon.komoot.io';
    let photonApiKey = '';

    if (geocodeEnabled) {
        if (photonUrlRaw) {
            photonUrl = photonUrlRaw;
            try {
                new URL(photonUrl);
            } catch (e) {
                showToast('Invalid Photon URL format', 'error');
                return;
            }
        }
        if (photonApiKeyRaw) {
            photonApiKey = photonApiKeyRaw;
        }
    }

    // Validate stationary settings
    let fixedLat = null;
    let fixedLon = null;
    if (stationaryEnabled) {
        if (!fixedLatRaw || !fixedLonRaw) {
            showToast('Both Latitude and Longitude are required for Stationary Mode', 'warning');
            return;
        }
        fixedLat = parseFloat(fixedLatRaw);
        fixedLon = parseFloat(fixedLonRaw);
        if (isNaN(fixedLat) || isNaN(fixedLon)) {
            showToast('Latitude and Longitude must be valid numbers', 'error');
            return;
        }
        if (fixedLat < -90 || fixedLat > 90) {
            showToast('Latitude must be between -90 and 90', 'error');
            return;
        }
        if (fixedLon < -180 || fixedLon > 180) {
            showToast('Longitude must be between -180 and 180', 'error');
            return;
        }
    }

    const config = {
        baseUrl,
        apiKey,
        apiUserName,
        mapEngine,
        mapStyleUrl,
        geocodeEnabled,
        photonUrl,
        photonApiKey,
        keepAwakeEnabled,
        stationaryEnabled,
        fixedLat,
        fixedLon
    };

    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    invalidateConfig();

    showDashboard();
    startTrackingWrapper();
    startUserTracking();
}

// ==========================================
// Event Listeners
// ==========================================

function setupEventListeners() {
    // Config save
    elements.saveBtn.addEventListener('click', saveConfig);

    // Logout
    elements.logoutBtn.addEventListener('click', () => {
        stopTrackingWrapper();
        stopUserTracking();
        showConfig();
    });

    // Modal
    elements.modalSaveBtn.addEventListener('click', () => {
        saveModalNameUI(currentEditingEmail, getConfig, invalidateConfig, fetchData, updateMapMarkers);
    });
    elements.modalCancelBtn.addEventListener('click', () => {
        closeModal(elements.modal);
        setCurrentEditingEmail(null);
    });
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) {
            closeModal(elements.modal);
            setCurrentEditingEmail(null);
        }
    });

    // Share config via URL
    elements.shareConfigBtn.addEventListener('click', async () => {
        const success = await copyConfigUrl(elements.shareStatus);
        if (success) {
            showToast('Configuration URL copied to clipboard!', 'success');
        } else {
            showToast('Failed to copy configuration URL', 'error');
        }
    });

    // Geocode toggle
    elements.geocodeEnabled.addEventListener('change', (e) => {
        elements.geocodeSettings.style.display = e.target.checked ? 'block' : 'none';
    });

    // Stationary toggle
    elements.stationaryEnabled.addEventListener('change', (e) => {
        elements.stationarySettings.style.display = e.target.checked ? 'block' : 'none';
    });

    // Map Proximity (Me) toggle
    if (elements.toggleProximity) {
        elements.toggleProximity.addEventListener('change', () => {
            updateMapMarkers();
        });
    }

    // Member List Interactions (Delegated)
    elements.membersList.addEventListener('click', (e) => {
        const target = e.target;

        // 1. Toggle Selection
        if (target.matches('input.member-checkbox')) {
            const email = target.dataset.email;
            toggleMemberSelectionUI(target, email, selectedMemberEmails);
            return;
        }

        // 2. Show Single Map
        const mapActionEl = target.closest('[data-action="show-single-map"]');
        if (mapActionEl) {
            const email = mapActionEl.dataset.email;
            if (email) {
                showSingleMemberMap(email, selectedMemberEmails, () => {
                    showMap();
                    fetchData();
                });
            }
            return;
        }

        // 3. Edit Name
        const editActionEl = target.closest('[data-action="edit-name"]');
        if (editActionEl) {
            const email = editActionEl.dataset.email;
            editName(email, getConfig, setCurrentEditingEmail);
            return;
        }
        // 4. Fallback: Card Click (Show Map)
        const card = target.closest(".member-card");
        if (card && !target.closest("input") && !target.closest("button")) {
             const email = card.getAttribute("data-member-email");
             const nameEl = card.querySelector(".member-display-name");
             if (email && nameEl && nameEl.getAttribute("data-action") === "show-single-map") {
                 showSingleMemberMap(email, selectedMemberEmails, () => {
                    showMap();
                    fetchData();
                });
             }
        }
    });
    // Map engine toggle
    elements.mapEngineInput.addEventListener('change', (e) => {
        elements.mapStyleGroup.style.display = e.target.value === 'maplibre' ? 'block' : 'none';
    });

    // QR Scanner
    if (elements.scanQrBtn) {
        elements.scanQrBtn.addEventListener('click', startScan);
    }
    if (elements.stopScanBtn) {
        elements.stopScanBtn.addEventListener('click', stopScan);
    }

    // Share location modal
    if (elements.shareLocationBtn) {
        elements.shareLocationBtn.addEventListener('click', () => {
            openModal(elements.shareModal);
        });
    }

    if (elements.closeShareModal) {
        elements.closeShareModal.addEventListener('click', () => {
            closeModal(elements.shareModal);
        });
    }

    // Duration button selection
    if (elements.durationBtns) {
        elements.durationBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                elements.durationBtns.forEach(b => b.classList.remove('is-selected'));
                const target = e.target.closest('.duration-btn');
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

                    if (navigator.share) {
                        try {
                            await navigator.share({
                                title: 'Track my location',
                                text: `Track my location on ${name}'s Family Locator`,
                                url: link
                            });
                            console.log('Shared successfully');
                        } catch (err) {
                            console.log('Error sharing:', err);
                        }
                    }
                } else {
                    showToast("Failed to generate link.", "error");
                }
            } catch (e) {
                console.error(e);
                showToast("Error connecting to server.", "error");
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
            showToast('Link copied to clipboard!', 'success');
        });
    }
}

// ==========================================
// QR Code Scanner
// ==========================================

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
        showToast("Unable to start camera. Please check permissions.", "error");
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

function sanitizeUrl(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    url = url.replace(/\/$/, '');
    const urlObj = new URL(url);
    return urlObj.href;
}

function validateApiKey(key) {
    if (key.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new Error('API Key format appears invalid');
    }
    return key;
}

function onScanSuccess(decodedText) {
    try {
        const data = JSON.parse(decodedText);

        if (!data.server_url || !data.api_key) {
            showToast("Invalid QR Code format. Missing server_url or api_key.", "error");
            return;
        }

        const validatedUrl = sanitizeUrl(data.server_url);
        const validatedKey = validateApiKey(data.api_key);

        elements.baseUrlInput.value = validatedUrl;
        elements.apiKeyInput.value = validatedKey;

        stopScan();
        showToast("QR Code scanned successfully!", "success");

    } catch (error) {
        if (error instanceof SyntaxError) {
            showToast("Invalid QR Code. Could not parse JSON.", "error");
        } else {
            showToast(`Invalid QR Code: ${error.message}`, "error");
        }
        console.error('QR code validation error:', error);
    }
}

// ==========================================
// Initialization
// ==========================================

function init() {
    console.log('Family Location Tracker v2.11.1 - ES6 Modules');

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
            selectedMemberEmails.add('ALL');
        } else {
            const emails = emailsParam.split(',').map(e => e.trim());
            emails.forEach(e => selectedMemberEmails.add(e));
        }
    }

    const config = getConfig();
    if (config && config.baseUrl && config.apiKey) {
        showDashboard();
        startTrackingWrapper();
        startUserTracking();

        // If we have URL params, switch to map immediately
        if (selectedMemberEmails.size > 0 || showOwnerLocation) {
            elements.mapView.classList.add('active');
            elements.dashboardView.classList.remove('active');
        }
    } else {
        showConfig();
    }

    // Expose for geocoding callbacks
    window.familyTracker = {
        get lastLocations() { return lastLocations; },
        get ownerLocation() { return ownerLocation; },
        updateUI: (data) => {
            // Re-render UI with current state
            const combinedData = { locations: [...lastLocations, ...sharedLocations] };
            updateUI(combinedData, getConfig, serverConfigured, selectedMemberEmails, ownerLocation, userPosition);
            if (elements.mapView.classList.contains('active')) {
                updateMapMarkers();
            }
        },
        getConfig
    };
}

// ==========================================
// Application Entry Point
// ==========================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { init };
