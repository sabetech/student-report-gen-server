const pool = require('./db');

async function checkStaff() {
    try {
        const [rows] = await pool.query('SELECT id, name, email FROM staff');
        console.log('Current staff in database:');
        console.table(rows);
        process.exit(0);
    } catch (error) {
        console.error('Error checking staff:', error);
        process.exit(1);
    }
}

checkStaff();
