const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function setup() {
    try {
        console.log('Starting migration for student scores...');

        // student_subject_scores
        await pool.query(`
            CREATE TABLE IF NOT EXISTS student_subject_scores (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                config_id INT NOT NULL,
                subject_id INT NOT NULL,
                weight_id INT NOT NULL,
                score DECIMAL(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (config_id) REFERENCES exam_configurations(id) ON DELETE CASCADE,
                FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
                FOREIGN KEY (weight_id) REFERENCES assessment_weights(id) ON DELETE CASCADE,
                UNIQUE KEY unique_score (student_id, config_id, subject_id, weight_id)
            )
        `);
        console.log('Created table: student_subject_scores');

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

setup();
