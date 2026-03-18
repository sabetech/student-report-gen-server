require('dotenv').config({ path: './server/.env' });
const pool = require('./db');

async function checkSchema() {
    try {
        const [rows] = await pool.query('DESCRIBE staff');
        console.log('Staff table schema:');
        console.table(rows);
        process.exit(0);
    } catch (error) {
        console.error('Error checking schema:', error);
        process.exit(1);
    }
}

checkSchema();
