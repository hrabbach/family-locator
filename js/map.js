// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/* 
 * MAP MODULE - To be fully extracted from app.js
 * This module will contain all map-related functionality
 * TODO: Extract the following from app.js:
 * - Map engine loading (Leaflet/MapLibre)
 * - Map initialization
 * - Marker management
 * - Map cleanup functions
 * - Map centering logic
 */

import { MEMBER_COLORS, getMemberColorByIndex } from './utils.js';
import { getConfig } from './config.js';

// ==========================================
// CDN Constants (Map Engines)
// ==========================================

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_SRI = 'sha512-i1Ylv7wTEF0ODQ+QSt4OJKR2O/2hShXQ3yPUXvkJxeEa5QGZ5KFKxdNJNT1MVV/B2blO6S3ecBiP5tRBuZVH6Q==';

const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';

let engineLoadPromise = null;
let currentLoadedEngine = null;

// ==========================================
// Map State
// ==========================================

export let map = null;
export let mapMarkers = [];
export let ownerMarker = null;

// ==========================================
// Dynamic Script/CSS Loading
// ==========================================

function loadCSS(href, integrity) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`link[href="${href}"]`);
        if (existing) {
            resolve();
            return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        if (integrity) link.integrity = integrity;
        link.crossOrigin = 'anonymous';
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });
}

function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                resolve();
                return;
            }
            existing.addEventListener('load', resolve);
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        if (integrity) script.integrity = integrity;
        script.crossOrigin = 'anonymous';
        script.dataset.loaded = 'false';
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export function loadMapEngine(engine) {
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

// ==========================================
// Map Initialization - STUB
// ==========================================

export async function initializeMap(config, mapElement) {
    // TODO: Extract full map initialization from app.js
    console.log('Map initialization - to be implemented');
    return null;
}

// ==========================================
// Marker Updates - STUB  
// ==========================================

export function updateMapMarkers(locations, config) {
    // TODO: Extract full marker update logic from app.js
    console.log('Map markers update - to be implemented');
}

// ==========================================
// Memory Cleanup - STUB
// ==========================================

export function cleanupMapMarkers() {
    // TODO: Extract cleanup logic from app.js
    if (mapMarkers) {
        mapMarkers.forEach(marker => {
            if (marker && marker.remove) {
                marker.remove();
            }
        });
        mapMarkers = [];
    }
    if (ownerMarker && ownerMarker.remove) {
        ownerMarker.remove();
        ownerMarker = null;
    }
}

// ==========================================
// Map Centering - STUB
// ==========================================

export function centerMapOnSelection(selectedEmails, locations) {
    // TODO: Extract centering logic from app.js
    console.log('Map centering - to be implemented');
}

// NOTE: The full implementation of this module requires extracting ~500 lines
// from app.js including Leaflet and MapLibre specific code
