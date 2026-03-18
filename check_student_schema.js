const pool = require('./db');

async function checkSpecificTables() {
    try {
        const tables = ['students', 'student_session', 'student_scores', 'exam_configurations', 'assessment_weights', 'grading_scales', 'grade_remarks'];
        for (const tableName of tables) {
            try {
                console.log(`\n--- Schema for table: ${tableName} ---`);
                const [schema] = await pool.query(`DESCRIBE ${tableName}`);
                console.table(schema);
            } catch (err) {
                console.log(`Table ${tableName} might not exist yet.`);
            }
        }
        process.exit(0);
    } catch (error) {
        console.error('Error checking schema:', error);
        process.exit(1);
    }
}

checkSpecificTables();
