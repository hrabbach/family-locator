# Family Locator

A lightweight, self-hosted Progressive Web App (PWA) designed to track family members' locations using the Dawarich API. This tool provides a real-time dashboard and interactive map view for staying connected with your loved ones.

## Key Features

- **Real-Time Dashboard**: See all family members at a glance, including their last known location, battery status, and relative "last seen" time.
- **Proximity Tracking**: View the real-time distance between your current location and family members directly on the dashboard.
- **Interactive Map View**: 
    - Full-screen Leaflet map integration.
    - Optional "Show My Location" toggle to see yourself on the map alongside family members.
    - **Smart Auto-Fit**: The map automatically zooms and pans to keep both you and the family member in view.
    - **Manual Control**: Auto-centering pauses when you interact with the map, with a dedicated "Recenter" button to snap back.
- **PWA Support**: Install the app on your mobile home screen for a native app-like experience.
- **Secure Configuration**: Stores your Dawarich API key and server URL locally in your browser.
- **QR Code Setup**: Quickly configure the app by scanning a configuration QR code from your Dawarich profile.

## Functionality

The app periodically fetches location data (every 10 seconds) from your self-hosted Dawarich server. It calculates absolute and relative times for sightings and uses the Haversine formula for precise distance calculations between your GPS position and your family members.

## Installation

Family Locator is built with standard web technologies (HTML, CSS, JS) and can be hosted on any static web server.

1.  Copy the project files to your web server's public directory (e.g., `/familytrack/`).
2.  Open the URL in your browser.
3.  Enter your Dawarich Base URL and API Key (or scan your config QR).
4.  (Optional) "Add to Home Screen" via your browser's menu to install as a PWA.

---
*Maintained with built-in cache-busting and Service Worker support.*
