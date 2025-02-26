const sql = require('mssql');

// Konfigurasikan database config sesuai dengan authentication configuration di machine kalian!
const config = {
    user: 'sa',
    password: 'test4321',
    server: 'HELIOS\\SQLEXPRESS',
    database: 'bioskop',
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};


async function connectToDatabase() {
    try {
        const pool = await sql.connect(config);
        console.log('Database connected');
        return pool;
    } catch (err) {
        console.error('Database connection failed', err);
        throw err;
    }
}

module.exports = { sql, connectToDatabase };