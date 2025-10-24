const mysql = require('mysql2/promise');

// Configuration de la connexion MySQL
const pool = mysql.createPool({
    host: 'poce1950.o2switch.net',
    user: 'poce1950_societsky_user',        // L'utilisateur créé dans le schema.sql
    password: 'jadecedricsimba31',      // Le mot de passe défini dans le schema.sql
    database: 'poce1950_societsky_db',  // ⚠️ La VRAIE base de données !
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test de la connexion
pool.getConnection()
    .then(connection => {
        console.log('✅ Connecté à la base de données MySQL (whisky_admin)');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Erreur de connexion à MySQL:', err.message);
        console.error('Vérifiez que :');
        console.error('1. XAMPP MySQL est démarré');
        console.error('2. La base "whisky_admin" existe');
        console.error('3. L\'utilisateur "whisky_app" existe avec les bons droits');
    });

module.exports = pool;