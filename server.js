const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'votre_secret_jwt_changez_moi_en_production';

// Middlewares
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

        // Pour le moment, on vérifie juste le mot de passe admin
        // Plus tard, on pourra vérifier dans la table users
        if (password === 'admin123') {
            const token = jwt.sign(
                { id: 1, email: 'admin@whisky.com', role: 'admin' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                token,
                user: { id: 1, email: 'admin@whisky.com', role: 'admin' }
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
// ROUTES WHISKIES MISES À JOUR
// À remplacer dans server.js (lignes 76-136 environ)
// ============================================

// Récupérer tous les whiskies
app.get('/api/whiskies', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT w.*, d.name as distillery_name 
            FROM whiskies w
            LEFT JOIN distilleries d ON w.distillery_id = d.id
            WHERE w.actif = TRUE
            ORDER BY w.date_ajout DESC
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
            country, 
            price, 
            affiliate_link_1, 
            affiliate_link_2, 
            affiliate_link_3, 
            description 
        } = req.body;
        
        const [result] = await pool.execute(
            `INSERT INTO whiskies (name, distillery_id, type, country, price, description, affiliate_link_1, affiliate_link_2, affiliate_link_3, actif) 
             VALUES (?, ?, 'Single Malt', ?, ?, ?, ?, ?, ?, TRUE)`,
            [name, distillery_id, country, price, description, affiliate_link_1, affiliate_link_2, affiliate_link_3]
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
            country, 
            price, 
            affiliate_link_1, 
            affiliate_link_2, 
            affiliate_link_3, 
            description 
        } = req.body;
        
        await pool.execute(
            `UPDATE whiskies 
             SET name=?, distillery_id=?, country=?, price=?, description=?, 
                 affiliate_link_1=?, affiliate_link_2=?, affiliate_link_3=?
             WHERE id=?`,
            [name, distillery_id, country, price, description, affiliate_link_1, affiliate_link_2, affiliate_link_3, req.params.id]
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
        await pool.execute('DELETE FROM whiskies WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur suppression whisky:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// ============================================
// ROUTES DISTILLERIES (Ajout de PUT et DELETE)
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
        const { name, country, region, founded, description, logo, site_web } = req.body;
        
        const [result] = await pool.execute(
            `INSERT INTO distilleries (name, country, region, founded, description, logo, site_web) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, country, region, founded, description, logo, site_web]
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
        const { name, country, region, founded, description, logo, site_web } = req.body;
        
        await pool.execute(
            `UPDATE distilleries 
             SET name=?, country=?, region=?, founded=?, description=?, logo=?, site_web=?
             WHERE id=?`,
            [name, country, region, founded, description, logo, site_web, req.params.id]
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
// ROUTES UPLOAD DE PHOTOS - À AJOUTER DANS server.js
// ============================================


// 3. Créer les dossiers d'upload s'ils n'existent pas
const uploadDir = path.join(__dirname, 'uploads');
const whiskiesDir = path.join(uploadDir, 'whiskies');
const annoncesDir = path.join(uploadDir, 'annonces');

[uploadDir, whiskiesDir, annoncesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Dossier créé: ${dir}`);
    }
});

// 4. Configuration de multer pour les whiskies
const whiskyStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, whiskiesDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `whisky-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const whiskyUpload = multer({
    storage: whiskyStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images (JPEG, PNG, WEBP) sont autorisées'));
        }
    }
});

// 5. Configuration de multer pour les annonces
const annonceStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, annoncesDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `annonce-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const annonceUpload = multer({
    storage: annonceStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images (JPEG, PNG, WEBP) sont autorisées'));
        }
    }
});

// 6. Servir les fichiers statiques (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================
// ROUTES IMPORT CSV - À AJOUTER DANS server.js
// ============================================


// 3. Configuration de multer pour les CSV
const csvStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `temp-${Date.now()}.csv`);
    }
});

const csvUpload = multer({
    storage: csvStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.csv') {
            cb(null, true);
        } else {
            cb(new Error('Seuls les fichiers CSV sont autorisés'));
        }
    }
});

// ============================================
// IMPORT CSV WHISKIES
// ============================================

