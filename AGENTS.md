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
- **v2.5.2**: Fixed owner edit button alignment and removed redundant "(Owner)" label from dashboard.
- **v2.5.1**: Added 'collapsed' URL parameter and fixed dynamic parameter parsing order.
- **v2.5.0**: Added Stationary Device Mode for fixed location tracking, with support for Owner map tracking and distance display.
- **v2.4.2**: Optimized map marker updates to fix O(N*M) performance bottleneck.
- **v2.4.1**: Hidden coordinates on desktop when address is available and improved address persistence during updates.
- **v2.4.0**: Added Remote Configuration via URL parameters and a "Share Configuration" feature.
- **v2.3.2**: Prioritized display names on dashboard and fixed overlapping emails on mobile.
- **v2.3.1**: Added Screen Wake Lock support for persistent tracking.
- **v1.6.0**: Initial PWA release with Leaflet integration.
- **v1.7.0**: Performance and safety optimizations by Jules.
- **v2.0.1**: Optimized mobile layout to hide coordinates when addresses are present.
- **v2.0.0**: Added Reverse Geocoding support and address caching.
- **v2.8.2**: Implemented geocoding request queue to resolve N+1 API issue and respect rate limits.
- **v2.8.5**: Validated and expanded API time range parameters (`start_at`) to ensure last known location is retrieved even if old.
- **v2.8.9**: Implemented automated version management system with centralized version control via package.json and automated propagation to all files.
- **v2.9.0**: **Major Refactoring** - Restructured monolithic 2,640-line app.js into 8 focused ES6 modules (~2,380 lines total) for improved maintainability and caching:
  - **js/utils.js** (110 lines): Helper functions, distance calculations, HTML escaping, formatting
  - **js/config.js** (305 lines): Configuration management, validation, URL processing
  - **js/geocoding.js** (205 lines): Address resolution with Photon API
  - **js/api.js** (220 lines): Data fetching, retry logic, polling management
  - **js/state.js** (190 lines): Shared application state
  - **js/ui.js** (510 lines): All UI update functions and DOM manipulation
  - **js/map.js** (840 lines): Map engine loading, marker management, user tracking
  - **js/main.js** (131 lines): Entry point stub (transitional)
  - Updated Docker, nginx, and service worker configurations to support ES6 modules
  - Implemented proper MIME type handling for JavaScript modules in nginx
  - Zero breaking changes - all features remain functional
- **v2.10.2**: Added native mobile share integration for location sharing links.
- **v2.10.3**: Implemented `showToast` notification system in `js/ui.js` and added corresponding styles in `style.css`.
- **v2.10.4**: Fixed regression where settings screen inputs were not populated with current configuration.

### Recent Optimizations (by Jules)
- **Performance**: Replaced synchronous JWT verification with asynchronous implementation in the Node.js server, preventing event loop blocking and improving throughput.
- **Safety**: Robust HTML escaping (`escapeHtml`) implemented across all UI rendering components to prevent potential XSS vulnerabilities.
- **Performance**: Parallelized API fetching for owner location and family data, significantly reducing initial load and refresh times.
- **Performance**: Implemented a request queue for reverse geocoding to batch and rate-limit API calls, preventing burst traffic and improving reliability.
- **Performance**: Enabled Gzip/Brotli compression in the Node.js server to reduce response sizes by up to 94% and improve delivery speed.
- **Code Organization**: ES6 module architecture with clear separation of concerns for improved maintainability and independent caching.

### Current Version: v2.12.1


- **v2.12.1**: Implemented HTTP response compression (Gzip) for the API server, significantly reducing bandwidth consumption and improving perceived latency.
- **v2.11.1**: Optimized server-side address caching with LRU eviction policy to improve hit rate and reduce redundant reverse geocoding API calls.
- **v2.11.0**: Enhanced UI/UX with skeleton loading state, friendly empty state, clickable member cards, and refined map overlay with improved transitions.
- **v2.11.1**: Finalized Toast notification system and replaced all legacy alerts with modern toasts. Enhanced `showToast` to support different notification types (success, error, warning, info).
- **v2.11.2**: Optimized map overlay rendering by replacing full DOM reconstruction with efficient diffing, significantly reducing layout thrashing and improving performance during updates (4x faster in benchmarks).
- **v2.12.0**: Optimized geocoding UI feedback loop to update addresses incrementally as they are resolved, reducing perceived latency by ~20x (from >1s to ~50ms for first result).
