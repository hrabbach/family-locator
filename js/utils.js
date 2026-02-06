// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

// ==========================================
// Color Constants
// ==========================================

export const MEMBER_COLORS = [
    { name: 'blue', hex: '#2A81CB', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png' },
    { name: 'red', hex: '#CB2B3E', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png' },
    { name: 'green', hex: '#2AAD27', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png' },
    { name: 'orange', hex: '#CB8427', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png' },
    { name: 'yellow', hex: '#CAC428', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png' },
    { name: 'violet', hex: '#9C2BCB', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png' },
    { name: 'grey', hex: '#7B7B7B', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png' },
    { name: 'black', hex: '#3D3D3D', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png' },
    { name: 'cyan', hex: '#1abc9c', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png' },
    { name: 'indigo', hex: '#3f51b5', icon: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png' }
];

// ==========================================
// HTML Security
// ==========================================

const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

export function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_MAP[match]);
}

// ==========================================
// Time Formatting
// ==========================================

export function formatRelativeTime(timestamp) {
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

// ==========================================
// Battery Level Classification
// ==========================================

export function getBatteryClass(level) {
    if (level <= 20) return 'battery-low';
    if (level <= 50) return 'battery-mid';
    return 'battery-high';
}

// ==========================================
// Member Color Utilities
// ==========================================

export function getMemberColorByIndex(index) {
    if (index < 0) return MEMBER_COLORS[0];
    return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

export function getMemberColor(email, locations) {
    if (!email || !locations) return MEMBER_COLORS[0];
    const index = locations.findIndex(m => m.email === email);
    return getMemberColorByIndex(index);
}

// ==========================================
// Distance Calculation
// ==========================================

export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
