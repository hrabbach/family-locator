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
-   **Swift Setup**: Quickly configure the app by scanning a configuration QR code from your Dawarich profile or via secure manual entry.
-   **Remote Configuration**: Share or deploy pre-configured instances by passing all settings and name mappings via URL parameters.
-   **Screen Wake Lock**: Keep your device screen active while tracking to avoid interruptions.
-   **Reverse Geocoding**: Automatically resolve latitude/longitude into human-readable addresses using the Photon API. Features local caching to minimize API calls and ensure snappy UI updates.
-   **Stationary Mode**: Configure a fixed location for wall-mounted displays to see distances to the owner and track them on the map.
-   **Dual Map Engines**: Choose between modern Vector maps (MapLibre GL JS) or classic Raster maps (Leaflet) based on your device performance and preference.
-   **Custom Map Styles**: When using Vector mode, override the default OpenFreeMap style with any MapLibre-compatible JSON style URL (e.g., from Protomaps or MapTiler).

> [!CAUTION]
> ### Security Warning
> Using URL parameters to configure the app (especially the `key` parameter) will put your API key in the browser history.
> **Avoid using this on public or shared computers.**
> The app attempts to "clean" the URL from the address bar immediately after ingestion, but it may still remain in the browser's history log.

## URL Parameters

Control the app or perform one-time setup via URL parameters:

### Configuration (One-Time Setup)
These parameters will be stored in the browser's local storage and the URL will be cleaned immediately.

-   **`server`**: Dawarich Base URL (e.g., `https://dawarich.example.com`).
-   **`key`**: Your Dawarich API Key.
-   **`name`**: Your display name as the owner.
-   **`geocode`**: Enable reverse geocoding (`true`/`false`).
-   **`photon`**: Custom Photon API URL.
-   **`awake`**: Enable Screen Wake Lock (`true`/`false`).
-   **`lat`**: Fixed latitude for Stationary Mode.
-   **`lon`**: Fixed longitude for Stationary Mode.
-   **`engine`**: Map engine selection (`maplibre` or `leaflet`).
-   **`style`**: Custom MapLibre Style JSON URL (only applies if `engine` is `maplibre`).
-   **`names`**: Email-to-name mappings. Format: `email:name;email:name` (e.g., `user1@me.com:John;user2@me.com:Jane`).
-   **`config`**: A Base64-encoded JSON string containing multiple settings. You can generate this using the **"Copy Shareable Config URL"** button in the app settings.

### Dynamic View Parameters
These control the current session and are not permanently stored.

-   **`emails=...`**: Pre-select family members to track on the map.
    -   `?emails=all`: Selects all family members.
    -   `?emails=user1@example.com,user2@example.com`: Selects specific members by email.
-   **`show_owner=true`**: Automatically includes your own location (API owner) on the map alongside selected members.
-   **`collapsed=true`**: Starts the map with the member overlay collapsed.

*Example Individual Setup*: `https://your-locator.com/?server=https://dawarich.io&key=secret_123&name=Holger`
*Example Bulk Setup*: `https://your-locator.com/?config=eyJjb25maW...`

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

## Stationary Device Mode

Ideal for wall-mounted displays (e.g., ViewAssist connected to HomeAssistant) or desktop usage where the device does not move.

-   **Fixed Location**: Manually configure the latitude and longitude of the display device. This bypasses browser geolocation, ensuring privacy and battery savings.
-   **Owner Distance**: In this mode, the dashboard displays the distance from the stationary device to the API Owner's last known location.
-   **Owner Tracking**: The Owner can be selected for tracking on the map just like other family members.

To set up:
1.  Go to **Settings**.
2.  Check **"Stationary Device Mode"**.
3.  Enter the **Fixed Latitude** and **Fixed Longitude**.
4.  Click **"Start Tracking"**.

Alternatively, configure via URL: `?lat=51.505&lon=-0.09`

## Map Configuration

You can switch between two map engines in the **Settings** view:

1.  **MapLibre GL JS (Vector - Default)**: Uses modern vector tiles.
    -   *Default Style*: Loads `./style.json` (OpenFreeMap 'Liberty'). You can modify this file directly to change the default appearance.
    -   *Custom Style*: Enter a URL to any MapLibre-compatible style JSON (e.g., from Protomaps, MapTiler, or a self-hosted style).
2.  **Leaflet (Raster - Classic)**: Uses traditional OpenStreetMap raster tiles.
    -   Best for older devices or low-bandwidth environments.

## Installation

Family Locator is built with standard web technologies (HTML, CSS, JS) and can be hosted on any static web server.

1.  Copy the project files to your web server's public directory (e.g., `/familytrack/`).
2.  Open the URL in your browser.
3.  Enter your Dawarich Base URL and API Key (or scan your config QR).
4.  (Optional) "Add to Home Screen" via your browser's menu to install as a PWA.

---
*Maintained with built-in cache-busting, dual map engine support (MapLibre/Leaflet), and Service Worker capability.*
