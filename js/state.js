// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/**
 * @fileoverview Centralized application state management.
 * Prevents circular dependencies and provides single source of truth.
 * @module js/state
 * @version 2.12.1
 */

// ==========================================
// Member Selection State
// ==========================================

export let selectedMemberEmails = new Set();

export function setSelectedMembers(emails) {
    selectedMemberEmails = emails instanceof Set ? emails : new Set(emails);
}

export function toggleMemberSelection(email) {
    if (selectedMemberEmails.has(email)) {
        selectedMemberEmails.delete(email);
    } else {
        selectedMemberEmails.add(email);
    }
}

export function clearSelectedMembers() {
    selectedMemberEmails.clear();
}

// ==========================================
// Location Data State
// ==========================================

export let lastLocations = [];
export let ownerLocation = null;

export function setLastLocations(locations) {
    lastLocations = locations || [];
}

export function setOwnerLocation(location) {
    ownerLocation = location;
}

// ==========================================
// Shared Mode State
// ==========================================

export let isSharedMode = false;
export let shareToken = null;
export let sharedLocations = [];
export let sharedStyleUrl = null;

export function setSharedMode(token, locations = [], styleUrl = null) {
    isSharedMode = true;
    shareToken = token;
    sharedLocations = locations;
    sharedStyleUrl = styleUrl;
}

export function setSharedStyleUrl(url) {
    sharedStyleUrl = url;
}

export function clearSharedMode() {
    isSharedMode = false;
    shareToken = null;
    sharedLocations = [];
    sharedStyleUrl = null;
}

// ==========================================
// Map State
// ==========================================

export let map = null;
export let mapMarkers = [];
export let ownerMarker = null;
export let userMarker = null;
export let userPosition = null;
export let currentMapEngine = null;

export function setMap(mapInstance) {
    map = mapInstance;
}

export function setMapMarkers(markers) {
    mapMarkers = markers || [];
}

export function setOwnerMarker(marker) {
    ownerMarker = marker;
}

export function setUserMarker(marker) {
    userMarker = marker;
}

export function setUserPosition(position) {
    userPosition = position;
}

export function setCurrentMapEngine(engine) {
    currentMapEngine = engine;
}

// ==========================================
// UI State
// ==========================================

export let currentEditingEmail = null;

export function setCurrentEditingEmail(email) {
    currentEditingEmail = email;
}

// ==========================================
// Geolocation Tracking State
// ==========================================

export let locationWatchId = null;
export let locationTimeout = null;

export function setLocationWatchId(id) {
    locationWatchId = id;
}

export function setLocationTimeout(timeout) {
    locationTimeout = timeout;
}

// ==========================================
// State Reset
// ==========================================

export function resetAllState() {
    // Selection
    selectedMemberEmails.clear();

    // Locations
    lastLocations = [];
    ownerLocation = null;

    // Shared mode
    isSharedMode = false;
    shareToken = null;
    sharedLocations = [];
    sharedStyleUrl = null;

    // Map
    map = null;
    mapMarkers = [];
    ownerMarker = null;
    userMarker = null;
    userPosition = null;
    currentMapEngine = null;

    // UI
    currentEditingEmail = null;

    // Geolocation
    locationWatchId = null;
    locationTimeout = null;
}

// ==========================================
// State Getters (Optional - for encapsulation)
// ==========================================

export function getState() {
    return {
        selectedMemberEmails: new Set(selectedMemberEmails),
        lastLocations: [...lastLocations],
        ownerLocation: ownerLocation ? { ...ownerLocation } : null,
        isSharedMode,
        shareToken,
        sharedLocations: [...sharedLocations],
        sharedStyleUrl,
        map,
        mapMarkers: [...mapMarkers],
        ownerMarker,
        userMarker,
        userPosition: userPosition ? { ...userPosition } : null,
        currentMapEngine,
        currentEditingEmail,
        locationWatchId,
        locationTimeout
    };
}
