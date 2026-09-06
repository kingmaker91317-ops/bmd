const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = path.join(__dirname, 'keys.json');

// Memory store backup for Render ephemeral disks
let memoryStore = {
    keys: {
        "ADMIN-TEST-KEY": {
            expiry: Date.now() + (30 * 24 * 60 * 60 * 1000),
            created_at: new Date().toLocaleDateString(),
            days: 30,
            enabled: true
        }
    }
};

// Load initial DB if file exists
if (fs.existsSync(DB_FILE)) {
    try {
        const fileData = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
        if (fileData && fileData.keys) {
            memoryStore = fileData;
        }
    } catch (e) {}
}

function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(memoryStore, null, 2));
    } catch (e) {}
}

// ==========================================
// 👑 WEB ADMIN PANEL (USER & KEY MANAGEMENT)
// ==========================================

app.get('/', (req, res) => {
    const keys = memoryStore.keys;
    const now = Date.now();

    let keyRows = '';
    let totalActive = 0;

    for (const [keyStr, info] of Object.entries(keys)) {
        const isExpired = now >= info.expiry;
        const remainingSec = Math.max(0, Math.floor((info.expiry - now) / 1000));
        const daysLeft = (remainingSec / (24 * 3600)).toFixed(1);

        if (!isExpired) totalActive++;

        const statusBadge = isExpired ? 
            '<span class="badge expired">Expired ❌</span>' : 
            `<span class="badge active">Active (${daysLeft} Days Left) ✅</span>`;

        keyRows += `
        <tr>
            <td><code class="key-text">${keyStr}</code></td>
            <td>${statusBadge}</td>
            <td>${info.days || 30} Days</td>
            <td>${new Date(info.expiry).toLocaleDateString()}</td>
            <td>
                <button onclick="copyKey('${keyStr}')" class="btn btn-copy">📋 Copy Key</button>
                <form action="/admin/delete-key" method="POST" style="display:inline;" onsubmit="return confirm('Delete key ${keyStr}?');">
                    <input type="hidden" name="key" value="${keyStr}">
                    <button type="submit" class="btn btn-delete">🗑️ Delete</button>
                </form>
            </td>
        </tr>`;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BMD User & Key Control Center</title>
        <style>
            * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
            body { background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
            .main-card { max-width: 950px; margin: 20px auto; background: #1e293b; border-radius: 12px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
            h1 { color: #38bdf8; margin-top: 0; display: flex; align-items: center; gap: 10px; font-size: 26px; }
            .stats { display: flex; gap: 15px; margin-bottom: 25px; }
            .stat-box { background: #334155; padding: 15px 20px; border-radius: 8px; flex: 1; text-align: center; }
            .stat-number { font-size: 24px; font-weight: bold; color: #38bdf8; }
            .form-box { background: #0f172a; padding: 20px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 30px; }
            .form-group { margin-bottom: 15px; }
            label { font-weight: 600; display: block; margin-bottom: 6px; color: #94a3b8; }
            input[type="text"], input[type="number"] { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #fff; font-size: 15px; }
            .btn-create { background: #0284c7; color: white; border: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; font-size: 16px; cursor: pointer; width: 100%; transition: 0.2s; }
            .btn-create:hover { background: #0369a1; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 14px; text-align: left; border-bottom: 1px solid #334155; }
            th { background: #334155; color: #38bdf8; font-weight: 600; }
            .key-text { background: #0f172a; padding: 6px 10px; border-radius: 4px; color: #f43f5e; font-size: 15px; font-weight: bold; border: 1px solid #334155; }
            .badge { padding: 5px 10px; border-radius: 20px; font-size: 13px; font-weight: bold; }
            .active { background: #065f46; color: #34d399; }
            .expired { background: #881337; color: #fda4af; }
            .btn { border: none; padding: 7px 12px; border-radius: 5px; cursor: pointer; font-size: 13px; font-weight: 600; }
            .btn-copy { background: #334155; color: #38bdf8; margin-right: 5px; }
            .btn-copy:hover { background: #475569; }
            .btn-delete { background: #991b1b; color: #fca5a5; }
            .btn-delete:hover { background: #b91c1c; }
            #alert { display: none; background: #166534; color: #4ade80; padding: 12px; border-radius: 6px; margin-bottom: 15px; text-align: center; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="main-card">
            <h1>👑 BMD Key & User Management Portal</h1>
            <p style="color:#94a3b8;">Create new keys for users, manage active keys, and monitor validity.</p>
            
            <div id="alert">Key Copied to Clipboard! 📋</div>

            <div class="stats">
                <div class="stat-box">
                    <div class="stat-number">${Object.keys(keys).length}</div>
                    <div style="color:#94a3b8;font-size:13px;">Total Keys Created</div>
                </div>
                <div class="stat-box">
                    <div class="stat-number" style="color:#34d399;">${totalActive}</div>
                    <div style="color:#94a3b8;font-size:13px;">Active Users</div>
                </div>
            </div>

            <!-- KEY CREATION FORM -->
            <div class="form-box">
                <h2 style="margin-top:0;color:#f8fafc;font-size:18px;">➕ Create New Key for User</h2>
                <form action="/admin/create-key" method="POST">
                    <div class="form-group">
                        <label>User Key Name / Code:</label>
                        <input type="text" name="key" placeholder="Enter key name (e.g. USER-ALEX-99)" required>
                    </div>
                    <div class="form-group">
                        <label>Validity Duration (Days):</label>
                        <input type="number" name="days" value="30" min="1" max="365" required>
                    </div>
                    <button type="submit" class="btn-create">🚀 Generate Key & Save</button>
                </form>
            </div>

            <!-- KEY LIST TABLE -->
            <h2 style="color:#f8fafc;font-size:18px;">🔑 All Generated User Keys</h2>
            <table>
                <thead>
                    <tr>
                        <th>User Key</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Expiry Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${keyRows || '<tr><td colspan="5" style="text-align:center;color:#64748b;">No user keys generated yet. Create one above!</td></tr>'}
                </tbody>
            </table>
        </div>

        <script>
            function copyKey(text) {
                navigator.clipboard.writeText(text);
                const alt = document.getElementById('alert');
                alt.style.display = 'block';
                setTimeout(() => { alt.style.display = 'none'; }, 2000);
            }
        </script>
    </body>
    </html>`;

    res.send(html);
});

// Admin Form - Create New Key
app.post('/admin/create-key', (req, res) => {
    const { key, days } = req.body;
    if (key && days) {
        const numDays = parseInt(days) || 30;
        const expiryTime = Date.now() + (numDays * 24 * 60 * 60 * 1000);

        memoryStore.keys[key.trim()] = {
            expiry: expiryTime,
            created_at: new Date().toLocaleDateString(),
            days: numDays,
            enabled: true
        };
        saveDB();
    }
    res.redirect('/');
});

// Admin Form - Delete Key
app.post('/admin/delete-key', (req, res) => {
    const { key } = req.body;
    if (key && memoryStore.keys[key.trim()]) {
        delete memoryStore.keys[key.trim()];
        saveDB();
    }
    res.redirect('/');
});

// ==========================================
// 📱 APP ACTIVATION & STATUS API ENDPOINTS
// ==========================================

// App Activation Endpoint
app.post('/api/activate', (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: "Key is required", code: -1 });

    const userKey = memoryStore.keys[key.trim()];

    if (!userKey || !userKey.enabled) {
        return res.json({ status: -2, error: "Invalid Key" });
    }

    const now = Date.now();
    if (now >= userKey.expiry) {
        return res.json({ status: -2, error: "KEY EXPIRED", remaining_seconds: 0 });
    }

    const remainingSeconds = Math.floor((userKey.expiry - now) / 1000);
    return res.json({
        status: 1,
        message: "Key Activated Successfully",
        remaining_seconds: remainingSeconds,
        key: key
    });
});

// App Expiry Status Endpoint
app.post('/api/status', (req, res) => {
    const { key } = req.body;
    const userKey = memoryStore.keys[key ? key.trim() : ''];

    if (!userKey || !userKey.enabled || Date.now() >= userKey.expiry) {
        return res.json({ remaining_seconds: 0, status: "expired" });
    }

    const remainingSeconds = Math.floor((userKey.expiry - Date.now()) / 1000);
    return res.json({ remaining_seconds: remainingSeconds, status: "active" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BMD Key Management Server listening on port ${PORT}`));
