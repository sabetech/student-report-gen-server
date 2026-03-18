const pool = require('./db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function check() {
    try {
        const [rows] = await pool.query('DESCRIBE subjects');
        console.log('Subjects table structure:');
        console.table(rows);
        process.exit(0);
    } catch (error) {
        console.error('Error checking subjects table:', error);
        process.exit(1);
    }
}

check();
