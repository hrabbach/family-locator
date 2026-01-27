// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.
const CONFIG_KEY = 'family_tracker_config';
const NAMES_KEY = 'family_tracker_names';
let refreshInterval;
let countdownInterval;
let secondsToRefresh = 10;

const elements = {
    configView: document.getElementById('configView'),
    dashboardView: document.getElementById('dashboardView'),
    baseUrlInput: document.getElementById('baseUrl'),
    baseUrlInput: document.getElementById('baseUrl'),
    apiKeyInput: document.getElementById('apiKey'),
    apiUserNameInput: document.getElementById('apiUserName'),
    saveBtn: document.getElementById('saveConfig'),
    logoutBtn: document.getElementById('logoutBtn'),
    membersList: document.getElementById('membersList'),
    lastUpdated: document.getElementById('lastUpdated'),
    refreshStatus: document.getElementById('refreshStatus'),
    scanQrBtn: document.getElementById('scanQrBtn'),
    qrReaderContainer: document.getElementById('qrReaderContainer'),
    stopScanBtn: document.getElementById('stopScanBtn'),
    modal: document.getElementById('modalBackdrop'),
    modalEmail: document.getElementById('modalEmail'),
    modalInput: document.getElementById('newNameInput'),
    modalSaveBtn: document.getElementById('saveModal'),
    modalCancelBtn: document.getElementById('cancelModal'),
    mapView: document.getElementById('mapView'),
    mapContainer: document.getElementById('mapContainer'),
    closeMapBtn: document.getElementById('closeMapBtn'),
    mapUserName: document.getElementById('mapUserName'),
    mapUserEmail: document.getElementById('mapUserEmail'),
    mapBattery: document.getElementById('mapBattery'),
    mapLastSeen: document.getElementById('mapLastSeen'),
    mapLastRefresh: document.getElementById('mapLastRefresh'),
    toggleProximity: document.getElementById('toggleProximity'),
    distanceBadge: document.getElementById('distanceBadge'),
    recenterMapBtn: document.getElementById('recenterMapBtn'),
    viewSelectedBtn: document.getElementById('viewSelectedBtn')
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

// Initialize
function init() {
    registerServiceWorker();

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
    elements.configView.classList.add('active');
    elements.dashboardView.classList.remove('active');
    stopTracking();
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW Registered', reg))
                .catch(err => console.log('SW Reg Failed', err));
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

    if (!baseUrl || !apiKey) {
        alert("Please fill in both fields");
        return;
    }

    localStorage.setItem(CONFIG_KEY, JSON.stringify({ baseUrl, apiKey, apiUserName }));
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
    fetchData();
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);

    refreshInterval = setInterval(fetchData, 10000);

    secondsToRefresh = 10;
    countdownInterval = setInterval(() => {
        secondsToRefresh--;
        if (secondsToRefresh <= 0) secondsToRefresh = 10;
        elements.refreshStatus.innerText = `Refreshing in ${secondsToRefresh}s`;
    }, 1000);
}

function stopTracking() {
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);
}

