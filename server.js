// ═══════════════════════════════════════════════════
// EFT TRACKER — server.js
// Multi-user backend with Express + sql.js (SQLite)
// ═══════════════════════════════════════════════════

const express = require('express');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eft-tracker-secret-key-change-in-production';
const DB_PATH = path.join(__dirname, 'eft_tracker.db');

// ═══════ MIDDLEWARE ═══════
app.use(express.json());


// ═══════ DATABASE SETUP ═══════
let db;

async function initDB() {
    const SQL = await initSqlJs();

    // Load existing DB file or create new
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY,
      kappa_found TEXT DEFAULT '[]',
      hideout_built TEXT DEFAULT '[]',
      hideout_inventory TEXT DEFAULT '{}',
      quests_completed TEXT DEFAULT '[]',
      quests_active TEXT DEFAULT '[]',
      player_level INTEGER DEFAULT 1,
      target_quest_id TEXT DEFAULT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT PRIMARY KEY,
      data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    try {
        db.run(`ALTER TABLE profiles ADD COLUMN quests_active TEXT DEFAULT '[]'`);
    } catch (e) { }

    saveDB();
    console.log('  ✓ Database initialized');
}

function saveDB() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Helper to get a single row
function getRow(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
        row = stmt.getAsObject();
    }
    stmt.free();
    return row;
}

// Helper to get all rows
function getAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// ═══════ AUTH MIDDLEWARE ═══════
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token requerido' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(403).json({ error: 'Token inválido o expirado' });
    }
}

// ═══════ AUTH ROUTES ═══════

// Register
app.post('/api/register', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }
        if (username.length < 2 || username.length > 30) {
            return res.status(400).json({ error: 'El usuario debe tener entre 2 y 30 caracteres' });
        }
        if (password.length < 4) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        // Check if user exists
        const existing = getRow('SELECT id FROM users WHERE username = ?', [username]);
        if (existing) {
            return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
        }

        const hash = bcrypt.hashSync(password, 10);
        db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);

        // Get the last inserted ID
        const userResult = getRow('SELECT last_insert_rowid() as id');
        if (!userResult || !userResult.id) {
            throw new Error('No se pudo obtener el ID del usuario creado');
        }
        const userId = userResult.id;

        // Create empty profile
        db.run('INSERT INTO profiles (user_id) VALUES (?)', [userId]);
        saveDB();

        const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: userId, username } });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Error interno del servidor: ' + err.message });
    }
});

// Login
app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        const user = getRow('SELECT * FROM users WHERE username = ?', [username]);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ═══════ PROFILE ROUTES ═══════

// List all profiles (public)
app.get('/api/profiles', (req, res) => {
    const profiles = getAll(`
    SELECT u.id, u.username, u.created_at,
           p.kappa_found, p.hideout_built, p.hideout_inventory, p.quests_completed, p.quests_active, 
           p.player_level, p.target_quest_id, p.updated_at
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    ORDER BY u.username
  `);

    res.json(profiles.map(p => ({
        id: p.id,
        username: p.username,
        created_at: p.created_at,
        updated_at: p.updated_at,
        kappa_found: JSON.parse(p.kappa_found || '[]'),
        hideout_built: JSON.parse(p.hideout_built || '[]'),
        hideout_inventory: JSON.parse(p.hideout_inventory || '{}'),
        quests_completed: JSON.parse(p.quests_completed || '[]'),
        quests_active: JSON.parse(p.quests_active || '[]'),
        player_level: p.player_level || 1,
        target_quest_id: p.target_quest_id
    })));
});

