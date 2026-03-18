const pool = require('./db');
const bcrypt = require('bcryptjs');

async function createStaff() {
    const name = 'Test User';
    const email = 'testuser@example.com';
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        // Check if user already exists
        const [existing] = await pool.query('SELECT id FROM staff WHERE email = ?', [email]);
        if (existing.length > 0) {
            console.log('Test user already exists. Updating password...');
            await pool.query('UPDATE staff SET password = ? WHERE email = ?', [hashedPassword, email]);
        } else {
            await pool.query('INSERT INTO staff (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
            console.log('Test user created successfully.');
        }
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        process.exit(0);
    } catch (error) {
        console.error('Error creating staff:', error);
        process.exit(1);
    }
}

createStaff();
