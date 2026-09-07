const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Hakikisha folda ya uploads ipo
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Sanidi Multer kwa ajili ya kupokea picha
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ================= SETUP BETTER-SQLITE3 DATABASE =================
const dbFile = path.join(__dirname, 'database_v2.db');
const db = new Database(dbFile);
console.log('Imeunganishwa na SQLite Database kwa mafanikio kupitia better-sqlite3.');

app.get('/health', (req, res) => {
    res.json({ success: true, status: 'ok' });
});

// Unda tables kama hazipo na weka admin wa kwanza
// 1. Table ya Admins
db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        passcode TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT,
        regNumber TEXT UNIQUE,
        role TEXT,
        password TEXT
    )
`);

// Weka admin chaguo-msingi kama hana bado
const adminCheck = db.prepare(`SELECT COUNT(*) as count FROM admins`).get();
if (adminCheck.count === 0) {
    db.prepare(`INSERT INTO admins (username, password, passcode) VALUES (?, ?, ?)`).run('will', '5821', '5821');
}

// 2. Table ya Users (Wanafunzi na Staff)
db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT,
    regNumber TEXT UNIQUE,
    role TEXT,
    password TEXT
)`).run();

// 3. Table ya Posts (Posti zote)
db.prepare(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    category TEXT,
    title TEXT,
    location TEXT,
    contact TEXT,
    description TEXT,
    date TEXT,
    imageUrl TEXT,
    author TEXT
)`).run();

// Weka posti ya mfano kama table haina posti yoyote
const postCheck = db.prepare(`SELECT COUNT(*) as count FROM posts`).get();
if (postCheck.count === 0) {
    db.prepare(`INSERT INTO posts (type, category, title, location, contact, description, date, imageUrl, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        'lost', 'Electronics', 'Tecno Camon 19', 'Block T', '0712345678', 'It is located in Block T near the Lecture Hall.', '2026-08-30', null, 'Admin'
    );
}


// ================= ADMIN ROUTES =================

