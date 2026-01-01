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
