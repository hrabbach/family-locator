// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/*
 * MAIN ENTRY POINT - Family Location Tracker
 * This module orchestrates the application by importing and coordinating
 * all other modules. It handles initialization, event binding, and service worker.
 * 
 * NOTE: This is a transitional implementation. The full app.js needs to be
 * migrated here piece by piece. For now, this serves as the module entry point
 * that will co-exist with the original app.js until full migration is complete.
 */

// ==========================================
// Module Imports
// ==========================================

import { escapeHtml, formatRelativeTime, getBatteryClass, getMemberColor, MEMBER_COLORS } from './utils.js';
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
    fetchData,
    fetchWithRetry,
    startTracking,
    stopTracking,
    shareLocation,
    lastLocations,
    ownerLocation,
    secondsToRefresh
} from './api.js';
import {
    initializeMap,
    loadMapEngine,
    updateMapMarkers,
    cleanupMapMarkers,
    centerMapOnSelection
} from './map.js';
import {
    elements,
    initializeElements,
    showDashboard,
    showConfig,
    showMap,
    updateUI,
    updateCountdown,
    updateMemberCards,
    openModal,
    closeModal,
    showToast
} from './ui.js';

// ==========================================
// Expose to Window for Cross-Module Access
// ==========================================

// Temporary bridge until full migration
window.familyTracker = {
    getConfig,
    updateUI,
    lastLocations: [],
    ownerLocation: null
};

// ==========================================
// Service Worker Registration
// ==========================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker registered successfully'))
            .catch(err => console.error('Service Worker registration failed:', err));
    }
}

// ==========================================
// Initialization
// ==========================================

function init() {
    console.log('Family Location Tracker - Module System Initialized');
    console.log('⚠️ NOTE: Full migration in progress - some features use legacy app.js');

    registerServiceWorker();

    // Process URL configuration if present
    processUrlConfiguration();

    // Initialize UI element references
    initializeElements();

    // Check if we have a configuration
    const config = getConfig();
    if (config) {
        console.log('Configuration found, showing dashboard');
        // TODO: Initialize app with config
    } else {
        console.log('No configuration found, showing config screen');
        // TODO: Show config screen
    }
}

// ==========================================
// Application Entry Point
// ==========================================

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM is already ready
    init();
}

// ==========================================
// Export for Testing/Debugging
// ==========================================

export { init };
