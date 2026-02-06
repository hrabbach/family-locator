// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/*
 * UI MODULE - User Interface Management
 * Handles all DOM manipulation, view switching, and UI updates
 */

import { escapeHtml, formatRelativeTime, getBatteryClass, getMemberColor } from './utils.js';
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
// UI Update Functions - STUBS (to be extracted)
// ==========================================

// TODO: Extract from app.js:
// - updateUI() - Line 1289-1355
// - updateMemberCardContent() - Line 1357-1550
// - updateCountdown() - Line 1161-1191
// - toggleMemberSelection() - Line 1552-1562
// - editName() - Line 1580-1595
// - saveModalName() - Line 2361-2399
// - updateProximityUI() - Line 2316-2325

export function updateUI(data) {
    console.log('updateUI() - to be extracted from app.js');
}

export function updateCountdown(seconds) {
    console.log('updateCountdown() - to be extracted from app.js');
}

export function updateMemberCards(locations, config) {
    console.log('updateMemberCards() - to be extracted from app.js');
}
