const pool = require('./db');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function setup() {
    try {
        console.log('Starting migration for exam_config_subjects...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS exam_config_subjects (
                config_id INT NOT NULL,
                subject_id INT NOT NULL,
                PRIMARY KEY (config_id, subject_id),
                FOREIGN KEY (config_id) REFERENCES exam_configurations(id) ON DELETE CASCADE,
                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
            )
        `);
        console.log('Created table: exam_config_subjects');

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

setup();
