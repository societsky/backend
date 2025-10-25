const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// 🔥 CONFIGURATION CRITIQUE - NE PAS MODIFIER L'ORDRE
// ============================================

// 1. CORS en premier
app.use(cors({
    origin: ['https://admin.societsky.com', 'http://localhost:3000'],
    credentials: true
}));

// 2. Body parsers AVANT les routes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Logs pour debug
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.path}`);
    next();
});

// ============================================
// CONFIGURATION BASE DE DONNÉES
// ============================================

const pool = mysql.createPool({
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT || 3306,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 60000, // 60 secondes
    timezone: 'Z'
});

// Test de connexion au démarrage
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Base de données: Connectée');
        console.log('📊 Database:', process.env.DATABASE_NAME);
        console.log('👤 User:', process.env.DATABASE_USER);
        connection.release();
    } catch (error) {
        console.error('❌ Erreur de connexion à MySQL:');
        console.error('Host:', process.env.DATABASE_HOST);
        console.error('User:', process.env.DATABASE_USER);
        console.error('Database:', process.env.DATABASE_NAME);
        console.error('Error:', error.message);
    }
})();

// ============================================
// MIDDLEWARE D'AUTHENTIFICATION
// ============================================

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token invalide' });
        }
        req.user = user;
        next();
    });
};

// ============================================
// CONFIGURATION MULTER POUR UPLOAD
// ============================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Seules les images sont autorisées'));
        }
    }
});

// ============================================
// ROUTES - AUTH
// ============================================

// Route de test
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 Serveur API Societsky démarré',
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
    console.log('🔐 Tentative de login...');
    console.log('Body reçu:', req.body);

    try {
        const { password } = req.body;

        if (!password) {
            console.log('❌ Mot de passe manquant');
            return res.status(400).json({ message: 'Mot de passe requis' });
        }

        // Récupérer l'admin
        const [users] = await pool.query(
            'SELECT * FROM users WHERE role = ? LIMIT 1',
            ['admin']
        );

        if (users.length === 0) {
            console.log('❌ Aucun admin trouvé');
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }

        const admin = users[0];
        console.log('👤 Admin trouvé:', admin.username);

        // Vérifier le mot de passe
        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            console.log('❌ Mot de passe incorrect');
            return res.status(401).json({ message: 'Mot de passe incorrect' });
        }

        // Générer le token JWT
        const token = jwt.sign(
            { 
                id: admin.id, 
                username: admin.username, 
                role: admin.role 
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('✅ Login réussi pour', admin.username);

        res.json({
            message: 'Connexion réussie',
            token,
            user: {
                id: admin.id,
                username: admin.username,
                role: admin.role
            }
        });

    } catch (error) {
        console.error('❌ Erreur login:', error);
        res.status(500).json({ 
            message: 'Erreur serveur', 
            error: error.message 
        });
    }
});

// VERIFY TOKEN
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ 
        valid: true, 
        user: req.user 
    });
});

// ============================================
// ROUTES - WHISKIES
// ============================================

// GET tous les whiskies
app.get('/api/whiskies', authenticateToken, async (req, res) => {
    try {
        const [whiskies] = await pool.query(`
            SELECT w.*, d.name as distillery_name 
            FROM whiskies w
            LEFT JOIN distilleries d ON w.distillery_id = d.id
            ORDER BY w.created_at DESC
        `);
        res.json(whiskies);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// GET un whisky par ID
app.get('/api/whiskies/:id', authenticateToken, async (req, res) => {
    try {
        const [whiskies] = await pool.query(
            'SELECT w.*, d.name as distillery_name FROM whiskies w LEFT JOIN distilleries d ON w.distillery_id = d.id WHERE w.id = ?',
            [req.params.id]
        );
        
        if (whiskies.length === 0) {
            return res.status(404).json({ message: 'Whisky non trouvé' });
        }
        
        res.json(whiskies[0]);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// CREATE whisky
app.post('/api/whiskies', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        const { name, distillery_id, type, country, age, abv, price, description, affiliate_link_1, affiliate_link_2, affiliate_link_3 } = req.body;
        const photo = req.file ? `/uploads/${req.file.filename}` : null;

        const [result] = await pool.query(
            `INSERT INTO whiskies (name, distillery_id, type, country, age, abv, price, description, photo, affiliate_link_1, affiliate_link_2, affiliate_link_3) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, distillery_id || null, type, country, age || null, abv || null, price || null, description, photo, affiliate_link_1 || null, affiliate_link_2 || null, affiliate_link_3 || null]
        );

        res.status(201).json({ 
            message: 'Whisky créé avec succès', 
            id: result.insertId 
        });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// UPDATE whisky
app.put('/api/whiskies/:id', authenticateToken, upload.single('photo'), async (req, res) => {
    try {
        const { name, distillery_id, type, country, age, abv, price, description, affiliate_link_1, affiliate_link_2, affiliate_link_3 } = req.body;
        const photo = req.file ? `/uploads/${req.file.filename}` : undefined;

        let query = `UPDATE whiskies SET name = ?, distillery_id = ?, type = ?, country = ?, age = ?, abv = ?, price = ?, description = ?, affiliate_link_1 = ?, affiliate_link_2 = ?, affiliate_link_3 = ?`;
        let params = [name, distillery_id || null, type, country, age || null, abv || null, price || null, description, affiliate_link_1 || null, affiliate_link_2 || null, affiliate_link_3 || null];

        if (photo) {
            query += `, photo = ?`;
            params.push(photo);
        }

        query += ` WHERE id = ?`;
        params.push(req.params.id);

        await pool.query(query, params);

        res.json({ message: 'Whisky mis à jour avec succès' });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// DELETE whisky
app.delete('/api/whiskies/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM whiskies WHERE id = ?', [req.params.id]);
        res.json({ message: 'Whisky supprimé avec succès' });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// ============================================
// ROUTES - DISTILLERIES
// ============================================

app.get('/api/distilleries', authenticateToken, async (req, res) => {
    try {
        const [distilleries] = await pool.query('SELECT * FROM distilleries ORDER BY name');
        res.json(distilleries);
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

app.post('/api/distilleries', authenticateToken, async (req, res) => {
    try {
        const { name, country, region, founded, description, logo, site_web } = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO distilleries (name, country, region, founded, description, logo, site_web) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, country, region, founded || null, description, logo, site_web]
        );

        res.status(201).json({ 
            message: 'Distillerie créée avec succès', 
            id: result.insertId 
        });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// ============================================
// SERVEUR STATIQUE POUR LES UPLOADS
// ============================================

app.use('/uploads', express.static('uploads'));

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

app.listen(PORT, () => {
    console.log('🚀 Serveur API Societsky démarré');
    console.log(`🔗 Port: ${PORT}`);
    console.log(`📊 Dashboard: Prêt`);
    
    // Afficher l'IP de Render pour debug
    const https = require('https');
    https.get('https://api.ipify.org?format=json', (resp) => {
        let data = '';
        resp.on('data', (chunk) => data += chunk);
        resp.on('end', () => {
            try {
                console.log('🌐 IP de Render:', JSON.parse(data).ip);
            } catch (e) {
                // Ignorer les erreurs de parsing
            }
        });
    }).on('error', () => {
        // Ignorer les erreurs réseau
    });
});