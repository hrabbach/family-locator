// Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License.

/**
 * @fileoverview Utility functions for the Family Location Tracker.
 * Provides helper functions for calculations, formatting, and UI utilities.
 * @module js/utils
 * @version 2.10.2
 */

// ==========================================
// Color Constants
// ==========================================

/**
 * Color palette for member avatars and map markers.
 * @type {Array<{name: string, hex: string, icon: string}>}
 */
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

/** @type {Object<string, string>} HTML entity escape map */
const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
};

const HTML_ESCAPE_REGEX = /[&<>"']/g;

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * @param {*} text - The text to escape (coerced to string)
 * @returns {string} HTML-safe string
 */
export function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(HTML_ESCAPE_REGEX, (match) => HTML_ESCAPE_MAP[match]);
}

// ==========================================
// Time Formatting
// ==========================================

/**
 * Formats a date object or timestamp to a time string respecting the user's locale.
 * @param {Date|number} date - Date object or timestamp in seconds
 * @param {boolean} [withSeconds=false] - Whether to include seconds
 * @returns {string} Formatted time string
 */
export function formatTime(date, withSeconds = false) {
    if (typeof date === 'number') date = new Date(date * 1000);
    const options = {
        hour: '2-digit',
        minute: '2-digit'
    };
    if (withSeconds) {
        options.second = '2-digit';
    }
    return date.toLocaleTimeString(undefined, options);
}

/**
 * Formats a date object or timestamp to a date and time string respecting the user's locale.
 * @param {Date|number} date - Date object or timestamp in seconds
 * @returns {string} Formatted date and time string
 */
export function formatDateTime(date) {
    if (typeof date === 'number') date = new Date(date * 1000);
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Formats a Unix timestamp as absolute time with relative indicator.
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted time string (e.g., "14:30 (5m ago)")
 */
export function formatRelativeTime(timestamp) {
    // API timestamp is seconds since Unix epoch
    const date = new Date(timestamp * 1000);
    const absTime = formatTime(date);

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

/**
 * Returns CSS class name based on battery level.
 * @param {number} level - Battery percentage (0-100)
 * @returns {string} CSS class: 'battery-low', 'battery-mid', or 'battery-high'
 */
export function getBatteryClass(level) {
    if (level <= 20) return 'battery-low';
    if (level <= 50) return 'battery-mid';
    return 'battery-high';
}

// ==========================================
// Member Color Utilities
// ==========================================

/**
 * Gets a member color by array index with wraparound.
 * @param {number} index - Index in member list
 * @returns {{name: string, hex: string, icon: string}} Color configuration
 */
export function getMemberColorByIndex(index) {
    if (index < 0) return MEMBER_COLORS[0];
    return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

/**
 * Gets the assigned color for a specific member by email.
 * @param {string} email - Member's email address
 * @param {Array<Object>} locations - Array of location objects
 * @returns {{name: string, hex: string, icon: string}} Color configuration
 */
export function getMemberColor(email, locations) {
    if (!email || !locations) return MEMBER_COLORS[0];
    const index = locations.findIndex(m => m.email === email);
    return getMemberColorByIndex(index);
}

// ==========================================
// Distance Calculation
// ==========================================

/**
 * Calculates distance between two coordinates using Haversine formula.
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
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