// Get specific profile
app.get('/api/profiles/:id', (req, res) => {
    const profile = getRow(`
    SELECT u.id, u.username, u.created_at,
           p.kappa_found, p.hideout_built, p.hideout_inventory, p.quests_completed, p.quests_active, 
           p.player_level, p.target_quest_id, p.updated_at
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    WHERE u.id = ?
  `, [parseInt(req.params.id)]);

    if (!profile) {
        return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    res.json({
        id: profile.id,
        username: profile.username,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        kappa_found: JSON.parse(profile.kappa_found || '[]'),
        hideout_built: JSON.parse(profile.hideout_built || '[]'),
        hideout_inventory: JSON.parse(profile.hideout_inventory || '{}'),
        quests_completed: JSON.parse(profile.quests_completed || '[]'),
        quests_active: JSON.parse(profile.quests_active || '[]'),
        player_level: profile.player_level || 1,
        target_quest_id: profile.target_quest_id
    });
});

// Update own profile (requires auth)
app.put('/api/profile', authenticateToken, (req, res) => {
    try {
        const { kappa_found, hideout_built, hideout_inventory, quests_completed, quests_active, player_level, target_quest_id } = req.body;

        const sets = [];
        const params = [];

        if (kappa_found !== undefined) {
            sets.push('kappa_found = ?');
            params.push(JSON.stringify(kappa_found));
        }
        if (hideout_built !== undefined) {
            sets.push('hideout_built = ?');
            params.push(JSON.stringify(hideout_built));
        }
        if (hideout_inventory !== undefined) {
            sets.push('hideout_inventory = ?');
            params.push(JSON.stringify(hideout_inventory));
        }
        if (quests_completed !== undefined) {
            sets.push('quests_completed = ?');
            params.push(JSON.stringify(quests_completed));
        }
        if (quests_active !== undefined) {
            sets.push('quests_active = ?');
            params.push(JSON.stringify(quests_active));
        }
        if (player_level !== undefined) {
            sets.push('player_level = ?');
            params.push(player_level);
        }
        if (target_quest_id !== undefined) {
            sets.push('target_quest_id = ?');
            params.push(target_quest_id);
        }

        if (sets.length === 0) {
            return res.status(400).json({ error: 'No hay datos para actualizar' });
        }

        sets.push("updated_at = datetime('now')");
        params.push(req.user.id);

        db.run(`UPDATE profiles SET ${sets.join(', ')} WHERE user_id = ?`, params);
        saveDB();
        res.json({ success: true });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Error al actualizar el perfil' });
    }
});

// ═══════ TARKOV API PROXY & CACHE ═══════
app.post('/api/tarkov-data', async (req, res) => {
    try {
        const { query, variables } = req.body;
        if (!query) return res.status(400).json({ error: 'Query requerida' });

        const hash = crypto.createHash('md5').update(JSON.stringify({ query, variables })).digest('hex');

        // Buscar en caché (vencimiento 24h)
        const cached = getRow("SELECT data FROM api_cache WHERE cache_key = ? AND created_at > datetime('now', '-24 hours')", [hash]);

        if (cached) {
            return res.json(JSON.parse(cached.data));
        }

        // Si no está en caché o venció, llamar a tarkov.dev
        const response = await fetch('https://api.tarkov.dev/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.data) {
            db.run('INSERT OR REPLACE INTO api_cache (cache_key, data, created_at) VALUES (?, ?, datetime("now"))', [hash, JSON.stringify(data)]);
            saveDB();
        }

        res.json(data);
    } catch (err) {
        console.error('Tarkov Proxy Error:', err);
        res.status(500).json({ error: 'Error al obtener datos de Tarkov API' });
    }
});

// Get current user info
app.get('/api/me', authenticateToken, (req, res) => {
    const user = getRow('SELECT id, username, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
});

// ═══════ SERVE FRONTEND ═══════
app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ═══════ START SERVER ═══════
async function start() {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
        console.log('');
        console.log('  ╔═══════════════════════════════════════╗');
        console.log(`  ║   EFT Tracker Server running          ║`);
        console.log(`  ║   http://0.0.0.0:${PORT}               ║`);
        console.log('  ╚═══════════════════════════════════════╝');
        console.log('');
    });
}

start();
