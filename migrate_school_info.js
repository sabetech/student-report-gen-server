const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function migrate() {
    try {
        console.log('Starting migration for school info...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS school_info (
                id INT(11) PRIMARY KEY DEFAULT 1,
                name VARCHAR(255) NOT NULL,
                contact_numbers VARCHAR(255),
                post_address TEXT,
                email VARCHAR(255),
                website VARCHAR(255),
                logo_url TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Insert default row if not exists
        const [rows] = await pool.query('SELECT id FROM school_info WHERE id = 1');
        if (rows.length === 0) {
            await pool.query(`
                INSERT INTO school_info (id, name, logo_url) 
                VALUES (1, 'St. Andrews Catholic School', 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&q=80&w=200&h=200')
            `);
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