app.post('/api/whiskies/import-csv', authenticateToken, csvUpload.single('csv'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier CSV fourni' });
    }

    const results = [];
    const errors = [];
    let lineNumber = 0;

    try {
        // Lire le fichier CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (data) => {
                    lineNumber++;
                    results.push({ ...data, lineNumber });
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📄 CSV lu: ${results.length} lignes`);

        // Traiter chaque ligne
        let imported = 0;
        let skipped = 0;

        for (const row of results) {
            try {
                // Validation des champs obligatoires
                if (!row.name || !row.distillery_name || !row.country) {
                    errors.push(`Ligne ${row.lineNumber}: Champs obligatoires manquants (name, distillery_name, country)`);
                    skipped++;
                    continue;
                }

                // Trouver ou créer la distillerie
                let distilleryId;
                const [existingDistillery] = await pool.execute(
                    'SELECT id FROM distilleries WHERE name = ?',
                    [row.distillery_name.trim()]
                );

                if (existingDistillery.length > 0) {
                    distilleryId = existingDistillery[0].id;
                } else {
                    // Créer la distillerie si elle n'existe pas
                    const [newDistillery] = await pool.execute(
                        'INSERT INTO distilleries (name, country) VALUES (?, ?)',
                        [row.distillery_name.trim(), row.country.trim()]
                    );
                    distilleryId = newDistillery.insertId;
                    console.log(`✅ Distillerie créée: ${row.distillery_name}`);
                }

                // Vérifier si le whisky existe déjà
                const [existingWhisky] = await pool.execute(
                    'SELECT id FROM whiskies WHERE name = ? AND distillery_id = ?',
                    [row.name.trim(), distilleryId]
                );

                if (existingWhisky.length > 0) {
                    errors.push(`Ligne ${row.lineNumber}: Whisky "${row.name}" existe déjà`);
                    skipped++;
                    continue;
                }

                // Insérer le whisky
                await pool.execute(
                    `INSERT INTO whiskies 
                    (name, distillery_id, type, country, age, abv, price, description, 
                     affiliate_link_1, affiliate_link_2, affiliate_link_3, actif) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
                    [
                        row.name.trim(),
                        distilleryId,
                        row.type?.trim() || 'Single Malt',
                        row.country.trim(),
                        row.age || null,
                        row.abv || null,
                        row.price || null,
                        row.description?.trim() || '',
                        row.affiliate_link_1?.trim() || null,
                        row.affiliate_link_2?.trim() || null,
                        row.affiliate_link_3?.trim() || null
                    ]
                );

                imported++;
                console.log(`✅ Whisky importé: ${row.name}`);

            } catch (error) {
                console.error(`❌ Erreur ligne ${row.lineNumber}:`, error.message);
                errors.push(`Ligne ${row.lineNumber}: ${error.message}`);
                skipped++;
            }
        }

        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: `Import terminé: ${imported} whiskies importés, ${skipped} ignorés`,
            imported,
            skipped,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('❌ Erreur import CSV:', error);
        // Nettoyer le fichier temporaire en cas d'erreur
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ 
            error: 'Erreur lors de l\'import CSV',
            details: error.message 
        });
    }
});

// ============================================
// IMPORT CSV DISTILLERIES
// ============================================

