const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3001; // ✅ CORRECTION : Utilise le PORT de l'environnement
const JWT_SECRET = process.env.JWT_SECRET || 'JadeCedric31';

// Ajoutez temporairement dans server.js
const https = require('https');
https.get('https://api.ipify.org?format=json', (resp) => {
  let data = '';
  resp.on('data', (chunk) => data += chunk);
  resp.on('end', () => console.log('🌐 IP de Render:', JSON.parse(data).ip));
});


// Middlewares
app.use(cors({
  origin: [
    'https://admin.societsky.com',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json()); // ✅ AJOUT
app.use(bodyParser.urlencoded({ extended: true })); // ✅ AJOUT
app.use(express.json()); // ✅ AJOUT (alternative moderne)

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide' });
        req.user = user;
        next();
    });
};

// ============================================
// ROUTES D'AUTHENTIFICATION
// ============================================

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { password } = req.body;
        console.log('🔐 Tentative de connexion');

        // Mot de passe admin simple
        if (password === 'societsky2025') { // ✅ Mot de passe mis à jour
            const token = jwt.sign(
                { id: 1, email: 'admin@societsky.com', role: 'admin' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token,
                user: { id: 1, email: 'admin@societsky.com', role: 'admin' }
            });
        } else {
            res.status(401).json({ error: 'Mot de passe incorrect' });
        }
    } catch (error) {
        console.error('❌ Erreur login:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Vérifier le token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ============================================
// ROUTES WHISKIES
// ============================================

// Récupérer tous les whiskies
app.get('/api/whiskies', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT w.*, d.name as distillery_name 
            FROM catalogue_whiskies w
            LEFT JOIN distilleries d ON w.distillery_id = d.id
            WHERE w.status = 'active'
            ORDER BY w.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur récupération whiskies:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des whiskies' });
    }
});

// Ajouter un whisky
app.post('/api/whiskies', authenticateToken, async (req, res) => {
    try {
        const { 
            name, 
            distillery_id, 
            type,
            age,
            abv,
            description,
            photo_url,
            affiliate_url_1,
            affiliate_price_1,
            affiliate_url_2,
            affiliate_price_2,
            affiliate_url_3,
            affiliate_price_3
        } = req.body;
        
        const [result] = await pool.execute(
            `INSERT INTO catalogue_whiskies (
                name, distillery_id, type, age, abv, description, photo_url,
                affiliate_url_1, affiliate_price_1,
                affiliate_url_2, affiliate_price_2,
                affiliate_url_3, affiliate_price_3,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
            [
                name, distillery_id, type, age, abv, description, photo_url,
                affiliate_url_1, affiliate_price_1,
                affiliate_url_2, affiliate_price_2,
                affiliate_url_3, affiliate_price_3
            ]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('❌ Erreur ajout whisky:', error);
        res.status(500).json({ error: 'Erreur lors de l\'ajout du whisky' });
    }
});

// Modifier un whisky
app.put('/api/whiskies/:id', authenticateToken, async (req, res) => {
    try {
        const { 
            name, 
            distillery_id, 
            type,
            age,
            abv,
            description,
            photo_url,
            affiliate_url_1,
            affiliate_price_1,
            affiliate_url_2,
            affiliate_price_2,
            affiliate_url_3,
            affiliate_price_3
        } = req.body;
        
        await pool.execute(
            `UPDATE catalogue_whiskies 
             SET name=?, distillery_id=?, type=?, age=?, abv=?, description=?, photo_url=?,
                 affiliate_url_1=?, affiliate_price_1=?,
                 affiliate_url_2=?, affiliate_price_2=?,
                 affiliate_url_3=?, affiliate_price_3=?
             WHERE id=?`,
            [
                name, distillery_id, type, age, abv, description, photo_url,
                affiliate_url_1, affiliate_price_1,
                affiliate_url_2, affiliate_price_2,
                affiliate_url_3, affiliate_price_3,
                req.params.id
            ]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur modification whisky:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    }
});

// Supprimer un whisky
app.delete('/api/whiskies/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM catalogue_whiskies WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur suppression whisky:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// ============================================
// ROUTES DISTILLERIES
// ============================================

// Récupérer toutes les distilleries
app.get('/api/distilleries', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM distilleries ORDER BY name');
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur récupération distilleries:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des distilleries' });
    }
});

// Ajouter une distillerie
app.post('/api/distilleries', authenticateToken, async (req, res) => {
    try {
        const { name, country, region, founded_year, description, logo_url, website } = req.body;
        
        const [result] = await pool.execute(
            `INSERT INTO distilleries (name, country, region, founded_year, description, logo_url, website) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, country, region, founded_year, description, logo_url, website]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('❌ Erreur ajout distillerie:', error);
        res.status(500).json({ error: 'Erreur lors de l\'ajout de la distillerie' });
    }
});

// Modifier une distillerie
app.put('/api/distilleries/:id', authenticateToken, async (req, res) => {
    try {
        const { name, country, region, founded_year, description, logo_url, website } = req.body;
        
        await pool.execute(
            `UPDATE distilleries 
             SET name=?, country=?, region=?, founded_year=?, description=?, logo_url=?, website=?
             WHERE id=?`,
            [name, country, region, founded_year, description, logo_url, website, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur modification distillerie:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    }
});

// Supprimer une distillerie
app.delete('/api/distilleries/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM distilleries WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur suppression distillerie:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// ============================================
// ROUTES STATISTIQUES
// ============================================

app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
    try {
        const [whiskies] = await pool.execute('SELECT COUNT(*) as total FROM catalogue_whiskies WHERE status = "active"');
        const [distilleries] = await pool.execute('SELECT COUNT(*) as total FROM distilleries');
        const [users] = await pool.execute('SELECT COUNT(*) as total FROM users');

        res.json({
            summary: {
                total_whiskies: whiskies[0].total,
                total_distilleries: distilleries[0].total,
                total_users: users[0].total
            }
        });
    } catch (error) {
        console.error('❌ Erreur stats:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
    }
});

// ============================================
// ROUTE PAR DÉFAUT
// ============================================

app.get('/', (req, res) => {
    res.json({ 
        message: '🥃 API Societsky - Serveur fonctionnel ✅',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth/login, /api/auth/verify',
            whiskies: '/api/whiskies',
            distilleries: '/api/distilleries',
            stats: '/api/stats/dashboard'
        },
        status: 'online'
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Serveur API Societsky démarré');
    console.log(`🔗 Port: ${PORT}`);
    console.log('📊 Dashboard: Prêt');
    console.log('🗄️  Base de données: Connectée');
});

// Gestion des erreurs
process.on('unhandledRejection', (error) => {
    console.error('❌ Erreur non gérée:', error);
});