// API: Admin Login
// API: Admin Login (Inatumia Username na Password pekee kulingana na fomu yako)
// API: Admin Login Inayopokea Password au Passcode kwa urahisi
// API: Admin Login (Inatumia Username na Password pekee kulingana na fomu yako)
// API ya Admin Login
app.post('/api/auth/login', (req, res) => {
    try {
        // Tunapokea majina yote yanayoweza kutumwa na fomu tofauti tofauti
        const { regNumber, username, email, password, pass } = req.body;
        const identifier = (regNumber || username || email || '').trim();
        const passwordInput = (password || pass || '').trim();

        if (!identifier || !passwordInput) {
            return res.status(400).json({ success: false, message: 'Tafadhali jaza taarifa zote.' });
        }

        // Users table ina regNumber na fullName; username si column ya users.
        const stmt = db.prepare(`
            SELECT * FROM users 
            WHERE (LOWER(regNumber) = LOWER(?) OR LOWER(fullName) = LOWER(?))
            AND password = ?
        `);
        const user = stmt.get(identifier, identifier, passwordInput);

        if (user) {
            res.json({ success: true, message: 'Umeingia kwa mafanikio!', user });
        } else {
            res.status(401).json({ success: false, message: 'Namba ya usajili au nenosiri si sahihi.' });
        }
    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ success: false, message: 'Hitilafu ya server.' });
    }
});
// API: Admin Stats (Takwimu za Posti kutoka Database)
app.get('/api/admin/stats', (req, res) => {
    try {
        const rows = db.prepare(`SELECT type, COUNT(*) as count FROM posts GROUP BY type`).all();

        let total = 0;
        let lost = 0;
        let found = 0;
        let announcements = 0;

        rows.forEach(row => {
            total += row.count;
            if (row.type === 'lost') lost = row.count;
            if (row.type === 'found') found = row.count;
            if (row.type === 'announcement' || row.type === 'opportunity') announcements += row.count;
        });

        res.json({
            success: true,
            stats: { total, lost, found, announcements }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Hitilafu ya server.' });
    }
});


// ================= USER AUTH ROUTES =================

// API: User Registration
app.post('/api/auth/register', (req, res) => {
    try {
        const { fullName, regNumber, role, password } = req.body;
        
        const existingUser = db.prepare(`SELECT * FROM users WHERE regNumber = ?`).get(regNumber);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Namba hii ya usajili imeshajisajiliwa tayari!' });
        }

        const stmt = db.prepare(`INSERT INTO users (fullName, regNumber, role, password) VALUES (?, ?, ?, ?)`);
        stmt.run(fullName, regNumber, role, password);

        res.json({ 
            success: true, 
            message: 'Umejisajili kikamilifu! Sasa unaweza kuingia.', 
            user: { fullName, role, regNumber } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Imeshindwa kujisajili.' });
    }
});

// API: User Login
// API: Admin Login Iliyoboreshwa Zaidi
app.post('/api/admin/login', (req, res) => {
    try {
        console.log('Data zilizotoka kwenye form:', req.body); // Hii itatusaidia kuona kinachotoka kwenye website
        const { username, password, passcode } = req.body;
        
        // Ruhusu kuingia kama username ni 'will' na password au passcode ni '5821' au 'MUST@2026'
        const inputUser = (username || '').trim().toLowerCase();
        const inputPass = (password || passcode || '').trim();

        const stmt = db.prepare(`SELECT * FROM admins WHERE LOWER(username) = ? AND (password = ? OR passcode = ?)`);
        let admin = stmt.get(inputUser, inputPass, inputPass);

        if (admin) {
            res.json({ success: true, message: 'Imefanikiwa kuingia kama Admin!' });
        } else {
            res.status(401).json({ success: false, message: 'Taarifa za Admin au Secret Code si sahihi!' });
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'Hitilafu ya server.' });
    }
});


// ================= POSTS ROUTES =================

// API: Pata Posti zote kutoka SQLite
app.get('/api/posts', (req, res) => {
    try {
        const rows = db.prepare(`SELECT * FROM posts ORDER BY id DESC`).all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Imeshindwa kupata posti.' });
    }
});

// API: Kuweka Posti mpya kwenye SQLite
app.post('/api/posts', upload.single('image'), (req, res) => {
    try {
        const { type, category, title, location, contact, description, author } = req.body;
        let imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const date = new Date().toISOString().split('T')[0];

        const stmt = db.prepare(`INSERT INTO posts (type, category, title, location, contact, description, date, imageUrl, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        
        const info = stmt.run(
            type || 'lost',
            category || 'Other',
            title || 'Hakuna Kichwa',
            location || 'MUST Campus',
            contact || '0700000000',
            description || '',
            date,
            imageUrl,
            author || 'Mtumiaji wa Kawaida'
        );

        const newPost = {
            id: info.lastInsertRowid,
            type: type || 'lost',
            category: category || 'Other',
            title: title || 'Hakuna Kichwa',
            location: location || 'MUST Campus',
            contact: contact || '0700000000',
            description: description || '',
            date: date,
            imageUrl: imageUrl,
            author: author || 'Mtumiaji wa Kawaida'
        };

        res.json({ success: true, message: 'Posti yako imewekwa hewani kwa mafanikio!', data: newPost });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Hitilafu kwenye server.' });
    }
});

// API: Ondoa posti iliyotatuliwa
app.put('/api/posts/:id/solve', (req, res) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isInteger(postId)) {
            return res.status(400).json({ success: false, message: 'ID ya posti si sahihi.' });
        }

        const result = db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId);
        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: 'Posti haijapatikana.' });
        }

        res.json({ success: true, message: 'Posti imetatuliwa.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Imeshindwa kusolve posti.' });
    }
});

// API: Futa Posti
app.delete('/api/posts/:id', (req, res) => {
    try {
        const postId = Number(req.params.id);
        db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId);
        res.json({ success: true, message: 'Posti imefutwa.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Imeshindwa kufuta posti.' });
    }
});

// Anzisha Server
app.listen(PORT, () => {
    console.log(`MUST Hub Backend (SQLite) inakimbia kwenye port ${PORT}`);
});