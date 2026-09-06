const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DB_FILE = path.join(__dirname, 'keys.json');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin1234'; // Default admin secret key

// Initialize database file if not exists
if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
        keys: {
            "VIP-KEY-30DAYS": {
                expiry: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
                created_at: new Date().toISOString(),
                enabled: true
            },
            "TEST-KEY-7DAYS": {
                expiry: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
                created_at: new Date().toISOString(),
                enabled: true
            }
        }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
}

function getDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
        return { keys: {} };
    }
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// 1. Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: "online", message: "BMD Custom Auth Server Running" });
});

// 2. User Key Activation Endpoint
app.post('/api/activate', (req, res) => {
    const { key } = req.body;
    if (!key) {
        return res.status(400).json({ error: "Key is required", code: -1 });
    }

    const db = getDB();
    const userKey = db.keys[key.trim()];

    if (!userKey) {
        return res.json({ status: -2, error: "Invalid Key" });
    }

    if (!userKey.enabled) {
        return res.json({ status: -2, error: "Key Disabled" });
    }

    const now = Date.now();
    if (now >= userKey.expiry) {
        return res.json({ status: -2, error: "KEY EXPIRED", remaining_seconds: 0 });
    }

    const remainingSeconds = Math.floor((userKey.expiry - now) / 1000);

    return res.json({
        status: 1,
        message: "Activation Successful",
        remaining_seconds: remainingSeconds,
        key: key
    });
});

// 3. User Status Check Endpoint
app.post('/api/status', (req, res) => {
    const { key } = req.body;
    const db = getDB();
    const userKey = db.keys[key ? key.trim() : ''];

    if (!userKey || !userKey.enabled || Date.now() >= userKey.expiry) {
        return res.json({ remaining_seconds: 0, status: "expired" });
    }

    const remainingSeconds = Math.floor((userKey.expiry - Date.now()) / 1000);
    return res.json({ remaining_seconds: remainingSeconds, status: "active" });
});

// 4. Admin API - Generate New Key
// Usage: GET /api/admin/create-key?secret=admin1234&key=MYKEY&days=30
app.get('/api/admin/create-key', (req, res) => {
    const { secret, key, days } = req.query;
    if (secret !== ADMIN_SECRET) {
        return res.status(401).json({ error: "Unauthorized Secret" });
    }
    if (!key || !days) {
        return res.status(400).json({ error: "Missing 'key' or 'days' parameter" });
    }

    const db = getDB();
    const numDays = parseInt(days) || 30;
    const expiryTime = Date.now() + (numDays * 24 * 60 * 60 * 1000);

    db.keys[key.trim()] = {
        expiry: expiryTime,
        created_at: new Date().toISOString(),
        enabled: true
    };

    saveDB(db);

    res.json({
        success: true,
        message: `Key '${key}' created for ${numDays} days`,
        expiry_date: new Date(expiryTime).toLocaleString()
    });
});

// 5. Admin API - List All Keys
// Usage: GET /api/admin/list-keys?secret=admin1234
app.get('/api/admin/list-keys', (req, res) => {
    const { secret } = req.query;
    if (secret !== ADMIN_SECRET) {
        return res.status(401).json({ error: "Unauthorized Secret" });
    }

    const db = getDB();
    res.json({ total_keys: Object.keys(db.keys).length, keys: db.keys });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BMD Auth Server listening on port ${PORT}`);
});
