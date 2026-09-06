const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = path.join(__dirname, 'keys.json');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin1234';

// Initialize DB
if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
        keys: {
            "VIP-KEY-30DAYS": {
                expiry: Date.now() + (30 * 24 * 60 * 60 * 1000),
                created_at: new Date().toLocaleString(),
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

// 1. Health check
app.get('/', (req, res) => {
    res.json({ status: "online", message: "BMD Custom Auth Server Running" });
});

// 2. Web Admin Panel Dashboard (UI for User Maintenance)
app.get('/admin', (req, res) => {
    const db = getDB();
    const keys = db.keys;
    const now = Date.now();

    let tableRows = '';
    for (const [keyStr, info] of Object.entries(keys)) {
        const isExpired = now >= info.expiry;
        const remainingSec = Math.max(0, Math.floor((info.expiry - now) / 1000));
        const days = (remainingSec / (24 * 3600)).toFixed(1);
        const statusBadge = isExpired ? 
            '<span style="color:red;font-weight:bold;">EXPIRED</span>' : 
            `<span style="color:green;font-weight:bold;">ACTIVE (${days} Days left)</span>`;

        tableRows += `
        <tr>
            <td style="padding:10px;border:1px solid #444;"><b>${keyStr}</b></td>
            <td style="padding:10px;border:1px solid #444;">${statusBadge}</td>
            <td style="padding:10px;border:1px solid #444;">${new Date(info.expiry).toLocaleString()}</td>
            <td style="padding:10px;border:1px solid #444;">
                <form action="/api/admin/delete-key-web" method="POST" style="margin:0;">
                    <input type="hidden" name="key" value="${keyStr}">
                    <button type="submit" style="background:#ff4d4d;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Delete</button>
                </form>
            </td>
        </tr>`;
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>BMD User & Key Management Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #18191a; color: #e4e6eb; margin: 0; padding: 20px; }
            .container { max-width: 900px; margin: 0 auto; background: #242526; padding: 25px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
            h1, h2 { color: #4080ff; }
            .card { background: #3a3b3c; padding: 20px; border-radius: 8px; margin-bottom: 25px; }
            input, select, button { padding: 10px; font-size: 15px; margin: 5px 0; border-radius: 5px; border: 1px solid #555; background: #242526; color: #fff; }
            input[type="text"], input[type="number"] { width: 90%; }
            button { background: #0084ff; color: white; border: none; font-weight: bold; cursor: pointer; padding: 12px 20px; }
            button:hover { background: #006bce; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #4080ff; color: white; padding: 12px; text-align: left; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>👑 BMD Key & User Management Panel</h1>
            <p>Welcome! Here you can create, extend, and manage user keys for your BMD app.</p>

            <div class="card">
                <h2>➕ Generate New User Key</h2>
                <form action="/api/admin/create-key-web" method="POST">
                    <label><b>Key Name / Code:</b></label><br>
                    <input type="text" name="key" placeholder="e.g. USER-JOHN-99" required><br><br>
                    <label><b>Validity (Days):</b></label><br>
                    <input type="number" name="days" value="30" min="1" required><br><br>
                    <button type="submit">Create Key Now</button>
                </form>
            </div>

            <div class="card">
                <h2>📋 Active User Keys (${Object.keys(keys).length})</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Key Name</th>
                            <th>Status</th>
                            <th>Expiry Date</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows || '<tr><td colspan="4" style="padding:15px;text-align:center;">No keys found. Create one above!</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>`;

    res.send(html);
});

// Admin Web Action - Create Key
app.post('/api/admin/create-key-web', (req, res) => {
    const { key, days } = req.body;
    if (key && days) {
        const db = getDB();
        const numDays = parseInt(days) || 30;
        const expiryTime = Date.now() + (numDays * 24 * 60 * 60 * 1000);

        db.keys[key.trim()] = {
            expiry: expiryTime,
            created_at: new Date().toLocaleString(),
            enabled: true
        };
        saveDB(db);
    }
    res.redirect('/admin');
});

// Admin Web Action - Delete Key
app.post('/api/admin/delete-key-web', (req, res) => {
    const { key } = req.body;
    if (key) {
        const db = getDB();
        delete db.keys[key.trim()];
        saveDB(db);
    }
    res.redirect('/admin');
});

// API Endpoint for App Activation
app.post('/api/activate', (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Key is required", code: -1 });

    const db = getDB();
    const userKey = db.keys[key.trim()];

    if (!userKey || !userKey.enabled) return res.json({ status: -2, error: "Invalid Key" });

    const now = Date.now();
    if (now >= userKey.expiry) return res.json({ status: -2, error: "KEY EXPIRED", remaining_seconds: 0 });

    const remainingSeconds = Math.floor((userKey.expiry - now) / 1000);
    return res.json({ status: 1, message: "Success", remaining_seconds: remainingSeconds, key: key });
});

// API Endpoint for App Status
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BMD Server running on port ${PORT}`));
