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
- Storage: `localStorage` in the browser.

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
- **Smart Location Fallback**: Automatically uses the API owner's last known location as "My Location" if device geolocation is unavailable or times out (10s).
- **Context-Aware UI**: "Show My Location" toggle is automatically hidden when viewing the Owner's location to prevent confusion.
- **Enhanced Map Visualization**: Permanent labels on markers for instant identification, and smart padding to prevent markers from being hidden behind UI overlays.
- **Unified Dashboard**: API Owner appears at the top of the member list with a distinct style for easy monitoring.
- **Direct Name Editing**: Edit display names (for both members and the owner) directly from the dashboard for a seamless experience.
- **Advanced Map Overlay**: When multiple members are selected, the map overlay displays a single, unified card with collapsible details for everyone (including the owner if enabled), keeping the view clean.

### Current Version: v1.4.0


