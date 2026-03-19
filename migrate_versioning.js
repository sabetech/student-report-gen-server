const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./db');

async function migrate() {
    try {
        console.log('Starting migration for configuration versioning...');

        // 1. Drop the FK (MySQL requires this to drop the index it's using)
        try {
            console.log('Dropping foreign key...');
            await pool.query('ALTER TABLE exam_configurations DROP FOREIGN KEY exam_configurations_ibfk_1');
        } catch (e) {
            console.log('FK already dropped or different name:', e.message);
        }

        // 2. Remove UNIQUE constraint on class_id
        const [indexes] = await pool.query('SHOW INDEX FROM exam_configurations');
        const uniqueIndex = indexes.find(idx => idx.Column_name === 'class_id' && idx.Non_unique === 0);
        
        if (uniqueIndex) {
            console.log(`Dropping unique index: ${uniqueIndex.Key_name}`);
            await pool.query(`ALTER TABLE exam_configurations DROP INDEX ${uniqueIndex.Key_name}`);
        } else {
            console.log('No unique index found on class_id.');
        }

        // 3. Add version column
        const [columns] = await pool.query('SHOW COLUMNS FROM exam_configurations LIKE "version"');
        if (columns.length === 0) {
            console.log('Adding version column...');
            await pool.query('ALTER TABLE exam_configurations ADD COLUMN version INT(11) NOT NULL DEFAULT 1 AFTER class_id');
        } else {
            console.log('Version column already exists.');
        }

        // 4. Add NON-UNIQUE index on class_id (required for FK)
        console.log('Adding non-unique index on class_id...');
        await pool.query('ALTER TABLE exam_configurations ADD INDEX idx_class_id (class_id)');

        // 5. Re-add the FK
        console.log('Re-adding foreign key...');
        await pool.query('ALTER TABLE exam_configurations ADD CONSTRAINT exam_configurations_ibfk_1 FOREIGN KEY (class_id) REFERENCES classes(id)');

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
