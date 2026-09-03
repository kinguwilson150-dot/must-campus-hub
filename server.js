const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// Hakikisha folda ya uploads ipo
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// Sanidi Multer kwa ajili ya kupokea picha
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ================= SETUP SQLITE DATABASE =================
const dbFile = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Hitilafu kwenye Database:', err.message);
    } else {
        console.log('Imeunganishwa na SQLite Database kwa mafanikio.');
    }
});

// Unda Tables kama hazipo na weka Admin wa kwanza
db.serialize(() => {
    // 1. Table ya Admins
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        password TEXT,
        passcode TEXT
    )`, () => {
        // Weka admin chaguo-msingi kama hana bado
        db.get(`SELECT COUNT(*) as count FROM admins`, (err, row) => {
            if (row.count === 0) {
                db.run(`INSERT INTO admins (username, password, passcode) VALUES (?, ?, ?)`, 
                ['admin', '123', 'MUST2026']);
            }
        });
    });

    // 2. Table ya Users (Wanafunzi na Staff)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT,
        regNumber TEXT UNIQUE,
        role TEXT,
        password TEXT
    )`);

    // 3. Table ya Posts (Posti zote)
    db.run(`CREATE TABLE IF NOT EXISTS posts (
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
    )`, () => {
        // Weka posti ya mfano kama table haina posti yoyote
        db.get(`SELECT COUNT(*) as count FROM posts`, (err, row) => {
            if (row.count === 0) {
                db.run(`INSERT INTO posts (type, category, title, location, contact, description, date, imageUrl, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ['lost', 'Electronics', 'Tecno Camon 19', 'Block T', '0712345678', 'It is located in Block T near the Lecture Hall.', '2026-08-30', null, 'Admin']);
            }
        });
    });
});


// ================= ADMIN ROUTES =================

// API: Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password, passcode } = req.body;
    
    let query = `SELECT * FROM admins WHERE (username = ? AND password = ?)`;
    let params = [username, password];

    if (passcode) {
        query = `SELECT * FROM admins WHERE (username = ? AND password = ?) OR passcode = ?`;
        params = [username, password, passcode];
    }

    db.get(query, params, (err, admin) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Hitilafu ya server.' });
        }
        if (admin) {
            res.json({ success: true, message: 'Imefanikiwa kuingia kama Admin!' });
        } else {
            res.status(401).json({ success: false, message: 'Taarifa za Admin au Secret Code si sahihi!' });
        }
    });
});

// API: Admin Stats (Takwimu za Posti kutoka Database)
app.get('/api/admin/stats', (req, res) => {
    db.all(`SELECT type, COUNT(*) as count FROM posts GROUP BY type`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Hitilafu ya server.' });
        }

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
    });
});


// ================= USER AUTH ROUTES =================

// API: User Registration
app.post('/api/auth/register', (req, res) => {
    const { fullName, regNumber, role, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE regNumber = ?`, [regNumber], (err, existingUser) => {
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Namba hii ya usajili imeshajisajiliwa tayari!' });
        }

        const query = `INSERT INTO users (fullName, regNumber, role, password) VALUES (?, ?, ?, ?)`;
        db.run(query, [fullName, regNumber, role, password], function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Imeshindwa kujisajili.' });
            }
            res.json({ 
                success: true, 
                message: 'Umejisajili kikamilifu! Sasa unaweza kuingia.', 
                user: { fullName, role, regNumber } 
            });
        });
    });
});

// API: User Login
app.post('/api/auth/login', (req, res) => {
    const { regNumber, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE regNumber = ? AND password = ?`, [regNumber, password], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ success: false, message: 'Namba ya usajili au password si sahihi!' });
        }

        res.json({ 
            success: true, 
            message: 'Umeingia vizuri!', 
            user: { fullName: user.fullName, role: user.role, regNumber: user.regNumber } 
        });
    });
});


// ================= POSTS ROUTES =================

// API: Pata Posti zote kutoka SQLite
app.get('/api/posts', (req, res) => {
    db.all(`SELECT * FROM posts ORDER BY id DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Imeshindwa kupata posti.' });
        }
        res.json({ success: true, data: rows });
    });
});

// API: Kuweka Posti mpya kwenye SQLite
app.post('/api/posts', upload.single('image'), (req, res) => {
    try {
        const { type, category, title, location, contact, description, author } = req.body;
        let imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const date = new Date().toISOString().split('T')[0];

        const query = `INSERT INTO posts (type, category, title, location, contact, description, date, imageUrl, author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [
            type || 'lost',
            category || 'Other',
            title || 'Hakuna Kichwa',
            location || 'MUST Campus',
            contact || '0700000000',
            description || '',
            date,
            imageUrl,
            author || 'Mtumiaji wa Kawaida'
        ];

        db.run(query, params, function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: 'Imeshindwa kuhifadhi posti.' });
            }

            // Rudisha posti mpya iliyotengenezwa
            const newPost = {
                id: this.lastID,
                type: params[0],
                category: params[1],
                title: params[2],
                location: params[3],
                contact: params[4],
                description: params[5],
                date: params[6],
                imageUrl: params[7],
                author: params[8]
            };

            res.json({ success: true, message: 'Posti yako imewekwa hewani kwa mafanikio!', data: newPost });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Hitilafu kwenye server.' });
    }
});

// API: Futa Posti
app.delete('/api/posts/:id', (req, res) => {
    const postId = Number(req.params.id);
    db.run(`DELETE FROM posts WHERE id = ?`, [postId], function(err) {
        if (err) {
            return res.status(500).json({ success: false, message: 'Imeshindwa kufuta posti.' });
        }
        res.json({ success: true, message: 'Posti imefutwa.' });
    });
});

// Anzisha Server
app.listen(PORT, () => {
    console.log(`MUST Hub Backend (SQLite) inakimbia kwenye port ${PORT}`);
});