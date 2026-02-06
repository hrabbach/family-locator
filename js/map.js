// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/*
 * MAP MODULE - Map Rendering and Marker Management
 * Handles Leaflet and MapLibre GL map engines, markers, and user tracking
 */

import { MEMBER_COLORS, getMemberColorByIndex, calculateDistance } from './utils.js';
import { getConfig } from './config.js';
import * as State from './state.js';

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
// Map State (using state.js)
// ==========================================

// Map markers object
let memberMarkers = {};
let isAutoCenterEnabled = true;
let isMapOverlayCollapsed = false;

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
// View Management
// ==========================================

export function showMap(email, selectedMemberEmails, fetchDataCallback, elementsRef) {
    // email argument is optional/deprecated. If passed, it ensures it's in selection
    if (email) {
        selectedMemberEmails.add(email);
    }

    // Always reset auto-center when showing map fresh
    isAutoCenterEnabled = true;

    elementsRef.mapView.classList.add('active');
    elementsRef.dashboardView.classList.remove('active');

    // Initial fetch to get member data for map
    fetchDataCallback();
}

export function showSingleMemberMap(email, selectedMemberEmails, showMapFn) {
    // Clear selection and select JUST this one, then show map
    selectedMemberEmails.clear();
    selectedMemberEmails.add(email);
    showMapFn();
}

export function closeMap() {
    stopUserTracking();
    isMapOverlayCollapsed = false; // Reset for next use
    // View switching handled by caller

    if (State.map) {
        State.map.remove();
        State.setMap(null);
        memberMarkers = {};
        State.setOwnerMarker(null);
        State.setUserMarker(null);
    }
}

export function recenterMap(updateMapMarkersFn) {
    isAutoCenterEnabled = true;
    const btn = document.getElementById('dynamicRecenterBtn');
    if (btn) btn.style.display = 'none';
    updateMapMarkersFn();
}

// ==========================================
// Memory Cleanup
// ==========================================

export function cleanupMapMarkers() {
    const config = getConfig() || {};
    const useLeaflet = config.mapEngine === 'leaflet';

    // Clear all member markers
    for (const [email, marker] of Object.entries(memberMarkers)) {
        if (marker) {
            if (useLeaflet) {
                if (State.map) {
                    State.map.removeLayer(marker);
                    marker.off(); // Remove all Leaflet event listeners
                }
            } else {
                marker.remove(); // MapLibre cleanup
            }
        }
    }
    memberMarkers = {};

    // Clear owner marker
    if (State.ownerMarker) {
        if (useLeaflet) {
            if (State.map) {
                State.map.removeLayer(State.ownerMarker);
                State.ownerMarker.off();
            }
        } else {
            State.ownerMarker.remove();
        }
        State.setOwnerMarker(null);
    }

    // Clear user marker
    if (State.userMarker) {
        if (useLeaflet) {
            if (State.map) {
                State.map.removeLayer(State.userMarker);
                State.userMarker.off();
            }
        } else {
            State.userMarker.remove();
        }
        State.setUserMarker(null);
    }
}

// ==========================================
// User Location Tracking
// ==========================================

export function startUserTracking() {
    stopUserTracking();

    const config = getConfig() || {};
    if (config.fixedLat && config.fixedLon) {
        // Use stationary coordinates
        State.setUserPosition({
            lat: parseFloat(config.fixedLat),
            lng: parseFloat(config.fixedLon)
        });
        return;
    }

    // Real geolocation
    if ('geolocation' in navigator) {
        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                State.setUserPosition({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
                updateUserMarker();

                // Clear timeout if location obtained
                if (State.locationTimeout) {
                    clearTimeout(State.locationTimeout);
                    State.setLocationTimeout(null);
                }
            },
            (error) => {
                console.warn('Geolocation error:', error);
                useOwnerLocationAsFallback();
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
        State.setLocationWatchId(watchId);

        // Fallback timeout
        const timeout = setTimeout(() => {
            console.warn('Geolocation timeout, using fallback');
            useOwnerLocationAsFallback();
        }, 12000);
        State.setLocationTimeout(timeout);
    } else {
        useOwnerLocationAsFallback();
    }
}

function useOwnerLocationAsFallback() {
    if (State.ownerLocation) {
        State.setUserPosition({
            lat: State.ownerLocation.latitude || State.ownerLocation.lat,
            lng: State.ownerLocation.longitude || State.ownerLocation.lon
        });
    }
}

export function stopUserTracking() {
    if (State.locationWatchId !== null) {
        navigator.geolocation.clearWatch(State.locationWatchId);
        State.setLocationWatchId(null);
    }
    if (State.locationTimeout) {
        clearTimeout(State.locationTimeout);
        State.setLocationTimeout(null);
    }
}

function updateUserMarker() {
    if (!State.map || !State.userPosition) return;

    const config = getConfig() || {};
    const useLeaflet = config.mapEngine === 'leaflet';

    if (useLeaflet) {
        if (!State.userMarker) {
            // Create Leaflet marker
            const icon = L.divIcon({
                className: 'user-marker-icon',
                html: '<div style="background: #00aaff; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
                iconSize: [16, 16]
            });
            State.setUserMarker(L.marker([State.userPosition.lat, State.userPosition.lng], { icon }));
            State.userMarker.addTo(State.map);
        } else {
            State.userMarker.setLatLng([State.userPosition.lat, State.userPosition.lng]);
        }
    } else {
        // MapLibre - create custom marker element
        if (!State.userMarker) {
            const el = document.createElement('div');
            el.style.background = '#00aaff';
            el.style.width = '16px';
            el.style.height = '16px';
            el.style.borderRadius = '50%';
            el.style.border = '3px solid white';
            el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';

            State.setUserMarker(new maplibregl.Marker(el)
                .setLngLat([State.userPosition.lng, State.userPosition.lat])
                .addTo(State.map));
        } else {
            State.userMarker.setLngLat([State.userPosition.lng, State.userPosition.lat]);
        }
    }
}

// ==========================================
// Map Markers Update (COMPLEX - to be extracted)
// ==========================================

export function updateMapMarkers() {
    // TODO: Extract full 508-line implementation from app.js:1660-2167
    // This is the most complex function requiring:
    // - Leaflet marker creation and management
    // - MapLibre marker creation and management
    // - Popup generation
    //- Bounds calculation and centering
    // - Dynamic recenter button management

    console.log('updateMapMarkers() - full implementation to be extracted');
}
