# Family Locator

A lightweight, self-hosted Progressive Web App (PWA) for tracking family members' locations using the Dawarich API. Built with modern ES6 module architecture for improved maintainability and caching.

![Version](https://img.shields.io/badge/version-2.11.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
  - [Docker Deployment (Recommended)](#docker-deployment-recommended)
  - [Manual Deployment](#manual-deployment)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [URL Parameters](#url-parameters)
- [Features Guide](#features-guide)
  - [Location Sharing](#location-sharing)
  - [Reverse Geocoding](#reverse-geocoding)
  - [Stationary Device Mode](#stationary-device-mode)
  - [Map Configuration](#map-configuration)
- [Architecture](#architecture)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

---

## Overview

Family Locator provides a premium, mobile-first dashboard and interactive map view for staying connected with your loved ones. It fetches location data every 10 seconds from your self-hosted Dawarich server, handling everything client-side for privacy and speed.

---

## Key Features

### 📍 Real-Time Tracking
- **Live Dashboard**: Battery status, charging indicators, and human-readable "last seen" times
- **10-Second Refresh**: Automatic polling for near real-time updates
- **Proximity Tracking**: View distances between your location and family members using Haversine calculations

### 🗺️ Advanced Mapping
- **Dual Map Engines**: Choose between MapLibre GL JS (vector) or Leaflet (raster)
- **Multi-Selection**: Track multiple family members simultaneously
- **Auto-Fit**: Intelligently zooms to keep all markers visible
- **Unified Overlay**: Clean, collapsible interface with member details

### 🎨 Customization
- **Color-Coded Members**: Unique colors synchronized between dashboard and map
- **Editable Names**: Personalize display names for all members
- **Custom Map Styles**: Use any MapLibre-compatible style JSON

### 🔐 Security & Privacy
- **Client-Side Storage**: API keys stored securely in browser localStorage
- **Secure Sharing**: Generate temporary, time-limited location sharing links (JWT-based)
- **No Third-Party Tracking**: All data stays between you and your Dawarich instance

### 🚀 Progressive Web App
- **Installable**: Add to home screen on mobile/desktop
- **Offline Ready**: Service worker caching for core functionality
- **Responsive Design**: Optimized for all screen sizes

### 🔧 Advanced Features
- **Reverse Geocoding**: Convert coordinates to addresses via Photon API
- **Stationary Mode**: Fixed location for wall-mounted displays (e.g., Home Assistant)
- **Screen Wake Lock**: Keep display active during tracking
- **QR Code Setup**: Instant configuration via Dawarich profile QR codes
- **Remote Configuration**: Deploy pre-configured instances via URL parameters

---

## Quick Start

### Docker Deployment (Recommended)

The recommended deployment method includes both the static frontend and Node.js backend for full feature support.

#### Basic Deployment

```bash
docker run -d \
  -p 8080:80 \
  -e DAWARICH_API_URL="https://your-dawarich-instance.com" \
  -e DAWARICH_API_KEY="your-api-key" \
  --name family-locator \
  hrabbach/family-locator:latest
```

Access at: `http://localhost:8080`

#### Full Configuration with All Features

```bash
docker run -d \
  -p 8080:80 \
  -e DAWARICH_API_URL="https://dawarich.example.com" \
  -e DAWARICH_API_KEY="your-dawarich-api-key-here" \
  -e JWT_SECRET="your-random-secret-for-signing-tokens" \
  -e CORS_ORIGINS="*" \
  -e PHOTON_API_URL="https://photon.komoot.io" \
  -e PHOTON_API_KEY="" \
  --name family-locator \
  --restart unless-stopped \
  hrabbach/family-locator:latest
```

#### Docker Compose

```yaml
version: '3.8'
services:
  family-locator:
    image: hrabbach/family-locator:latest
    container_name: family-locator
    ports:
      - "8080:80"
    environment:
      DAWARICH_API_URL: "https://your-dawarich-instance.com"
      DAWARICH_API_KEY: "your-api-key"
      JWT_SECRET: "optional-random-secret-string"
      CORS_ORIGINS: "*"
      PHOTON_API_URL: "https://photon.komoot.io"
      PHOTON_API_KEY: ""
    restart: unless-stopped
```

#### Subpath Deployment

The container is location-agnostic and works seamlessly under subpaths:

```nginx
# Example nginx reverse proxy configuration
location /familytrack/ {
    proxy_pass http://localhost:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Access at: `https://example.com/familytrack/`

---

### Manual Deployment

For static-only deployments without the location sharing feature.

#### Prerequisites

- Web server (nginx, Apache, Caddy, etc.)
- **CRITICAL**: Server must serve JavaScript files with `Content-Type: application/javascript` MIME type

#### Installation Steps

1. **Copy Files**
   ```bash
   git clone https://github.com/hrabbach/family-locator.git
   cp -r family-locator/* /var/www/html/familytrack/
   ```

2. **Configure Web Server**

   **Nginx Example** (`/etc/nginx/sites-available/familytrack`):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /var/www/html/familytrack;
       index index.html;

       # CRITICAL: Ensure correct MIME types for ES6 modules
       location ~ \.js$ {
           add_header Content-Type application/javascript;
       }

       # SPA fallback
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

   **Apache Example** (`.htaccess`):
   ```apache
   # Force correct MIME type for JavaScript
   <FilesMatch "\.js$">
       ForceType application/javascript
   </FilesMatch>

   # SPA fallback
   RewriteEngine On
   RewriteBase /
   RewriteRule ^index\.html$ - [L]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.html [L]
   ```

3. **Access the App**
   - Navigate to `http://your-domain.com`
   - Enter your Dawarich credentials or scan QR code
   - (Optional) Install as PWA via browser menu

> [!IMPORTANT]
> **MIME Type Configuration is Critical**
> 
> ES6 modules require strict MIME type checking. If JavaScript files are served with `text/html` or incorrect MIME types, the app will fail to load. Always verify:
> ```bash
> curl -I https://your-domain.com/app.js | grep -i content-type
> # Should return: Content-Type: application/javascript
> ```

> [!NOTE]
> **Limited Functionality in Manual Deployment**
> 
> The "Share Live Location" feature requires the Node.js backend and will not be available in static-only deployments.

---

## Configuration

### Environment Variables

These variables configure the Docker container's backend services.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DAWARICH_API_URL` | **Yes** | - | Full URL to your Dawarich instance<br>Example: `https://dawarich.example.com` |
| `DAWARICH_API_KEY` | **Yes** | - | Your Dawarich API key for backend location sharing<br>⚠️ Keep this secret! |
| `JWT_SECRET` | No | Random UUID | Secret string for signing JWT tokens<br>⚠️ If not set, sharing links invalidate on container restart |
| `CORS_ORIGINS` | No | `*` | Comma-separated list of allowed origins for CORS<br>Example: `https://app1.com,https://app2.com`<br>Use `*` to allow all origins (development only) |
| `PHOTON_API_URL` | No | `https://photon.komoot.io` | Photon geocoding API endpoint<br>Use custom instance for high-volume usage |
| `PHOTON_API_KEY` | No | `""` | API key for Photon service (if required by provider) |

**Example Production Setup:**
```bash
# Generate a secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)

docker run -d \
  -p 8080:80 \
  -e DAWARICH_API_URL="https://dawarich.myserver.com" \
  -e DAWARICH_API_KEY="${DAWARICH_API_KEY}" \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e CORS_ORIGINS="https://myapp.com,https://admin.myapp.com" \
  -e PHOTON_API_URL="https://photon.komoot.io" \
  --name family-locator \
  --restart unless-stopped \
  hrabbach/family-locator:latest
```

---

### URL Parameters

Control the app behavior via URL parameters for one-time setup or dynamic views.

#### Configuration Parameters (Stored in localStorage)

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `server` | URL | `https://dawarich.io` | Dawarich base URL |
| `key` | String | `abc123...` | Dawarich API key ⚠️ |
| `name` | String | `Holger` | Your display name (API owner) |
| `geocode` | Boolean | `true` | Enable reverse geocoding |
| `photon` | URL | `https://photon.example.com` | Custom Photon API URL |
| `awake` | Boolean | `true` | Enable screen wake lock |
| `lat` | Number | `51.505` | Fixed latitude (stationary mode) |
| `lon` | Number | `-0.09` | Fixed longitude (stationary mode) |
| `engine` | String | `maplibre` | Map engine: `maplibre` or `leaflet` |
| `style` | URL | `https://...style.json` | Custom MapLibre style URL |
| `names` | String | `user@ex.com:John;...` | Email-to-name mappings |
| `config` | Base64 | `eyJjb25ma...` | Base64-encoded JSON containing all settings<br>**Generate**: Click "Copy Shareable Config URL" in app Settings |

> [!CAUTION]
> **API Key in Browser History**
> 
> Using the `key` parameter exposes your API key in browser history. The app cleans the URL immediately, but the key may persist in logs. **Avoid on shared/public computers.**

#### Dynamic View Parameters (Session only)

| Parameter | Example | Description |
|-----------|---------|-------------|
| `emails` | `all`<br>or<br>`user1@ex.com,user2@ex.com` | Pre-select members for map view<br>`all` = select all members<br>Comma-separated = select specific members |
| `show_owner` | `true` | Include owner location on map |
| `collapsed` | `true` | Start map with overlay collapsed |
| `token` | `jwt.token.here` | Activate shared mode (from sharing link) |

**Example URLs:**
```
# Quick setup
https://your-locator.com/?server=https://dawarich.io&key=abc123&name=John

# Bulk configuration
https://your-locator.com/?config=eyJzZXJ2ZXIiOiJodH...

# Pre-configured map view
https://your-locator.com/?emails=all&show_owner=true&collapsed=true
```

---

## Features Guide

### Location Sharing

Generate secure, time-limited sharing links for friends and family.

**How it Works:**
1. Click "Share Live Location" button in dashboard
2. Select member and duration (1h, 4h, 8h, or 24h)
3. Copy the generated link (or share directly via mobile share dialog)
4. Recipients see your location on a map without needing your API keys

**Technical Details:**
- Uses JWT tokens signed with `JWT_SECRET`
- Tokens expire automatically
- Recipients can merge shared location into their own map
- Requires Docker deployment with Node.js backend

---

### Reverse Geocoding

Convert coordinates to human-readable addresses using the Photon API.

**Setup:**
1. Open Settings in the app
2. Enable "Reverse Geocoding (Address Lookup)"
3. (Optional) Enter custom Photon API URL
4. (Optional) Provide Photon API key if required
5. Save configuration

**Features:**
- Local caching to minimize API calls
- Queued requests with rate limiting
- Persistent address storage across refreshes
- Coordinates shown as fallback if geocoding fails

---

### Stationary Device Mode

Perfect for wall-mounted displays or fixed monitoring stations.

**Use Cases:**
- Home Assistant ViewAssist displays
- Office dashboard monitors
- Fixed security stations

**Configuration:**
1. Go to Settings
2. Enable "Stationary Device Mode"
3. Enter fixed latitude and longitude
4. Distances will show from this location to all members

**Alternatively via URL:**
```
https://your-locator.com/?lat=51.505&lon=-0.09
```

---

### Map Configuration

#### Map Engines

**MapLibre GL JS (Vector - Default)**
- Modern vector tile rendering
- Smooth zoom and rotation
- Lower bandwidth usage
- Default style: OpenFreeMap 'Liberty'

**Leaflet (Raster - Classic)**
- Traditional OpenStreetMap tiles
- Better for older devices
- Lower CPU usage
- Simpler rendering

#### Custom Map Styles (MapLibre Only)

Use any MapLibre-compatible style JSON:

```
# Protomaps Light
https://api.protomaps.com/styles/v2/light.json

# MapTiler Basic
https://api.maptiler.com/maps/basic-v2/style.json?key=YOUR_KEY

# Self-hosted
https://your-server.com/custom-style.json
```

Configure via:
- Settings UI → Map Style URL field
- URL parameter: `?style=https://...style.json`

---

## Architecture

### Frontend
- **Technology**: Vanilla JavaScript (ES6 Modules)
- **Module Count**: 8 specialized modules (~2,380 lines)
  - `utils.js` - Helper functions
  - `config.js` - Configuration management
  - `geocoding.js` - Address resolution
  - `api.js` - Data fetching with retry logic
  - `state.js` - Centralized state management
  - `ui.js` - DOM manipulation
  - `map.js` - Map engine abstraction
  - `main.js` - Application entry point

### Backend (Docker Only)
- **Server**: Nginx (static assets) + Node.js (API)
- **Features**: JWT-based location sharing, geocoding proxy

### Storage
- **localStorage**: Configuration, name mappings, address cache
- **No Cookies**: Fully client-side storage
- **Service Worker**: Offline capability and asset caching

---

## Security Considerations

### Best Practices

1. **API Key Protection**
   - Never commit API keys to version control
   - Use environment variables in Docker deployments
   - Rotate keys periodically

2. **JWT Secret Management**
   - Set a strong, random `JWT_SECRET` in production
   - Store securely (e.g., Docker secrets, environment variables)
   - Don't expose in client-side code

3. **HTTPS Requirements**
   - Always use HTTPS in production
   - Required for geolocation API
   - Required for service worker registration

4. **URL Parameter Security**
   - Avoid `?key=...` on shared computers
   - Use `?config=...` (Base64) for bulk setup
   - Prefer QR code scanning for initial setup

5. **Sharing Links**
   - Set appropriate expiration times
   - Revoke by restarting container (changes JWT_SECRET)
   - Monitor for unauthorized access

### Security Features

- ✅ HTML escaping prevents XSS attacks
- ✅ No third-party analytics or tracking
- ✅ Client-side-only configuration storage
- ✅ JWT-signed sharing tokens
- ✅ Rate-limited geocoding requests

---

## Troubleshooting

### Common Issues

**App Won't Load / Blank Page**
```
1. Check browser console for errors
2. Verify JavaScript MIME types:
   curl -I https://your-domain.com/app.js | grep content-type
3. Should be: application/javascript
4. Fix nginx/Apache configuration if incorrect
```

**"Failed to Fetch" Errors**
```
1. Verify Dawarich URL is accessible
2. Check API key is valid
3. Ensure CORS is properly configured on Dawarich
4. Check browser network tab for exact error
```

**Location Sharing Not Working**
```
1. Ensure using Docker deployment (not manual)
2. Verify JWT_SECRET is set
3. Check backend logs: docker logs family-locator
4. Confirm DAWARICH_API_KEY is set correctly
```

**Map Not Displaying**
```
1. Check internet connection (CDN resources required)
2. Verify map engine selection in settings
3. Try switching between Leaflet and MapLibre
4. Check console for script loading errors
```

**Service Worker Issues**
```
1. Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Clear site data in DevTools → Application → Storage
3. Verify HTTPS is used (required for service workers)
4. Check console for registration errors
```

### Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS 14+, Android Chrome 90+)

**Required Features:**
- ES6 Module support
- LocalStorage API
- Fetch API
- Service Workers (for PWA)

---

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Test thoroughly
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Acknowledgments

- [Dawarich](https://github.com/Freika/dawarich) - Location tracking backend
- [Photon](https://photon.komoot.io) - Geocoding service
- [Leaflet](https://leafletjs.com) - Raster map library
- [MapLibre GL JS](https://maplibre.org) - Vector map library
- [OpenFreeMap](https://openfreemap.org) - Free map tiles

---

**Version**: 2.11.1 | **Maintained by**: Holger Rabbach | **Repository**: [GitHub](https://github.com/hrabbach/family-locator)
