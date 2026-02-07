// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/**
 * @fileoverview User interface management and DOM manipulation.
 * @module js/ui
 * @version 2.9.0
 */

import { escapeHtml, formatRelativeTime, getBatteryClass, getMemberColor, getMemberColorByIndex, calculateDistance } from './utils.js';
import { NAMES_KEY } from './config.js';
import { lastKnownAddresses } from './geocoding.js';

// ==========================================
// DOM Element References
// ==========================================

export const elements = {
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

// ==========================================
// View Management - Simple Functions
// ==========================================

export function showDashboard() {
    elements.configView.classList.remove('active');
    elements.mapView.classList.remove('active');
    elements.dashboardView.classList.add('active');
}

export function showConfig() {
    elements.dashboardView.classList.remove('active');
    elements.mapView.classList.remove('active');
    elements.configView.classList.add('active');
}

export function showMap() {
    elements.configView.classList.remove('active');
    elements.dashboardView.classList.remove('active');
    elements.mapView.classList.add('active');
}

// ==========================================
// Modal Management
// ==========================================

export function openModal(modalElement) {
    if (modalElement) {
        modalElement.classList.add('active');
    }
}

export function closeModal(modalElement) {
    if (modalElement) {
        modalElement.classList.remove('active');
    }
}

// ==========================================
// Notifications/Toasts - TODO
// ==========================================

export function showToast(message, duration = 3000) {
    // TODO: Implement toast notification system
    console.log('Toast:', message);
}

// ==========================================
// UI Update Functions
// ==========================================

export function updateCountdown(secondsToRefresh, sharedExpiresAt, elements) {
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

    return secondsToRefresh;
}

// ==========================================
// Member Selection
// ==========================================

export function toggleMemberSelection(checkbox, email, selectedMemberEmails) {
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

// ==========================================
// Name Editing (Modal)
// ==========================================

export function editName(email, getConfigFn, currentEditingEmailSetter) {
    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};
    const config = getConfigFn() || {};

    currentEditingEmailSetter(email);

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

export function saveModalName(currentEditingEmail, getConfigFn, invalidateConfigFn, fetchDataCallback, updateMapMarkersFn) {
    const newName = elements.modalInput.value.trim();

    if (currentEditingEmail === 'OWNER') {
        // Update Config
        const CONFIG_KEY = 'family_tracker_config';
        const config = getConfigFn() || {};
        config.apiUserName = newName;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        invalidateConfigFn();
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

    closeModal(elements.modal);

    // Refresh UI to show changes
    if (elements.mapView.classList.contains('active')) {
        updateMapMarkersFn();
    } else {
        // Clear and refetch for dashboard
        elements.membersList.innerHTML = '';
        fetchDataCallback();
    }
}

// ==========================================
// Main UI Update Function
// ==========================================

export function updateUI(data, getConfigFn, serverConfigured, selectedMemberEmails, ownerLocation, userLocation) {
    if (!data.locations || !Array.isArray(data.locations)) return;

    const config = getConfigFn() || {};
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
        updateMemberCardContent(card, ownerLocation, config, names, true, -1, selectedMemberEmails, userLocation);
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
        updateMemberCardContent(card, member, config, names, false, index, selectedMemberEmails, userLocation);
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

// ==========================================
// Member Card Content Update (Complex!)
// ==========================================

export function updateMemberCardContent(card, member, config, names, isOwner, index, selectedMemberEmails, userLocation) {
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
        name: displayName,
        address: member.address || null  // Include address in comparison
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
