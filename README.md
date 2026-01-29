# Family Locator

A lightweight, self-hosted Progressive Web App (PWA) designed to track family members' locations using the Dawarich API. This tool provides a premium, mobile-first dashboard and an advanced interactive map view for staying connected with your loved ones.

## Key Features

-   **Real-Time Dashboard**: See all family members at a glance, including their last known location, battery status (with charging indicators), and human-readable "last seen" times.
-   **Color-Coded Identification**: Each family member is assigned a unique, high-contrast color that synchronizes between their dashboard avatar and their map marker for instant recognition.
-   **Dynamic Customization**:
    -   **Display Names**: Edit member and owner names directly from the dashboard for a personalized experience.
    -   **Owner Initials**: The owner's avatar dynamically reflects their configured name (e.g., 'H' for Holger).
-   **Advanced Map Mode**:
    -   **Multi-Selection**: Select one or multiple members to view their paths and current locations simultaneously.
    -   **Unified Mobile Overlay**: A clean, collapsible overlay provides detailed info for everyone on the map without cluttering the view.
    -   **Persistent State**: The map overlay remembers if you've minimized it, respecting your layout choice across automatic refreshes.
    -   **Live Reload Countdown**: A real-time timer in the map header shows exactly when the next data update will arrive.
-   **Proximity Tracking**: View real-time distances between your current location and family members using high-accuracy Haversine calculations.
-   **Smart Map Control**:
    -   **Auto-Fit**: Intelligently zooms and pans to keep all selected markers in view.
    -   **Manual Override**: Auto-centering pauses when you interact with the map, with a one-tap "Recenter" button to snap back to the action.
-   **Reverse Geocoding**: Automatically resolve latitude/longitude into human-readable addresses using the Photon API. Features local caching to minimize API calls and ensure snappy UI updates.
-   **PWA Support**: Fully responsive design with manifest and service worker support—install it on your mobile home screen for a native app feel.
-   **Swift Setup**: Quickly configure the app by scanning a configuration QR code from your Dawarich profile or via secure manual entry.

## URL Parameters

Automate the tracking view by passing parameters in the URL:

-   **`emails=...`**: Pre-select family members to track on the map.
    -   `?emails=all`: Selects all family members.
    -   `?emails=user1@example.com,user2@example.com`: Selects specific members by email.
-   **`show_owner=true`**: Automatically includes your own location (API owner) on the map alongside selected members.

*Example*: `https://your-locator.com/?emails=all&show_owner=true`

## How it Works

The app periodically fetches location data (every 10 seconds) from your self-hosted Dawarich server. It handles everything client-side for privacy and speed, storing your API keys and configuration securely in local storage.

## Reverse Geocoding Setup

To enable address lookup for your family members:

1.  Open the **Settings** (or configuration view).
2.  Check the box **"Enable Reverse Geocoding (Address Lookup)"**.
3.  (Optional) Enter a custom **Photon API URL**. The default is `https://photon.komoot.io`.
4.  (Optional) Provide a **Photon API Key** if required by your provider.
5.  Click **"Start Tracking"** to save your changes.

*Note: Addresses are cached locally to ensure high performance and minimize API usage.*

## Installation

Family Locator is built with standard web technologies (HTML, CSS, JS) and can be hosted on any static web server.

1.  Copy the project files to your web server's public directory (e.g., `/familytrack/`).
2.  Open the URL in your browser.
3.  Enter your Dawarich Base URL and API Key (or scan your config QR).
4.  (Optional) "Add to Home Screen" via your browser's menu to install as a PWA.

---
*Maintained with built-in cache-busting, high-performance Leaflet mapping, and Service Worker support.*
