const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function setupClasses() {
    try {
        console.log('Setting up classes table...');

        // Create table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS classes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if classes already exist
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM classes');

        if (rows[0].count === 0) {
            console.log('Inserting sample classes...');
            const sampleClasses = [
                ['Basic 1'], ['Basic 2'], ['Basic 3'], ['Basic 4'], ['Basic 5'], ['Basic 6'],
                ['JHS 1'], ['JHS 2'], ['JHS 3'],
                ['SHS 1'], ['SHS 2'], ['SHS 3']
            ];

            await pool.query('INSERT INTO classes (class) VALUES ?', [sampleClasses]);
            console.log('Sample classes inserted successfully.');
        } else {
            console.log('Classes already exist, skipping insertion.');
        }

        console.log('Setup complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error setting up classes:', error);
        process.exit(1);
    }
}

setupClasses();