app.post('/api/distilleries/import-csv', authenticateToken, csvUpload.single('csv'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier CSV fourni' });
    }

    const results = [];
    const errors = [];
    let lineNumber = 0;

    try {
        // Lire le fichier CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(req.file.path)
                .pipe(csv())
                .on('data', (data) => {
                    lineNumber++;
                    results.push({ ...data, lineNumber });
                })
                .on('end', resolve)
                .on('error', reject);
        });

        console.log(`📄 CSV lu: ${results.length} lignes`);

        let imported = 0;
        let updated = 0;
        let skipped = 0;

        for (const row of results) {
            try {
                // Validation des champs obligatoires
                if (!row.name || !row.country) {
                    errors.push(`Ligne ${row.lineNumber}: Champs obligatoires manquants (name, country)`);
                    skipped++;
                    continue;
                }

                // Vérifier si la distillerie existe déjà
                const [existing] = await pool.execute(
                    'SELECT id FROM distilleries WHERE name = ?',
                    [row.name.trim()]
                );

                if (existing.length > 0) {
                    // Mettre à jour la distillerie existante
                    await pool.execute(
                        `UPDATE distilleries 
                        SET country=?, region=?, founded=?, description=?, logo=?, site_web=?
                        WHERE id=?`,
                        [
                            row.country.trim(),
                            row.region?.trim() || null,
                            row.founded || null,
                            row.description?.trim() || null,
                            row.logo?.trim() || null,
                            row.site_web?.trim() || null,
                            existing[0].id
                        ]
                    );
                    updated++;
                    console.log(`🔄 Distillerie mise à jour: ${row.name}`);
                } else {
                    // Insérer nouvelle distillerie
                    await pool.execute(
                        `INSERT INTO distilleries 
                        (name, country, region, founded, description, logo, site_web) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            row.name.trim(),
                            row.country.trim(),
                            row.region?.trim() || null,
                            row.founded || null,
                            row.description?.trim() || null,
                            row.logo?.trim() || null,
                            row.site_web?.trim() || null
                        ]
                    );
                    imported++;
                    console.log(`✅ Distillerie importée: ${row.name}`);
                }

            } catch (error) {
                console.error(`❌ Erreur ligne ${row.lineNumber}:`, error.message);
                errors.push(`Ligne ${row.lineNumber}: ${error.message}`);
                skipped++;
            }
        }

        // Supprimer le fichier temporaire
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: `Import terminé: ${imported} créées, ${updated} mises à jour, ${skipped} ignorées`,
            imported,
            updated,
            skipped,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('❌ Erreur import CSV:', error);
        // Nettoyer le fichier temporaire
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ 
            error: 'Erreur lors de l\'import CSV',
            details: error.message 
        });
    }
});

console.log('✅ Routes import CSV configurées');
// ============================================
// ROUTES UPLOAD WHISKIES
// ============================================

// Upload photo whisky
app.post('/api/whiskies/upload', authenticateToken, whiskyUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier envoyé' });
        }
        
        const photoUrl = `/uploads/whiskies/${req.file.filename}`;
        res.json({ success: true, photoUrl });
    } catch (error) {
        console.error('❌ Erreur upload photo whisky:', error);
        res.status(500).json({ error: 'Erreur lors de l\'upload' });
    }
});

// Supprimer photo whisky
app.delete('/api/whiskies/photo/:filename', authenticateToken, async (req, res) => {
    try {
        const filePath = path.join(whiskiesDir, req.params.filename);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Fichier non trouvé' });
        }
    } catch (error) {
        console.error('❌ Erreur suppression photo:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// ============================================
// ROUTES UPLOAD ANNONCES
// ============================================

// Upload photo annonce
app.post('/api/annonces/upload', authenticateToken, annonceUpload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier envoyé' });
        }
        
        const photoUrl = `/uploads/annonces/${req.file.filename}`;
        res.json({ success: true, photoUrl });
    } catch (error) {
        console.error('❌ Erreur upload photo annonce:', error);
        res.status(500).json({ error: 'Erreur lors de l\'upload' });
    }
});

// Supprimer photo annonce
app.delete('/api/annonces/photo/:filename', authenticateToken, async (req, res) => {
    try {
        const filePath = path.join(annoncesDir, req.params.filename);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Fichier non trouvé' });
        }
    } catch (error) {
        console.error('❌ Erreur suppression photo:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// ============================================
// MODIFICATION DES ROUTES EXISTANTES
// ============================================

// MODIFIER la route POST /api/whiskies pour inclure la photo
app.post('/api/whiskies', authenticateToken, async (req, res) => {
    try {
        const { 
            name, 
            distillery_id, 
            country, 
            price, 
            affiliate_link_1, 
            affiliate_link_2, 
            affiliate_link_3, 
            description,
            photo // 👈 AJOUT
        } = req.body;
        
        const [result] = await pool.execute(
            `INSERT INTO whiskies (name, distillery_id, type, country, price, description, photo, affiliate_link_1, affiliate_link_2, affiliate_link_3, actif) 
             VALUES (?, ?, 'Single Malt', ?, ?, ?, ?, ?, ?, ?, TRUE)`,
            [name, distillery_id, country, price, description, photo, affiliate_link_1, affiliate_link_2, affiliate_link_3]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('❌ Erreur ajout whisky:', error);
        res.status(500).json({ error: 'Erreur lors de l\'ajout du whisky' });
    }
});

// MODIFIER la route PUT /api/whiskies/:id pour inclure la photo
app.put('/api/whiskies/:id', authenticateToken, async (req, res) => {
    try {
        const { 
            name, 
            distillery_id, 
            country, 
            price, 
            affiliate_link_1, 
            affiliate_link_2, 
            affiliate_link_3, 
            description,
            photo // 👈 AJOUT
        } = req.body;
        
        await pool.execute(
            `UPDATE whiskies 
             SET name=?, distillery_id=?, country=?, price=?, description=?, photo=?,
                 affiliate_link_1=?, affiliate_link_2=?, affiliate_link_3=?
             WHERE id=?`,
            [name, distillery_id, country, price, description, photo, affiliate_link_1, affiliate_link_2, affiliate_link_3, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur modification whisky:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    }
});

console.log('✅ Routes upload configurées');
console.log('📁 Dossier uploads:', uploadDir);


// ============================================
// ROUTES ANNONCES
// ============================================

// Récupérer toutes les annonces
app.get('/api/annonces', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT a.*, u.email as user_email 
            FROM annonces a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.date_creation DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur récupération annonces:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des annonces' });
    }
});

// Modifier le statut d'une annonce
app.put('/api/annonces/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        await pool.execute('UPDATE annonces SET status=? WHERE id=?', [status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur modification statut:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    }
});

// Supprimer une annonce
app.delete('/api/annonces/:id', authenticateToken, async (req, res) => {
    try {
        await pool.execute('DELETE FROM annonces WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur suppression annonce:', error);
        res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
});

// ============================================
// ROUTES CONCOURS
// ============================================

// Récupérer tous les concours
app.get('/api/concours', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM concours ORDER BY start_date DESC');
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération' });
    }
});

// Ajouter un concours
app.post('/api/concours', authenticateToken, async (req, res) => {
    try {
        const { title, description, start_date, end_date, photo, prize_description } = req.body;
        
        const [result] = await pool.execute(
            `INSERT INTO concours (title, description, start_date, end_date, photo, prize_description) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title, description, start_date, end_date, photo, prize_description]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de l\'ajout' });
    }
});

