// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/**
 * @fileoverview Map rendering with dual engine support (Leaflet/MapLibre).
 * @module js/map
 * @version 2.11.1
 */

import { MEMBER_COLORS, getMemberColorByIndex, calculateDistance, formatDateTime } from './utils.js';
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
// Map Markers Update (COMPLEX - FULL IMPLEMENTATION)
// ==========================================

export async function updateMapMarkers(
    lastLocations,
    selectedMemberEmails,
    ownerLocation,
    userLocation,
    isSharedMode,
    sharedStyleUrl,
    sharedLocations,
    showOwnerLocation,
    proximityEnabled,
    secondsToRefresh,
    sharedExpiresAt,
    elementsRef,
    formatRelativeTimeFn,
    escapeHtmlFn,
    updateCountdownFn,
    onCloseFn
) {
    const config = getConfig() || {};
    const useLeaflet = config.mapEngine === 'leaflet';
    const requiredEngine = useLeaflet ? 'leaflet' : 'maplibre';

    // Ensure engine is loaded before doing anything
    await loadMapEngine(requiredEngine);

    // Check if view is still active (user might have navigated away during load)
    if (!elementsRef.mapView.classList.contains('active')) return;

    // Use shared style if available and in shared mode, otherwise config
    const targetStyleUrl = (isSharedMode && sharedStyleUrl) ? sharedStyleUrl : (config.mapStyleUrl || './style.json');

    // If switching engines or styles (for MapLibre), destroy previous map instance
    if (State.map) {
        const currentEngine = State.map._family_locator_engine;
        const currentStyle = State.map._family_locator_style;
        const targetEngine = useLeaflet ? 'leaflet' : 'maplibre';

        let shouldReset = false;
        if (currentEngine !== targetEngine) shouldReset = true;
        if (targetEngine === 'maplibre' && currentStyle !== targetStyleUrl) shouldReset = true;

        if (shouldReset) {
            State.map.remove();
            State.setMap(null);
            memberMarkers = {};
            State.setOwnerMarker(null);
            State.setUserMarker(null);
            document.getElementById('mapContainer').innerHTML = ''; // Ensure container is clean
        }
    }

    if (!State.map) {
        if (useLeaflet) {
            // --- LEAFLET INITIALIZATION ---
            const L = window.L;
            const newMap = L.map('mapContainer').setView([0, 0], 2);
            newMap._family_locator_engine = 'leaflet';
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }).addTo(newMap);

            newMap.on('dragstart', () => {
                isAutoCenterEnabled = false;
                const btn = document.getElementById('dynamicRecenterBtn');
                if (btn) btn.style.display = 'block';
            });
            newMap.on('zoomstart', (e) => {
                if (e && e.originalEvent) {
                    isAutoCenterEnabled = false;
                    const btn = document.getElementById('dynamicRecenterBtn');
                    if (btn) btn.style.display = 'block';
                }
            });
            State.setMap(newMap);
        } else {
            // --- MAPLIBRE INITIALIZATION ---
            const maplibregl = window.maplibregl;
            const newMap = new maplibregl.Map({
                container: 'mapContainer',
                style: targetStyleUrl,
                center: [0, 0],
                zoom: 1,
                attributionControl: true
            });
            newMap._family_locator_engine = 'maplibre';
            newMap._family_locator_style = targetStyleUrl;
            newMap.addControl(new maplibregl.NavigationControl(), 'top-right');

            newMap.on('dragstart', () => {
                isAutoCenterEnabled = false;
                const btn = document.getElementById('dynamicRecenterBtn');
                if (btn) btn.style.display = 'block';
            });
            newMap.on('zoomstart', (e) => {
                if (e && e.originalEvent) {
                    isAutoCenterEnabled = false;
                    const btn = document.getElementById('dynamicRecenterBtn');
                    if (btn) btn.style.display = 'block';
                }
            });
            State.setMap(newMap);
        }
    }

    let bounds;
    const L = window.L;
    const maplibregl = window.maplibregl;

    if (useLeaflet) {
        bounds = L.latLngBounds();
    } else {
        bounds = new maplibregl.LngLatBounds();
    }

    let hasMarkers = false;

    // 1. Members
    const NAMES_KEY = 'family_tracker_names';
    const names = JSON.parse(localStorage.getItem(NAMES_KEY)) || {};

    // Remove old markers that are no longer selected or valid
    for (const [email, m] of Object.entries(memberMarkers)) {
        if (!selectedMemberEmails.has(email)) {
            if (useLeaflet) State.map.removeLayer(m);
            else m.remove();
            delete memberMarkers[email];
        }
    }

    // Create a map for fast lookup to avoid O(N*M) complexity
    const locationsMap = new Map();
    // Merge shared locations for map display
    const allLocations = [...lastLocations, ...sharedLocations];

    allLocations.forEach((m, index) => {
        locationsMap.set(m.email, { member: m, index });
    });

    // Add or update markers for selected members
    for (const email of selectedMemberEmails) {
        const entry = locationsMap.get(email);
        if (entry) {
            const member = entry.member;
            const index = entry.index;
            const lat = member.latitude;
            const lng = member.longitude;
            const displayName = names[email] || member.name || email;
            const popupContent = `<b>${escapeHtmlFn(displayName)}</b><br>${escapeHtmlFn(formatDateTime(member.timestamp))}<br>Bat: ${member.battery}%${member.address ? `<br>${escapeHtmlFn(member.address)}` : ''}`;

            if (useLeaflet) {
                // --- LEAFLET MARKER UPDATE ---
                if (memberMarkers[email]) {
                    memberMarkers[email].setLatLng([lat, lng]).setPopupContent(popupContent);
                    memberMarkers[email].setTooltipContent(escapeHtmlFn(displayName));
                } else {
                    const colorCfg = getMemberColorByIndex(index);
                    const customIcon = new L.Icon({
                        iconUrl: colorCfg.icon,
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    });

                    memberMarkers[email] = L.marker([lat, lng], { icon: customIcon })
                        .addTo(State.map)
                        .bindPopup(popupContent)
                        .bindTooltip(escapeHtmlFn(displayName), { permanent: true, direction: 'bottom', className: 'marker-label' });
                }
                bounds.extend([lat, lng]);
            } else {
                // --- MAPLIBRE MARKER UPDATE ---
                if (memberMarkers[email]) {
                    memberMarkers[email].setLngLat([lng, lat]);
                    memberMarkers[email].getPopup().setHTML(popupContent);
                    // Update label text
                    const el = memberMarkers[email].getElement();
                    const label = el.querySelector('.marker-label-container');
                    if (label) label.innerText = displayName;
                } else {
                    const colorCfg = getMemberColorByIndex(index);

                    const container = document.createElement('div');
                    container.className = 'custom-marker-container';

                    const img = document.createElement('img');
                    img.src = colorCfg.icon;
                    img.style.width = '25px';
                    img.style.height = '41px';

                    const label = document.createElement('div');
                    label.className = 'marker-label-container';
                    label.innerText = displayName;

                    container.appendChild(img);
                    container.appendChild(label);

                    const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupContent);

                    memberMarkers[email] = new maplibregl.Marker({ element: container, anchor: 'bottom' })
                        .setLngLat([lng, lat])
                        .setPopup(popup)
                        .addTo(State.map);
                }
                bounds.extend([lng, lat]);
            }
            hasMarkers = true;
        }
    }

    // Owner Marker
    const shouldShowOwner = (showOwnerLocation || selectedMemberEmails.has('OWNER')) && ownerLocation;

    if (shouldShowOwner) {
        const lat = ownerLocation.latitude || ownerLocation.lat;
        const lng = ownerLocation.longitude || ownerLocation.lon;
        const ownerName = config.apiUserName ? config.apiUserName : "API Owner";
        const timestamp = ownerLocation.timestamp || ownerLocation.tst;
        const timeStr = timestamp ? formatDateTime(timestamp) : 'Unknown time';
        const batt = ownerLocation.battery || ownerLocation.batt || '?';

        if (lat && lng) {
            const popupContent = `<b>${escapeHtmlFn(ownerName)}</b><br>${escapeHtmlFn(timeStr)}<br>Bat: ${batt}%${ownerLocation.address ? `<br>${escapeHtmlFn(ownerLocation.address)}` : ''}`;

            if (useLeaflet) {
                // --- LEAFLET OWNER ---
                if (!State.ownerMarker) {
                    const goldIcon = new L.Icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    });

                    const marker = L.marker([lat, lng], { icon: goldIcon })
                        .addTo(State.map)
                        .bindPopup(popupContent)
                        .bindTooltip(escapeHtmlFn(ownerName), { permanent: true, direction: 'bottom', className: 'marker-label' });
                    State.setOwnerMarker(marker);
                } else {
                    State.ownerMarker.setLatLng([lat, lng]).setPopupContent(popupContent);
                    State.ownerMarker.setTooltipContent(escapeHtmlFn(ownerName));
                    if (State.ownerMarker.getPopup().isOpen()) {
                        State.ownerMarker.openPopup(); // Refresh content if open
                    }
                }
                bounds.extend([lat, lng]);
            } else {
                // --- MAPLIBRE OWNER ---
                if (!State.ownerMarker) {
                    const container = document.createElement('div');
                    container.className = 'custom-marker-container';

                    const img = document.createElement('img');
                    img.src = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png';
                    img.style.width = '25px';
                    img.style.height = '41px';

                    const label = document.createElement('div');
                    label.className = 'marker-label-container';
                    label.innerText = ownerName;

                    container.appendChild(img);
                    container.appendChild(label);

                    const popup = new maplibregl.Popup({ offset: 25 }).setHTML(popupContent);

                    const marker = new maplibregl.Marker({ element: container, anchor: 'bottom' })
                        .setLngLat([lng, lat])
                        .setPopup(popup)
                        .addTo(State.map);
                    State.setOwnerMarker(marker);
                } else {
                    State.ownerMarker.setLngLat([lng, lat]);
                    State.ownerMarker.getPopup().setHTML(popupContent);
                    const el = State.ownerMarker.getElement();
                    const label = el.querySelector('.marker-label-container');
                    if (label) label.innerText = ownerName;
                }
                bounds.extend([lng, lat]);
            }
            hasMarkers = true;
        }
    } else if (State.ownerMarker) {
        if (useLeaflet) State.map.removeLayer(State.ownerMarker);
        else State.ownerMarker.remove();
        State.setOwnerMarker(null);
    }

    // 3. User (Viewer) Location
    if (userLocation && proximityEnabled) {
        if (useLeaflet) {
            // --- LEAFLET USER ---
            if (!State.userMarker) {
                const marker = L.circleMarker([userLocation.lat, userLocation.lng], {
                    radius: 8,
                    fillColor: "#4a90e2",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(State.map);
                State.setUserMarker(marker);
            } else {
                State.userMarker.setLatLng([userLocation.lat, userLocation.lng]);
            }
            bounds.extend([userLocation.lat, userLocation.lng]);
        } else {
            // --- MAPLIBRE USER ---
            if (!State.userMarker) {
                const el = document.createElement('div');
                el.className = 'user-location-dot';
                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([userLocation.lng, userLocation.lat])
                    .addTo(State.map);
                State.setUserMarker(marker);
            } else {
                State.userMarker.setLngLat([userLocation.lng, userLocation.lat]);
            }
            bounds.extend([userLocation.lng, userLocation.lat]);
        }
        hasMarkers = true;
    }

    // Unified Map Overlay
    const header = document.querySelector('.map-header');

    // Optimized: Check if card exists
    let card = header.querySelector('.map-unified-card');

    if (!card) {
        card = document.createElement('div');
        card.className = 'map-unified-card';
        header.appendChild(card);
        // Initial structure
        card.innerHTML = `
            <div class="map-card-header"></div>
            <div class="map-card-body"></div>
            <div class="map-card-footer"></div>
        `;
    } else {
        // Ensure structure is correct
        if (card.children.length !== 3) {
             card.innerHTML = `
                <div class="map-card-header"></div>
                <div class="map-card-body"></div>
                <div class="map-card-footer"></div>
            `;
        }
    }

    // 1. Collect all users to show
    const usersToShow = [];

    // Owner (if enabled)
    if (shouldShowOwner) {
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
        const entry = locationsMap.get(email);
        if (entry) {
            const member = entry.member;
            const index = entry.index;
            usersToShow.push({
                name: names[email] || member.name || email,
                email: email,
                timestamp: member.timestamp,
                battery: member.battery,
                isOwner: false,
                initial: member.email_initial,
                color: getMemberColorByIndex(index).hex
            });
        }
    });

    // Toggle chevron
    const cardHeader = card.children[0];
    const cardBody = card.children[1];
    const cardFooter = card.children[2];

    // --- 1. Header Update ---
    const titleText = usersToShow.length === 1
        ? usersToShow[0].name
        : `Tracking ${usersToShow.length} Members`;

    // Ensure header content structure
    if (!cardHeader.hasChildNodes()) {
         cardHeader.innerHTML = `
            <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="header-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
                    <span id="mapReloadCountdown" style="font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0;"></span>
                </div>
                <div id="sharedExpiryCountdown" style="font-size: 0.75rem; color: var(--warning-color); display: none;"></div>
            </div>
        `;
    }

    const titleSpan = cardHeader.querySelector('.header-title');
    if (titleSpan && titleSpan.textContent !== titleText) {
        titleSpan.textContent = titleText;
    }

    // Chevron Logic
    let chevronContainer = null;
    if (cardHeader.lastElementChild && cardHeader.lastElementChild.classList.contains('chevron-container')) {
        chevronContainer = cardHeader.lastElementChild;
    }

    if (usersToShow.length > 1) {
        const chevronRotation = isMapOverlayCollapsed ? '-90deg' : '0deg';

        if (!chevronContainer) {
             const div = document.createElement('div');
             div.className = 'chevron-container';
             div.innerHTML = `<span style="font-size: 0.8rem; transform: rotate(${chevronRotation}); transition: transform 0.2s;">▼</span>`;
             cardHeader.appendChild(div);
             chevronContainer = div;

             // Add listener
             cardHeader.onclick = () => {
                isMapOverlayCollapsed = !isMapOverlayCollapsed;
                const body = card.querySelector('.map-card-body');
                const ch = cardHeader.querySelector('.chevron-container span');

                if (isMapOverlayCollapsed) {
                    if (body) body.classList.add('collapsed');
                    if (ch) ch.style.transform = 'rotate(-90deg)';
                } else {
                    if (body) body.classList.remove('collapsed');
                    if (ch) ch.style.transform = 'rotate(0deg)';
                }
            };
            cardHeader.style.cursor = 'pointer';
        } else {
            // Update existing chevron
            const ch = chevronContainer.querySelector('span');
            if(ch) ch.style.transform = `rotate(${chevronRotation})`;
        }
    } else {
        // Remove chevron if present
        if (chevronContainer) {
            chevronContainer.remove();
            cardHeader.onclick = null;
            cardHeader.style.cursor = 'default';
        }
    }

    // --- 2. Body Update ---
    if (isMapOverlayCollapsed) {
        if (!cardBody.classList.contains('collapsed')) cardBody.classList.add('collapsed');
    } else {
        if (cardBody.classList.contains('collapsed')) cardBody.classList.remove('collapsed');
    }

    if (usersToShow.length === 0) {
        cardBody.innerHTML = `<div class="map-member-row" style="justify-content: center; color: var(--text-secondary);">No members selected</div>`;
    } else {
        if (cardBody.firstElementChild && cardBody.firstElementChild.innerText === 'No members selected') {
            cardBody.innerHTML = '';
        }

        const existingRows = Array.from(cardBody.children);
        const existingMap = new Map();
        existingRows.forEach(row => {
            if (row.dataset.email) existingMap.set(row.dataset.email, row);
        });

        const seenEmails = new Set();

        usersToShow.forEach(u => {
            seenEmails.add(u.email);
            let row = existingMap.get(u.email);

            if (!row) {
                row = document.createElement('div');
                row.className = `map-member-row ${u.isOwner ? 'is-owner' : ''}`;
                row.dataset.email = u.email;
                row.innerHTML = `
                    <div class="avatar-small" style="background: ${u.isOwner ? '#ffd700' : u.color}; color: #333;">${escapeHtmlFn(u.initial)}</div>
                    <div style="flex: 1;">
                        <div class="user-name" style="font-weight: 500; font-size: 0.9rem; color: ${u.isOwner ? '#ffd700' : 'var(--text-primary)'}">${escapeHtmlFn(u.name)}</div>
                        <div class="user-details" style="font-size: 0.75rem; color: var(--text-secondary);">
                            ${u.battery >= 0 ? `Bat: ${u.battery}% • ` : ''}${escapeHtmlFn(formatRelativeTimeFn(u.timestamp))}
                        </div>
                    </div>
                `;
                cardBody.appendChild(row);
            } else {
                // Update content
                const timeStr = formatRelativeTimeFn(u.timestamp);

                // Avatar
                const avatar = row.children[0];
                if (avatar) {
                    avatar.style.background = u.isOwner ? '#ffd700' : u.color;
                    avatar.textContent = u.initial;
                }

                // Name
                const nameDiv = row.children[1].children[0];
                if (nameDiv) {
                   nameDiv.style.color = u.isOwner ? '#ffd700' : 'var(--text-primary)';
                   nameDiv.textContent = u.name;
                }

                // Details
                const detailsDiv = row.children[1].children[1];
                if (detailsDiv) {
                    const newDetails = `${u.battery >= 0 ? `Bat: ${u.battery}% • ` : ''}${escapeHtmlFn(timeStr)}`;
                    if (detailsDiv.innerHTML !== newDetails) {
                         detailsDiv.innerHTML = newDetails;
                    }
                }

                // Class
                if (u.isOwner) {
                    if (!row.classList.contains('is-owner')) row.classList.add('is-owner');
                } else {
                    if (row.classList.contains('is-owner')) row.classList.remove('is-owner');
                }

                cardBody.appendChild(row); // Reorder
            }
        });

        // Remove old
        for (const [email, row] of existingMap) {
            if (!seenEmails.has(email)) {
                row.remove();
            }
        }
    }

    // --- 3. Footer Update ---
    const hasToggle = cardFooter.querySelector('.switch');
    const needsToggle = !showOwnerLocation;

    if ((needsToggle && !hasToggle) || (!needsToggle && hasToggle)) {
        cardFooter.innerHTML = '';
    }

    if (!cardFooter.hasChildNodes()) {
         // Build footer structure
        const toggleContainer = document.createElement('div');
        if (needsToggle) {
            toggleContainer.style.display = 'flex';
            toggleContainer.style.alignItems = 'center';
            toggleContainer.style.gap = '0.5rem';

            const switchLabel = document.createElement('label');
            switchLabel.className = 'switch';
            switchLabel.style.transform = 'scale(0.8)';
            switchLabel.appendChild(elementsRef.toggleProximity);
            const slider = document.createElement('span');
            slider.className = 'slider round';
            switchLabel.appendChild(slider);

            toggleContainer.appendChild(switchLabel);
            toggleContainer.appendChild(elementsRef.distanceBadge);

            const label = document.createElement('span');
            label.innerText = "Me";
            label.style.fontSize = '0.85rem';
            label.style.fontWeight = '500';
            toggleContainer.appendChild(label);
        }
        cardFooter.appendChild(toggleContainer);

        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '0.5rem';

        const recenterBtn = document.createElement('button');
        recenterBtn.id = 'dynamicRecenterBtn';
        recenterBtn.innerText = 'Recenter';
        recenterBtn.className = 'edit-name-btn';
        recenterBtn.style.padding = '0.3rem 0.8rem';
        recenterBtn.style.fontSize = '0.8rem';
        recenterBtn.style.background = 'var(--accent-color)';
        recenterBtn.style.color = 'white';

        recenterBtn.onclick = () => {
            recenterMap(() => {
                updateMapMarkers(
                    lastLocations, selectedMemberEmails, ownerLocation, userLocation,
                    isSharedMode, sharedStyleUrl, sharedLocations, showOwnerLocation,
                    proximityEnabled, secondsToRefresh, sharedExpiresAt, elementsRef, formatRelativeTimeFn,
                    escapeHtmlFn, updateCountdownFn, onCloseFn
                );
            });
            recenterBtn.style.display = 'none';
        };
        buttonsContainer.appendChild(recenterBtn);

        if (!isSharedMode) {
            const closeBtn = document.createElement('button');
            closeBtn.innerText = 'Close';
            closeBtn.className = 'edit-name-btn';
            closeBtn.style.padding = '0.3rem 1rem';
            closeBtn.style.fontSize = '0.8rem';
            closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            closeBtn.style.color = 'var(--text-primary)';
            closeBtn.onclick = () => {
                if (onCloseFn) onCloseFn();
                else closeMap();
            };
            buttonsContainer.appendChild(closeBtn);
        }
        cardFooter.appendChild(buttonsContainer);
    }

    // Dynamic Footer Updates (Recenter Btn)
    const rBtn = cardFooter.querySelector('#dynamicRecenterBtn');
    if (rBtn) {
        rBtn.style.display = isAutoCenterEnabled ? 'none' : 'block';
    }

    if (isAutoCenterEnabled && hasMarkers) {
        const isMobile = window.innerWidth <= 600;
        const paddingBottom = isMobile ? 300 : 50;
        const paddingSide = isMobile ? 20 : 50;

        if (useLeaflet) {
            // Leaflet FitBounds
            State.map.fitBounds(bounds, {
                paddingTopLeft: [paddingSide, paddingSide],
                paddingBottomRight: [paddingSide, paddingBottom],
                maxZoom: 18
            });
        } else {
            // MapLibre FitBounds
            State.map.fitBounds(bounds, {
                padding: {
                    top: paddingSide,
                    bottom: paddingBottom,
                    left: paddingSide,
                    right: paddingSide
                },
                maxZoom: 18
            });
        }
    }

    // Update countdown immediately to prevent flickering
    if (updateCountdownFn) {
        updateCountdownFn(secondsToRefresh, sharedExpiresAt, elementsRef);
    }
}
