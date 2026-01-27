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

    // Buttons
    saveBtn: document.getElementById('saveConfig'),
    logoutBtn: document.getElementById('logoutBtn'),
    scanQrBtn: document.getElementById('scanQrBtn'),
    stopScanBtn: document.getElementById('stopScanBtn'),
    viewSelectedBtn: document.getElementById('viewSelectedBtn'),

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
        } else {
            // Always fetch owner location now for the dashboard card
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
    elements.viewSelectedBtn.onclick = () => showMap();

    elements.membersList.innerHTML = '';

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
                <div class="avatar" style="background: #ffd700; color: #333;">O</div>
                <div class="member-info">
                    <div class="member-email">
                        <span class="member-display-name" style="color: #ffd700;">${ownerName}</span>
                         <span class="member-email-addr">(Owner)</span>
                         <button class="edit-name-btn" onclick="editName('OWNER')">Edit</button>
                    </div>
                    <div class="member-location">
                        Lat: ${lat}, Lon: ${lon}
                    </div>
                </div>
                <div class="member-meta">
                    <div class="battery ${batteryClass}">
                        <span>${batt}%</span>
                    </div>
                    <div class="timestamp">${timeStr}</div>
                </div>
            </div>
         `;
        elements.membersList.innerHTML += ownerCard;
    }

    elements.membersList.innerHTML += data.locations.map(member => {
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
                // Update tooltip if exists, or rebind? Leaflet doesn't have setTooltipContent handy on marker if not opened? 
                // It does: setTooltipContent
                memberMarkers[email].setTooltipContent(displayName);
            } else {
                memberMarkers[email] = L.marker([lat, lng])
                    .addTo(map)
                    .bindPopup(popupContent)
                    .bindTooltip(displayName, { permanent: true, direction: 'bottom', className: 'marker-label' });
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

                ownerMarker = L.marker([lat, lng], { icon: goldIcon })
                    .addTo(map)
                    .bindPopup(popupContent)
                    .bindTooltip(ownerName, { permanent: true, direction: 'bottom', className: 'marker-label' });
            } else {
                ownerMarker.setLatLng([lat, lng]).setPopupContent(popupContent);
                ownerMarker.setTooltipContent(ownerName);
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
        const member = lastLocations.find(m => m.email === email);
        if (member) {
            usersToShow.push({
                name: names[email] || email,
                email: email,
                timestamp: member.timestamp,
                battery: member.battery,
                isOwner: false,
                initial: member.email_initial
            });
        }
    });

    // 2. Build Card Content
    // Header
    const titleText = usersToShow.length === 1
        ? usersToShow[0].name
        : `Tracking ${usersToShow.length} Members`;

    // Toggle chevron
    const chevron = `<span style="font-size: 0.8rem; transform: rotate(0deg); transition: transform 0.2s;">▼</span>`;

    const cardHeader = document.createElement('div');
    cardHeader.className = 'map-card-header';
    cardHeader.innerHTML = `<span>${titleText}</span> ${usersToShow.length > 1 ? chevron : ''}`;

    // Body (List of users)
    const cardBody = document.createElement('div');
    cardBody.className = 'map-card-body';

    if (usersToShow.length === 0) {
        cardBody.innerHTML = `<div class="map-member-row" style="justify-content: center; color: var(--text-secondary);">No members selected</div>`;
    } else {
        usersToShow.forEach(u => {
            const timeStr = formatRelativeTime(u.timestamp);
            const row = document.createElement('div');
            row.className = `map-member-row ${u.isOwner ? 'is-owner' : ''}`;
            row.innerHTML = `
                <div class="avatar-small" style="background: ${u.isOwner ? '#ffd700' : 'var(--accent-color)'}; color: #333;">${u.initial}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 500; font-size: 0.9rem; color: ${u.isOwner ? '#ffd700' : 'var(--text-primary)'}">${u.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">
                        ${u.battery >= 0 ? `Bat: ${u.battery}% • ` : ''}${timeStr}
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
            const isCollapsed = cardBody.classList.contains('collapsed');
            if (isCollapsed) {
                cardBody.classList.remove('collapsed');
                cardHeader.querySelector('span:last-child').style.transform = 'rotate(0deg)';
            } else {
                cardBody.classList.add('collapsed');
                cardHeader.querySelector('span:last-child').style.transform = 'rotate(-90deg)';
            }
        };
    } else {
        // Reset transform if single user
        // cardBody.style.display = 'block'; // ensure visible
    }


    if (isAutoCenterEnabled && hasMarkers) {
        // Adjust padding based on overlay height assumption
        map.fitBounds(bounds, { padding: [50, 50], paddingTopLeft: [0, 250], maxZoom: 18 });
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
// attributes removed from elements object, listeners handled dynamically
// elements.closeMapBtn.addEventListener('click', closeMap);
// elements.recenterMapBtn.addEventListener('click', recenterMap);

init();
