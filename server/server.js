const express = require('express');
const jwt = require('jsonwebtoken');
const util = require('util');
const verifyAsync = util.promisify(jwt.verify);
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(express.json());

// Security: Restrict CORS to allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost', 'http://localhost:80'];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, curl, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `CORS policy: Origin ${origin} not allowed`;
            console.warn(msg);
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

// Security: Rate limiting to prevent abuse
const rateLimit = require('express-rate-limit');

// Rate limiter for sharing endpoint (stricter)
const shareLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 share requests per 15 minutes
    message: 'Too many share requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter for location fetching (more lenient to allow frequent polling)
const locationLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: process.env.LOCATION_RATE_LIMIT_MAX ? parseInt(process.env.LOCATION_RATE_LIMIT_MAX) : 100,
    message: 'Too many location requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiter for geocoding (moderate)
const geocodeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many geocoding requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
});

// Configuration
const PORT = process.env.PORT || 3000;
const DAWARICH_API_URL = process.env.DAWARICH_API_URL;
const DAWARICH_API_KEY = process.env.DAWARICH_API_KEY;
const PHOTON_API_URL = process.env.PHOTON_API_URL || 'https://photon.komoot.io';
const PHOTON_API_KEY = process.env.PHOTON_API_KEY || '';

// Security: Require JWT_SECRET - fail fast if not provided or too short
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('FATAL ERROR: JWT_SECRET environment variable is required for security.');
    console.error('Please set JWT_SECRET to a random string of at least 32 characters.');
    console.error('Example: JWT_SECRET=$(openssl rand -hex 32)');
    process.exit(1);
}

if (JWT_SECRET.length < 32) {
    console.error('FATAL ERROR: JWT_SECRET must be at least 32 characters long for security.');
    console.error(`Current length: ${JWT_SECRET.length}`);
    console.error('Example: JWT_SECRET=$(openssl rand -hex 32)');
    process.exit(1);
}

// Simple in-memory cache
const locationCache = new Map();
const CACHE_TTL = 10 * 1000; // 10 seconds

// Address cache (keyed by rounded lat,lon)
const addressCache = new Map();

// Periodic cleanup of expired cache entries (every 60s)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of locationCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            locationCache.delete(key);
        }
    }
    // Limit address cache size - using LRU eviction (Map keeps insertion order)
    while (addressCache.size > 1000) {
        addressCache.delete(addressCache.keys().next().value);
    }
}, 60 * 1000);

