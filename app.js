const CONFIG_KEY = 'family_tracker_config';
const NAMES_KEY = 'family_tracker_names';
let refreshInterval;
let countdownInterval;
let secondsToRefresh = 10;

const elements = {
    configView: document.getElementById('configView'),
    dashboardView: document.getElementById('dashboardView'),
    baseUrlInput: document.getElementById('baseUrl'),
    apiKeyInput: document.getElementById('apiKey'),
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
    recenterMapBtn: document.getElementById('recenterMapBtn')
};

let currentEditingEmail = null;
let html5QrCode = null;
let map = null;
let marker = null;
let currentMapMemberEmail = null;
let userMarker = null;
let userLocation = null;
let proximityEnabled = false;
let watchId = null;
let lastLocations = [];
let isAutoCenterEnabled = true;

// Initialize
function init() {
    registerServiceWorker();
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if (config && config.baseUrl && config.apiKey) {
        showDashboard();
        startTracking();
        // Try to start user tracking globally for dashboard distances
        startUserTracking();
    } else {
        showConfig();
    }
}

function showConfig() {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    elements.baseUrlInput.value = config.baseUrl || '';
    elements.apiKeyInput.value = config.apiKey || '';
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

    if (!baseUrl || !apiKey) {
        alert("Please fill in both fields");
        return;
    }

    localStorage.setItem(CONFIG_KEY, JSON.stringify({ baseUrl, apiKey }));
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
        updateUI(data);
        elements.lastUpdated.innerText = `Last updated: ${new Date().toLocaleTimeString([], { hour12: false })}`;
    } catch (error) {
        console.error('Fetch error:', error);
        elements.lastUpdated.innerText = `Error: API failed`;
    } finally {
        elements.refreshStatus.classList.remove('refreshing');
    }
}

function updateUI(data) {
    if (!data.locations || !Array.isArray(data.locations)) return;

    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};

    elements.membersList.innerHTML = data.locations.map(member => {
        const batteryClass = getBatteryClass(member.battery);
        const timeStr = formatRelativeTime(member.timestamp);
        const displayName = names[member.email] || member.email;
        const isDefault = displayName === member.email;

        // Calculate distance if user location is available
        let distanceHtml = '';
        if (userLocation) {
            const dist = calculateDistance(userLocation.lat, userLocation.lng, member.latitude, member.longitude);
            distanceHtml = `<div class="member-distance">${dist.toFixed(2)} km away</div>`;
        }

        if (currentMapMemberEmail === member.email) {
            updateMapPosition(member, displayName);
        }

        return `
            <div class="member-card">
                <div class="avatar">${member.email_initial}</div>
                <div class="member-info">
                    <div class="member-email">
                        <span class="member-display-name" onclick="showMap('${member.email}')" style="cursor: pointer; text-decoration: underline;">${displayName}</span>
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
    currentMapMemberEmail = email;
    elements.mapView.classList.add('active');
    elements.dashboardView.classList.remove('active');

    // Initial fetch to get member data for map
    fetchData();
}

function updateMapPosition(member, displayName) {
    const lat = member.latitude;
    const lng = member.longitude;
    const timeStr = formatRelativeTime(member.timestamp);

    elements.mapUserName.innerText = displayName;
    elements.mapUserEmail.innerText = member.email;
    elements.mapBattery.innerText = `Battery: ${member.battery}% (${member.battery_status})`;
    elements.mapLastSeen.innerText = `Seen: ${timeStr}`;
    elements.mapLastRefresh.innerText = `Update: ${new Date().toLocaleTimeString([], { hour12: false })}`;

    if (!map) {
        map = L.map('mapContainer').setView([lat, lng], 18);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        marker = L.marker([lat, lng]).addTo(map);

        // Detect user interaction to disable auto-centering
        map.on('dragstart', () => {
            isAutoCenterEnabled = false;
            elements.recenterMapBtn.style.display = 'block';
        });

        map.on('zoomstart', (e) => {
            // Leaflet zoom events often have the original event if user-triggered
            if (e.originalEvent) {
                isAutoCenterEnabled = false;
                elements.recenterMapBtn.style.display = 'block';
            }
        });

        // Handle proximity toggle
        elements.toggleProximity.addEventListener('change', (e) => {
            proximityEnabled = e.target.checked;
            isAutoCenterEnabled = true; // Re-enable centering when toggled
            elements.recenterMapBtn.style.display = 'none';
            if (proximityEnabled) {
                startUserTracking();
            } else {
                stopUserTracking();
            }
            // Trigger an immediate manual update/center
            const member = lastLocations.find(m => m.email === currentMapMemberEmail);
            if (member) updateMapPosition(member, elements.mapUserName.innerText);
        });

        // Auto-enable if possible
        if ("geolocation" in navigator) {
            navigator.permissions.query({ name: 'geolocation' }).then(result => {
                if (result.state === 'granted') {
                    elements.toggleProximity.checked = true;
                    proximityEnabled = true;
                    isAutoCenterEnabled = true;
                    startUserTracking();
                    // Immediate trigger
                    const member = lastLocations.find(m => m.email === currentMapMemberEmail);
                    if (member) updateMapPosition(member, elements.mapUserName.innerText);
                }
            });
        }
    } else {
        marker.setLatLng([lat, lng]);

        if (isAutoCenterEnabled) {
            if (proximityEnabled && userLocation) {
                const bounds = L.latLngBounds([
                    [lat, lng],
                    [userLocation.lat, userLocation.lng]
                ]);
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
            } else {
                map.setView([lat, lng], map.getZoom());
            }
        }
    }

    updateProximityUI(lat, lng);
    updateUserMarker(); // Ensure user marker is updated/shown whenever map updates
}

function startUserTracking() {
    if (!("geolocation" in navigator)) return;

    if (watchId) navigator.geolocation.clearWatch(watchId);

    watchId = navigator.geolocation.watchPosition((position) => {
        userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        updateUserMarker();

        // Update dashboard distances if visible
        if (elements.dashboardView.classList.contains('active')) {
            updateUI({ locations: lastLocations });
        }

        if (currentMapMemberEmail) {
            const member = lastLocations.find(m => m.email === currentMapMemberEmail);
            if (member) {
                updateProximityUI(member.latitude, member.longitude);
                if (map && isAutoCenterEnabled) {
                    const bounds = L.latLngBounds([
                        [member.latitude, member.longitude],
                        [userLocation.lat, userLocation.lng]
                    ]);
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
                }
            }
        }
    }, (error) => {
        console.error("Geolocation error:", error);
    }, { enableHighAccuracy: true });
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
    const member = lastLocations.find(m => m.email === currentMapMemberEmail);
    if (member) updateMapPosition(member, elements.mapUserName.innerText);
}

function closeMap() {
    stopUserTracking();
    elements.mapView.classList.remove('active');
    elements.dashboardView.classList.add('active');
    currentMapMemberEmail = null;
    if (map) {
        map.remove();
        map = null;
        marker = null;
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
