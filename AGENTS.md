<!-- Copyright (c) 2026 Holger Rabbach. Licensed under the MIT License. -->
# Family Location Tracker Specifications

## Overview
A self-hosted web tool to track family members' locations via a provided API.

## Core Features
- Browser storage for API Key and Base URL.
- Fetch family members and their last known location.
- Automatic refresh every 10 seconds.
- Dockerized deployment.

## Technical Stack
- Frontend: HTML/CSS/Vanilla JavaScript.
- Backend (Static Serving): Nginx (Dockerized).
- Storage: `localStorage` in the browser (Configuration, Name Mapping, Address Cache).
- External APIs: Photon API for reverse geocoding (optional).

## API Specification
The tool uses the following endpoint:
- `GET /api/v1/families/locations?api_key={key}`
- Expected response format as defined in `sample.json`.

## PWA Capabilities
- Installable on mobile and desktop.
- Custom icon and branding ("Kinfolk").
- Service worker for asset caching.

## Features
- Persistent storage of API Key and Base URL.
- Subpath support via reverse proxy.
- Progressive Web App (PWA) installation.
- Real Name Mapping: Map email addresses to display names (stored locally).
- **QR Code Configuration**: Instant setup via JSON-encoded QR code scanning.
- **Mobile Optimized**: Fully responsive design for portrait and landscape modes.
- **Live Map View**: Full-screen OpenStreetMap integration (via Leaflet.js) with real-time tracking (10s refresh).
- **Multi-Select Tracking**: Select multiple family members to view simultaneously on the map.
- **URL Parameter Support**: Pre-select members via `?emails=...` or `?emails=all` and auto-launch map.
- **Owner Location**: Option to include the API key owner's location on the map via `?show_owner=true`.
- **API User Identity**: Configure a display name for the API owner (e.g., "John") to appear on the map.
- **Enhanced Map Visualization**: Permanent labels on markers for instant identification, and smart padding to prevent markers from being hidden behind UI overlays.
- **Screen Wake Lock**: Optional feature to keep the device screen active during tracking sessions.
- **Smart Geolocation Fallback**: Automatically uses the API owner's last known location if device geolocation is unavailable or times out.
- **Unified Dashboard**: API Owner appears at the top of the member list with a distinct style for easy monitoring.
- **Direct Name Editing**: Edit display names (for both members and the owner) directly from the dashboard for a seamless experience.
- **Advanced Map Overlay**: When multiple members are selected, the map overlay displays a single, unified card with collapsible details for everyone (including the owner if enabled), keeping the view clean.
- **Color-Coded Identification**: Synchronized unique colors between dashboard avatars and map markers for easy recognition.
- **Persistent Overlay State**: Layout choice (collapsed/expanded) is preserved across automatic data refreshes.
- **Live Reload Countdown**: Real-time feedback in the map header showing the seconds remaining until the next update.
- **Reverse Geocoding**: Optional address lookup via Photon API for all locations (cached locally for performance).

### Version History
- **v2.4.2**: Optimized map marker updates to fix O(N*M) performance bottleneck.
- **v2.4.1**: Hidden coordinates on desktop when address is available and improved address persistence during updates.
- **v2.4.0**: Added Remote Configuration via URL parameters and a "Share Configuration" feature.
- **v2.3.2**: Prioritized display names on dashboard and fixed overlapping emails on mobile.
- **v2.3.1**: Added Screen Wake Lock support for persistent tracking.
- **v1.6.0**: Initial PWA release with Leaflet integration.
- **v1.7.0**: Performance and safety optimizations by Jules.
- **v2.0.1**: Optimized mobile layout to hide coordinates when addresses are present.
- **v2.0.0**: Added Reverse Geocoding support and address caching.

### Recent Optimizations (by Jules)
- **Safety**: Robust HTML escaping (`escapeHtml`) implemented across all UI rendering components to prevent potential XSS vulnerabilities.
- **Performance**: Parallelized API fetching for owner location and family data, significantly reducing initial load and refresh times.

### Current Version: v2.4.2


