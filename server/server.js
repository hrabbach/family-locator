const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Configuration
const PORT = process.env.PORT || 3000;
const DAWARICH_API_URL = process.env.DAWARICH_API_URL;
const DAWARICH_API_KEY = process.env.DAWARICH_API_KEY;
// If no secret provided, generate one (invalidates tokens on restart, which is fine for simple setups)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

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
app.post('/api/share', checkConfig, (req, res) => {
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
app.get('/api/shared/location', checkConfig, async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const targetEmail = decoded.email;

        // Fetch data from Dawarich
        // We need to decide if we fetch the Owner (points) or a Member (families/locations)
        let locationData = null;

        if (targetEmail === 'OWNER') {
            // Fetch Owner Location (Last point)
            // Using logic similar to app.js fetchOwnerLocation
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const params = new URLSearchParams({
                api_key: DAWARICH_API_KEY,
                start_at: yesterday,
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
            // Include styleUrl from token if available
            if (decoded.styleUrl) {
                locationData.styleUrl = decoded.styleUrl;
            }
            // Include expiration time
            if (decoded.exp) {
                locationData.expires_at = decoded.exp;
            }
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
