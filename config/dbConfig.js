const sql = require('mssql');
const config = {
    user: 'sa',
    password: 'test4321',
    server: 'DESKTOP-SURLHIO',
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