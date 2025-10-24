const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test de connexion
pool.getConnection()
  .then(connection => {
    console.log('✅ Base de données: Connectée');
    console.log(`📊 Database: ${process.env.DATABASE_NAME}`);
    console.log(`👤 User: ${process.env.DATABASE_USER}`);
    connection.release();
  })
  .catch(err => {
    console.error('❌ Erreur de connexion à MySQL:');
    console.error('Host:', process.env.DATABASE_HOST);
    console.error('User:', process.env.DATABASE_USER);
    console.error('Database:', process.env.DATABASE_NAME);
    console.error('Error:', err.message);
  });

module.exports = pool;