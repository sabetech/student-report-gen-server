const pool = require('./db');

async function checkAllTables() {
    try {
        const [tables] = await pool.query('SHOW TABLES');
        for (const tableRow of tables) {
            const tableName = Object.values(tableRow)[0];
            console.log(`\n--- Schema for table: ${tableName} ---`);
            const [schema] = await pool.query(`DESCRIBE ${tableName}`);
            console.table(schema);
        }
        process.exit(0);
    } catch (error) {
        console.error('Error checking schema:', error);
        process.exit(1);
    }
}

checkAllTables();