async function fetchData() {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if (!config) return;

    elements.refreshStatus.classList.add('refreshing');

    try {
        const response = await fetch(`${config.baseUrl}/api/v1/families/locations?api_key=${config.apiKey}`);
        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        lastLocations = data.locations || [];

        // Handle "ALL" selection now that we have data
        if (selectedMemberEmails.has('ALL')) {
            selectedMemberEmails.clear();
            lastLocations.forEach(loc => selectedMemberEmails.add(loc.email));
        }

        if (showOwnerLocation) {
            fetchOwnerLocation(config);
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
    elements.viewSelectedBtn.onclick = () => {
        showMap();
    };

    elements.membersList.innerHTML = data.locations.map(member => {
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
                        onchange="toggleMemberSelection(this, '${member.email}')"
                    >
                </div>
                <div class="avatar">${member.email_initial}</div>
                <div class="member-info">
                    <div class="member-email">
                        <span class="member-display-name" onclick="showSingleMemberMap('${member.email}')" style="cursor: pointer; text-decoration: underline;">${displayName}</span>
                        ${!isDefault ? `<span class="member-email-addr">(${member.email})</span>` : ''}
                        <button class="edit-name-btn" onclick="editName('${member.email}')">Edit</button>
                    </div>
                    <div class="member-location">
                        Lat: ${member.latitude.toFixed(5)}, Lon: ${member.longitude.toFixed(5)}
                        ${distanceHtml}
                    </div>
                </div>
                <div class="member-meta">
                    <div class="battery ${batteryClass}">
                        <span>${member.battery}%</span>
                        <small>${member.battery_status}</small>
                    </div>
                    <div class="timestamp">${timeStr}</div>
                </div>
            </div>
        `;
    }).join('');
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
    currentEditingEmail = email;
    elements.modalEmail.innerText = `For ${email}`;
    elements.modalInput.value = names[email] || "";
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

        map.on('dragstart', () => { isAutoCenterEnabled = false; elements.recenterMapBtn.style.display = 'block'; });
        map.on('zoomstart', (e) => { if (e.originalEvent) { isAutoCenterEnabled = false; elements.recenterMapBtn.style.display = 'block'; } });

        elements.toggleProximity.addEventListener('change', (e) => {
            proximityEnabled = e.target.checked;
            isAutoCenterEnabled = true;
            elements.recenterMapBtn.style.display = 'none';
            if (proximityEnabled) startUserTracking(); else stopUserTracking();
            updateMapMarkers();
        });

        if ("geolocation" in navigator) {
            navigator.permissions.query({ name: 'geolocation' }).then(result => {
                if (result.state === 'granted') {
                    elements.toggleProximity.checked = true;
                    proximityEnabled = true;
                    isAutoCenterEnabled = true;
                    startUserTracking();
                }
            });
        }
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

    // Add or update markers for selected members
    for (const email of selectedMemberEmails) {
        const member = lastLocations.find(m => m.email === email);
        if (member) {
            const lat = member.latitude;
            const lng = member.longitude;
            const displayName = names[email] || email;
            const popupContent = `<b>${displayName}</b><br>${new Date(member.timestamp * 1000).toLocaleString()}<br>Bat: ${member.battery}%`;

            if (memberMarkers[email]) {
                memberMarkers[email].setLatLng([lat, lng]).setPopupContent(popupContent);
            } else {
                memberMarkers[email] = L.marker([lat, lng]).addTo(map).bindPopup(popupContent);
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
            const popupContent = `<b>${ownerName}</b><br>${timeStr}<br>Bat: ${batt}%`;

            if (!ownerMarker) {
                const goldIcon = new L.Icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                });

                ownerMarker = L.marker([lat, lng], { icon: goldIcon }).addTo(map).bindPopup(popupContent);
            } else {
                ownerMarker.setLatLng([lat, lng]).setPopupContent(popupContent);
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

    // Update Header Info (If only 1 selected, show details, otherwise generic)
    if (selectedMemberEmails.size === 1) {
        const email = Array.from(selectedMemberEmails)[0];
        const member = lastLocations.find(m => m.email === email);
        if (member) {
            const displayName = names[email] || email;
            elements.mapUserName.innerText = displayName;
            elements.mapUserEmail.innerText = email;
            elements.mapBattery.innerText = `Battery: ${member.battery}%`;
            elements.mapLastSeen.innerText = formatRelativeTime(member.timestamp);
            elements.mapLastRefresh.innerText = `Updated: ${new Date().toLocaleTimeString()}`;
        }
    } else {
        elements.mapUserName.innerText = `${selectedMemberEmails.size} Members`;
        elements.mapUserEmail.innerText = showOwnerLocation ? "(+ Owner)" : "";
        elements.mapBattery.innerText = "";
        elements.mapLastSeen.innerText = "";
        elements.mapLastRefresh.innerText = `Updated: ${new Date().toLocaleTimeString()}`;
    }


    if (isAutoCenterEnabled && hasMarkers) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    }

    // Hide "Show My Location" toggle if showing owner
    // Match specific container structure in HTML: parent of label is div.mapProximity
    const mapProximityDiv = document.querySelector('.map-header .switch').parentElement;
    if (mapProximityDiv) {
        if (showOwnerLocation) {
            mapProximityDiv.style.display = 'none';
        } else {
            mapProximityDiv.style.display = 'flex';
        }
    }

    // updateProximityUI(lat, lng); // Requires single target, disable if multiple
    if (selectedMemberEmails.size === 1) {
        const member = lastLocations.find(m => m.email === Array.from(selectedMemberEmails)[0]);
        if (member) updateProximityUI(member.latitude, member.longitude);
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
    elements.recenterMapBtn.style.display = 'none';
    updateMapMarkers();
}

function closeMap() {
    stopUserTracking();
    elements.mapView.classList.remove('active');
    elements.dashboardView.classList.add('active');
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
    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
    const newName = elements.modalInput.value.trim();

    if (newName === "") {
        delete names[currentEditingEmail];
    } else {
        names[currentEditingEmail] = newName;
    }

    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
    closeModal();
    fetchData();
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

// Event Listeners
elements.saveBtn.addEventListener('click', saveConfig);
elements.logoutBtn.addEventListener('click', showConfig);
elements.modalSaveBtn.addEventListener('click', saveModalName);
elements.modalCancelBtn.addEventListener('click', closeModal);
elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) closeModal();
});
elements.scanQrBtn.addEventListener('click', startScan);
elements.stopScanBtn.addEventListener('click', stopScan);
elements.closeMapBtn.addEventListener('click', closeMap);
elements.recenterMapBtn.addEventListener('click', recenterMap);

init();
