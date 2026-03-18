const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function setup() {
    try {
        console.log('Starting migration...');

        // 1. exam_configurations
        await pool.query(`
            CREATE TABLE IF NOT EXISTS exam_configurations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                class_id INT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
            )
        `);
        console.log('Created table: exam_configurations');

        // 2. assessment_weights
        await pool.query(`
            CREATE TABLE IF NOT EXISTS assessment_weights (
                id INT AUTO_INCREMENT PRIMARY KEY,
                config_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                weight_percent INT NOT NULL,
                FOREIGN KEY (config_id) REFERENCES exam_configurations(id) ON DELETE CASCADE
            )
        `);
        console.log('Created table: assessment_weights');

        // 3. grade_remarks
        await pool.query(`
            CREATE TABLE IF NOT EXISTS grade_remarks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                config_id INT NOT NULL,
                grade INT NOT NULL,
                remark_text TEXT NOT NULL,
                FOREIGN KEY (config_id) REFERENCES exam_configurations(id) ON DELETE CASCADE
            )
        `);
        console.log('Created table: grade_remarks');

        // 4. grading_scales
        await pool.query(`
            CREATE TABLE IF NOT EXISTS grading_scales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                config_id INT NOT NULL,
                grade INT NOT NULL,
                min_score INT NOT NULL,
                max_score INT NOT NULL,
                FOREIGN KEY (config_id) REFERENCES exam_configurations(id) ON DELETE CASCADE
            )
        `);
        console.log('Created table: grading_scales');

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

setup();