// Helper to resolve address
const resolveAddress = async (lat, lon) => {
    if (!lat || !lon) return null;

    // Round to 4 decimal places (~11m precision) for caching
    const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}`;

    if (addressCache.has(key)) {
        const cachedAddress = addressCache.get(key);
        // Move to the end to maintain LRU order
        addressCache.delete(key);
        addressCache.set(key, cachedAddress);
        return cachedAddress;
    }

    try {
        // Construct URL
        const url = new URL(`${PHOTON_API_URL}/reverse`);
        url.searchParams.append('lat', lat);
        url.searchParams.append('lon', lon);

        const headers = {};
        if (PHOTON_API_KEY) {
            headers['X-API-KEY'] = PHOTON_API_KEY;
        }

        const response = await fetch(url.toString(), { headers });
        if (!response.ok) return null;

        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const props = data.features[0].properties;
            const parts = [];

            // Build address string similar to frontend logic
            if (props.name) parts.push(props.name);
            if (props.housenumber && props.street) parts.push(`${props.housenumber} ${props.street}`);
            else if (props.street) parts.push(props.street);

            if (props.city) parts.push(props.city);
            else if (props.town) parts.push(props.town);
            else if (props.village) parts.push(props.village);

            if (props.country) parts.push(props.country);

            const address = parts.join(', ');
            addressCache.set(key, address);
            return address;
        }
    } catch (err) {
        console.error('Address resolution error:', err.message);
    }
    return null;
};

// Middleware to check configuration
const checkConfig = (req, res, next) => {
    if (!DAWARICH_API_URL || !DAWARICH_API_KEY) {
        return res.status(503).json({ error: 'Server not configured for sharing (Missing API URL/Key)' });
    }
    next();
};

/**
 * POST /api/share
 * Generates a sharing token.
 * Body: { duration: number (seconds), email: string (optional), name: string (optional) }
 */
app.post('/api/share', shareLimiter, checkConfig, (req, res) => {
    const { duration, email, name, styleUrl } = req.body;

    // Default duration: 1 hour
    const expiresIn = duration || 3600;

    const payload = {
        email: email || 'OWNER', // 'OWNER' implies the API key holder
        name: name || 'User',
        styleUrl: styleUrl,
        created_at: Date.now()
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: parseInt(expiresIn) });
    const expiresAt = Date.now() + (parseInt(expiresIn) * 1000);

    res.json({ token, expires_at: expiresAt });
});

/**
 * GET /api/shared/location
 * Returns the location of the user specified in the token.
 * Query: ?token=<jwt_token>
 */
app.get('/api/shared/location', locationLimiter, checkConfig, async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }

    try {
        // Security: Validate token BEFORE serving cache
        const decoded = await verifyAsync(token, JWT_SECRET);

        // Only check cache for valid tokens
        if (locationCache.has(token)) {
            const { data, timestamp } = locationCache.get(token);
            if (Date.now() - timestamp < CACHE_TTL) {
                return res.json(data);
            }
        }
        const targetEmail = decoded.email;

        // Fetch data from Dawarich
        // We need to decide if we fetch the Owner (points) or a Member (families/locations)
        let locationData = null;

        if (targetEmail === 'OWNER') {
            // Fetch Owner Location (Last point)
            // Using logic similar to app.js fetchOwnerLocation
            const startAt = '2000-01-01';
            const params = new URLSearchParams({
                api_key: DAWARICH_API_KEY,
                start_at: startAt,
                per_page: 1,
                order: 'desc'
            });

            // Native fetch (Node 18+)
            const response = await fetch(`${DAWARICH_API_URL}/api/v1/points?${params.toString()}`);
            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const data = await response.json();
            // Data can be array of points or object with points
            let point = null;
            if (Array.isArray(data) && data.length > 0) point = data[0];
            else if (data.points && Array.isArray(data.points) && data.points.length > 0) point = data.points[0];

            if (point) {
                locationData = {
                    email: 'OWNER', // or decoded.email
                    name: decoded.name, // Use name from token (snapshot)
                    latitude: point.latitude || point.lat,
                    longitude: point.longitude || point.lon,
                    battery: point.battery || point.batt,
                    timestamp: point.timestamp || point.tst,
                    address: null // Address resolution is done on client usually, or we can add it here if needed
                };
            }
        } else {
            // Fetch Family Member
            const response = await fetch(`${DAWARICH_API_URL}/api/v1/families/locations?api_key=${DAWARICH_API_KEY}`);
            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const data = await response.json();
            const members = data.locations || [];
            const member = members.find(m => m.email === targetEmail);

            if (member) {
                locationData = {
                    ...member,
                    name: decoded.name // Override name with shared name
                };
            }
        }

        if (locationData) {
            // Resolve address if missing
            if (!locationData.address && locationData.latitude && locationData.longitude) {
                locationData.address = await resolveAddress(locationData.latitude, locationData.longitude);
            } else if (!locationData.address && locationData.lat && locationData.lon) {
                locationData.address = await resolveAddress(locationData.lat, locationData.lon);
            }

            // Include styleUrl from token if available
            if (decoded.styleUrl) {
                locationData.styleUrl = decoded.styleUrl;
            }
            // Include expiration time
            if (decoded.exp) {
                locationData.expires_at = decoded.exp;
            }

            // Store in cache
            locationCache.set(token, {
                data: locationData,
                timestamp: Date.now()
            });

            res.json(locationData);
        } else {
            res.status(404).json({ error: 'Location not found or outdated' });
        }

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(410).json({ error: 'Share link expired' });
        }
        console.error('Share Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Check status endpoint
app.get('/api/status', (req, res) => {
    const configured = !!(DAWARICH_API_URL && DAWARICH_API_KEY);
    res.json({
        status: 'ok',
        configured,
        version: require('./package.json').version
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Configured: ${!!(DAWARICH_API_URL && DAWARICH_API_KEY)}`);
});
