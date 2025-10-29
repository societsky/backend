const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configuration base de données avec SSL
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Ajouter SSL si nécessaire
if (process.env.DB_SSL === 'true') {
    dbConfig.ssl = {
        rejectUnauthorized: true
    };
}

const pool = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token manquant' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token invalide' });
        }
        req.user = user;
        next();
    });
};

// Route de test
app.get('/', (req, res) => {
    res.json({ 
        message: 'API Societsky - Backend opérationnel',
        version: '2.0',
        endpoints: {
            public: [
                'GET /api/whiskies',
                'GET /api/whiskies/:id',
                'GET /api/distilleries',
                'GET /api/distilleries/:id'
            ],
            protected: [
                'POST /api/whiskies',
                'PUT /api/whiskies/:id',
                'DELETE /api/whiskies/:id',
                'POST /api/distilleries',
                'PUT /api/distilleries/:id',
                'DELETE /api/distilleries/:id'
            ]
        }
    });
});

// GET - Liste des whiskies (PUBLIC)
app.get('/api/whiskies', async (req, res) => {
    try {
        const [whiskies] = await pool.query(`
            SELECT 
                w.*,
                d.name as distillery_name,
                d.logo_url
            FROM whiskies_catalog w
            LEFT JOIN distilleries d ON w.distillery_id = d.id
            WHERE w.actif = true
            ORDER BY w.name ASC
        `);
        
        res.json(whiskies);
    } catch (error) {
        console.error('Erreur lors de la récupération des whiskies:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// GET - Un whisky spécifique (PUBLIC)
app.get('/api/whiskies/:id', async (req, res) => {
    try {
        const [whiskies] = await pool.query(`
            SELECT 
                w.*,
                d.name as distillery_name,
                d.logo_url,
                d.country as distillery_country
            FROM whiskies_catalog w
            LEFT JOIN distilleries d ON w.distillery_id = d.id
            WHERE w.id = ?
        `, [req.params.id]);

        if (whiskies.length === 0) {
            return res.status(404).json({ message: 'Whisky non trouvé' });
        }

        res.json(whiskies[0]);
    } catch (error) {
        console.error('Erreur lors de la récupération du whisky:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// GET - Liste des distilleries (PUBLIC)
app.get('/api/distilleries', async (req, res) => {
    try {
        const [distilleries] = await pool.query(`
            SELECT * FROM distilleries 
            ORDER BY name ASC
        `);
        
        res.json(distilleries);
    } catch (error) {
        console.error('Erreur lors de la récupération des distilleries:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// GET - Une distillerie spécifique (PUBLIC)
app.get('/api/distilleries/:id', async (req, res) => {
    try {
        const [distilleries] = await pool.query(
            'SELECT * FROM distilleries WHERE id = ?',
            [req.params.id]
        );

        if (distilleries.length === 0) {
            return res.status(404).json({ message: 'Distillerie non trouvée' });
        }

        res.json(distilleries[0]);
    } catch (error) {
        console.error('Erreur lors de la récupération de la distillerie:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// POST - Connexion admin
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [users] = await pool.query(
            'SELECT * FROM users WHERE username = ? AND role = ?',
            [username, 'admin']
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }

        const user = users[0];

        // Vérifier le mot de passe
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ message: 'Identifiants incorrects' });
        }

        // Générer le token JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Connexion réussie',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// POST - Créer un whisky (PROTÉGÉ)
app.post('/api/whiskies', authenticateToken, async (req, res) => {
    const {
        name,
        distillery_id,
        type,
        country,
        age,
        abv,
        price,
        description,
        photo,
        affiliate_link_1,
        merchant_name_1,
        affiliate_price_1,
        affiliate_link_2,
        merchant_name_2,
        affiliate_price_2,
        affiliate_link_3,
        merchant_name_3,
        affiliate_price_3,
        actif
    } = req.body;

    try {
        const [result] = await pool.query(`
            INSERT INTO whiskies_catalog 
            (name, distillery_id, type, country, age, abv, price, description, photo, 
             affiliate_link_1, merchant_name_1, affiliate_price_1,
             affiliate_link_2, merchant_name_2, affiliate_price_2,
             affiliate_link_3, merchant_name_3, affiliate_price_3,
             actif)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            distillery_id || null,
            type || null,
            country || null,
            age || null,
            abv || null,
            price || null,
            description || null,
            photo || null,
            affiliate_link_1 || null,
            merchant_name_1 || null,
            affiliate_price_1 || null,
            affiliate_link_2 || null,
            merchant_name_2 || null,
            affiliate_price_2 || null,
            affiliate_link_3 || null,
            merchant_name_3 || null,
            affiliate_price_3 || null,
            actif !== undefined ? actif : true
        ]);

        res.status(201).json({
            message: 'Whisky créé avec succès',
            id: result.insertId
        });
    } catch (error) {
        console.error('Erreur lors de la création du whisky:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// PUT - Modifier un whisky (PROTÉGÉ)
app.put('/api/whiskies/:id', authenticateToken, async (req, res) => {
    const {
        name,
        distillery_id,
        type,
        country,
        age,
        abv,
        price,
        description,
        photo,
        affiliate_link_1,
        merchant_name_1,
        affiliate_price_1,
        affiliate_link_2,
        merchant_name_2,
        affiliate_price_2,
        affiliate_link_3,
        merchant_name_3,
        affiliate_price_3,
        actif
    } = req.body;

    try {
        const [result] = await pool.query(`
            UPDATE whiskies_catalog 
            SET 
                name = ?,
                distillery_id = ?,
                type = ?,
                country = ?,
                age = ?,
                abv = ?,
                price = ?,
                description = ?,
                photo = ?,
                affiliate_link_1 = ?,
                merchant_name_1 = ?,
                affiliate_price_1 = ?,
                affiliate_link_2 = ?,
                merchant_name_2 = ?,
                affiliate_price_2 = ?,
                affiliate_link_3 = ?,
                merchant_name_3 = ?,
                affiliate_price_3 = ?,
                actif = ?
            WHERE id = ?
        `, [
            name,
            distillery_id || null,
            type || null,
            country || null,
            age || null,
            abv || null,
            price || null,
            description || null,
            photo || null,
            affiliate_link_1 || null,
            merchant_name_1 || null,
            affiliate_price_1 || null,
            affiliate_link_2 || null,
            merchant_name_2 || null,
            affiliate_price_2 || null,
            affiliate_link_3 || null,
            merchant_name_3 || null,
            affiliate_price_3 || null,
            actif !== undefined ? actif : true,
            req.params.id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Whisky non trouvé' });
        }

        res.json({ message: 'Whisky modifié avec succès' });
    } catch (error) {
        console.error('Erreur lors de la modification du whisky:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// DELETE - Supprimer un whisky (PROTÉGÉ)
app.delete('/api/whiskies/:id', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.query(
            'DELETE FROM whiskies_catalog WHERE id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Whisky non trouvé' });
        }

        res.json({ message: 'Whisky supprimé avec succès' });
    } catch (error) {
        console.error('Erreur lors de la suppression du whisky:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// POST - Créer une distillerie (PROTÉGÉ)
app.post('/api/distilleries', authenticateToken, async (req, res) => {
    const { name, country, region, description, logo_url, website } = req.body;

    try {
        const [result] = await pool.query(`
            INSERT INTO distilleries (name, country, region, description, logo_url, website)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [name, country || null, region || null, description || null, logo_url || null, website || null]);

        res.status(201).json({
            message: 'Distillerie créée avec succès',
            id: result.insertId
        });
    } catch (error) {
        console.error('Erreur lors de la création de la distillerie:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// PUT - Modifier une distillerie (PROTÉGÉ)
app.put('/api/distilleries/:id', authenticateToken, async (req, res) => {
    const { name, country, region, description, logo_url, website } = req.body;

    try {
        const [result] = await pool.query(`
            UPDATE distilleries 
            SET name = ?, country = ?, region = ?, description = ?, logo_url = ?, website = ?
            WHERE id = ?
        `, [name, country || null, region || null, description || null, logo_url || null, website || null, req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Distillerie non trouvée' });
        }

        res.json({ message: 'Distillerie modifiée avec succès' });
    } catch (error) {
        console.error('Erreur lors de la modification de la distillerie:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// DELETE - Supprimer une distillerie (PROTÉGÉ)
app.delete('/api/distilleries/:id', authenticateToken, async (req, res) => {
    try {
        const [result] = await pool.query(
            'DELETE FROM distilleries WHERE id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Distillerie non trouvée' });
        }

        res.json({ message: 'Distillerie supprimée avec succès' });
    } catch (error) {
        console.error('Erreur lors de la suppression de la distillerie:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// Routes pour compatibilité
app.get('/api/annonces', async (req, res) => {
    res.json([]);
});

app.get('/api/stats', async (req, res) => {
    try {
        const [whiskiesCount] = await pool.query('SELECT COUNT(*) as count FROM whiskies_catalog');
        const [distilleriesCount] = await pool.query('SELECT COUNT(*) as count FROM distilleries');
        const [usersCount] = await pool.query('SELECT COUNT(*) as count FROM users');

        res.json({
            whiskies: whiskiesCount[0].count,
            distilleries: distilleriesCount[0].count,
            users: usersCount[0].count,
            tastings: 0
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des stats:', error);
        res.status(500).json({ message: 'Erreur serveur', error: error.message });
    }
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ message: 'Route non trouvée' });
});

// Démarrage du serveur
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log('===========================================');
    console.log(`🚀 Serveur API Societsky démarré`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔌 Database: ${process.env.DB_HOST}`);
    console.log(`🔐 SSL: ${process.env.DB_SSL === 'true' ? 'Activé' : 'Désactivé'}`);
    console.log(`📖 Routes publiques disponibles`);
    console.log(`✅ Your service is live 🎉`);
    console.log('===========================================');
});