// Activer/Désactiver un concours
app.patch('/api/concours/:id/toggle', authenticateToken, async (req, res) => {
    try {
        await pool.execute('UPDATE concours SET active = NOT active WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    }
});

// ============================================
// ROUTES CONTENU DU SITE
// ============================================

// Récupérer le contenu
app.get('/api/site-content', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM site_content');
        res.json(rows);
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération' });
    }
});

// Modifier le contenu
app.put('/api/site-content/:cle', authenticateToken, async (req, res) => {
    try {
        const { valeur } = req.body;
        await pool.execute(
            'UPDATE site_content SET valeur=? WHERE cle=?',
            [valeur, req.params.cle]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({ error: 'Erreur lors de la modification' });
    }
});

// ============================================
// ROUTES STATISTIQUES
// ============================================

// Récupérer les statistiques du dashboard
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
    try {
        const [whiskies] = await pool.execute('SELECT COUNT(*) as total FROM whiskies WHERE actif = TRUE');
        const [distilleries] = await pool.execute('SELECT COUNT(*) as total FROM distilleries');
        const [annonces] = await pool.execute('SELECT COUNT(*) as total FROM annonces WHERE status = "active"');
        const [users] = await pool.execute('SELECT COUNT(*) as total FROM users');

        res.json({
            summary: {
                total_whiskies: whiskies[0].total,
                total_distilleries: distilleries[0].total,
                annonces_actives: annonces[0].total,
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
        message: 'API Whisky Admin - Serveur fonctionnel ✅',
        version: '1.0.0',
        database: 'whisky_admin',
        endpoints: {
            auth: '/api/auth/login, /api/auth/verify',
            whiskies: '/api/whiskies',
            distilleries: '/api/distilleries',
            annonces: '/api/annonces',
            concours: '/api/concours',
            content: '/api/site-content',
            stats: '/api/stats/dashboard'
        }
    });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log('🚀 Serveur API démarré sur le port', PORT);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log('📊 Dashboard: Prêt à recevoir les connexions');
    console.log('🗄️  Base de données: whisky_admin');
});

// Gestion des erreurs non capturées
process.on('unhandledRejection', (error) => {
    console.error('❌ Erreur non gérée:', error);
});