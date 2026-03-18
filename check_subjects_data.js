const pool = require('./db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function check() {
    try {
        const [rows] = await pool.query('SELECT * FROM subjects LIMIT 10');
        console.log('Sample subjects:');
        console.table(rows);
        process.exit(0);
    } catch (error) {
        console.error('Error checking subjects:', error);
        process.exit(1);
    }
}

check();
